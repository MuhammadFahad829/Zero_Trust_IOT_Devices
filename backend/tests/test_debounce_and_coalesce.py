import asyncio
import os
import time
import importlib

import pytest


# Note: we test `build_device_traffic_payload` directly below. Full-loop debouncing
# behavior is exercised by integration tests and manual smoke runs. The coalesce
# window logic is implemented in `traffic_broadcast_loop` using
# `DELTA_COALESCE_WINDOW_MS`.


def test_build_payload_triggers_summary(monkeypatch):
    # Ensure monitor/scanner passive mode for tests
    monkeypatch.setenv('ZT_DISABLE_MONITOR', '1')
    monkeypatch.setenv('DELTA_COALESCE_THRESHOLD', '2')

    import backend.main as main
    importlib.reload(main)

    device_count = 10
    device_rows = [{'ip': f'10.0.0.{i+1}', 'mac': f'aa:bb:cc:dd:ee:{i:02x}', 'vendor': 'Acme', 'device_type': 'Camera'} for i in range(device_count)]

    # Build a per snapshot with differing mbps for each device
    per = {}
    for i in range(device_count):
        ip = f'10.0.0.{i+1}'
        per[ip] = {'display_name': f'Device-{i+1}', 'mbps': float(i + 1), 'total_mb': i * 10.0, 'total_bytes': i * 1024, 'history': []}

    payload, is_summary = main.build_device_traffic_payload(per, device_rows, mbps=123.45)
    assert is_summary is True
    assert isinstance(payload, dict)
    assert payload.get('event') == 'DEVICES_TRAFFIC'
    assert payload.get('summary') is True
    data = payload.get('data')
    assert 'per_segment' in data and 'top_devices' in data and 'total_mbps' in data
