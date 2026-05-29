import os
import time
from backend.main import build_device_traffic_payload


def make_per(n):
    per = {}
    for i in range(n):
        ip = f"10.0.0.{i+1}"
        per[ip] = {
            'display_name': f'Device-{i+1}',
            'mbps': float(i % 10) + 0.5,
            'total_mb': float(i * 10),
            'total_bytes': i * 1000,
            'history': [],
        }
    return per


def make_rows(n):
    rows = []
    for i in range(n):
        rows.append({'ip': f"10.0.0.{i+1}", 'segment': 'iot'})
    return rows


def test_coalesce_summary_large_set(monkeypatch):
    # Force low threshold for test
    monkeypatch.setenv('DELTA_COALESCE_THRESHOLD', '5')
    monkeypatch.setenv('DELTA_COALESCE_TOP_N', '3')

    n = 10
    per = make_per(n)
    rows = make_rows(n)

    # Clear any PREV_DEVICE_SNAPSHOT by simulating first run
    payload, is_summary = build_device_traffic_payload(per, rows, mbps=123.45)

    assert payload is not None
    assert is_summary is True
    assert payload.get('summary') is True
    data = payload.get('data')
    assert 'per_segment' in data
    assert 'top_devices' in data
    assert len(data['top_devices']) <= 3
    assert data['total_mbps'] == round(123.45, 3)
