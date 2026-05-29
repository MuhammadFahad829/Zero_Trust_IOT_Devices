"""Helpers for computing canonical device display names.

This module is intentionally side-effect free so tests can import it without
starting background threads from `backend.main`.
"""
from typing import Dict

DEVICE_LABEL_FIELDS = ['display_name', 'name', 'hostname', 'device_name', 'alias', 'label']


def clean_text(val: str) -> str:
    try:
        s = str(val or '').strip()
        if not s:
            return ''
        if s.lower() in ('unknown', 'null', 'none', 'undefined'):
            return ''
        return s
    except Exception:
        return ''


def get_row_label(row: Dict) -> str:
    if not row:
        return ''
    for f in DEVICE_LABEL_FIELDS:
        v = clean_text(row.get(f))
        if v:
            return v
    return ''


def has_private_vendor_hint(vendor: str) -> bool:
    try:
        return bool(vendor) and any(x in str(vendor).lower() for x in ('private', 'randomized', 'unknown'))
    except Exception:
        return False


def get_name_suffix(row: Dict) -> str:
    mac = clean_text(row.get('mac'))
    ip = clean_text(row.get('ip'))
    mac_tail = mac.split(':')[-1] if mac else ''
    ip_tail = ip.split('.')[-1] if ip else ''
    return f" {mac_tail or ip_tail}" if (mac_tail or ip_tail) else ''


def compute_display_name(row: Dict) -> str:
    if not row:
        return 'Unknown Device'
    explicit = get_row_label(row)
    if explicit:
        return explicit
    vendor = clean_text(row.get('vendor'))
    device_type = clean_text(row.get('device_type'))
    suffix = get_name_suffix(row)
    if vendor and not has_private_vendor_hint(vendor):
        return f"{vendor} {device_type}".strip() + suffix
    if device_type:
        return f"{device_type}".strip() + suffix
    return f"Unknown Device{suffix}".strip()
