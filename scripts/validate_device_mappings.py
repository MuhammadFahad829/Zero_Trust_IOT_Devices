#!/usr/bin/env python3
"""Validate backend device identity and segment mappings against sample records.

Usage:
  python3 scripts/validate_device_mappings.py
  python3 scripts/validate_device_mappings.py --samples PR_ASSETS/device_mapping_samples.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from orchestrator import _detect_device_type, _lookup_oui  # noqa: E402
from database import suggest_segment_for_device  # noqa: E402


def load_samples(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(ROOT / "PR_ASSETS" / "device_mapping_samples.json"))
    args = parser.parse_args()

    sample_path = Path(args.samples)
    samples = load_samples(sample_path)

    print(f"Loaded {len(samples)} sample devices from {sample_path}")
    print("ip\tvendor->resolved\tdevice_type->resolved\tsegment->resolved\tstatus")

    failures = 0
    for sample in samples:
        vendor_input = sample.get("vendor") or ""
        mac = sample.get("mac") or ""
        expected_segment = sample.get("expected_segment") or ""

        # Use the sample's vendor label as the canonical input for mapping checks.
        # For private/randomized cases, still exercise MAC OUI resolution.
        resolved_vendor = vendor_input
        if not resolved_vendor or resolved_vendor.lower() in ("private/randomized", "private device"):
            resolved_vendor = _lookup_oui(mac)

        resolved_type = _detect_device_type(resolved_vendor, mac)
        resolved_segment = suggest_segment_for_device(resolved_type, resolved_vendor)

        ok = (
            resolved_type.lower() == str(sample.get("device_type", "")).lower()
            and resolved_segment.lower() == expected_segment.lower()
            and resolved_vendor not in ("Unknown", "")
        )
        status = "OK" if ok else "MISMATCH"
        if not ok:
            failures += 1

        print(
            f"{sample.get('ip')}\t"
            f"{vendor_input} -> {resolved_vendor}\t"
            f"{sample.get('device_type')} -> {resolved_type}\t"
            f"{expected_segment} -> {resolved_segment}\t"
            f"{status}"
        )

    print(f"Failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
