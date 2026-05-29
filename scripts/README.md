Benchmark scripts
=================

This folder contains simple benchmark helpers used during development.

benchmark_broadcast.py
----------------------
- Purpose: measure the time to compute per-device diffs and aggregated summaries
  using the backend `build_device_traffic_payload` helper.
- Usage:

```bash
python3 scripts/benchmark_broadcast.py --count 1000 --iters 20
```

Notes:
- The script sets `ZT_DISABLE_MONITOR=1` automatically so it is safe to run
  without root privileges.
- Tune `DELTA_COALESCE_THRESHOLD` and `DELTA_COALESCE_TOP_N` via env to
  observe behavior for different thresholds.
