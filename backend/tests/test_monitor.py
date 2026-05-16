import time

from monitor import TrafficMonitor


def test_inject_sample_updates_device_snapshot():
    monitor = TrafficMonitor()

    now = time.time()
    monitor.inject_sample("10.0.0.10", 2048, timestamp=now)
    monitor.inject_sample("10.0.0.10", 4096, timestamp=now + 0.1)

    snapshot = monitor.get_device_snapshot("10.0.0.10")

    assert snapshot["total_bytes"] == 6144
    assert snapshot["total_mb"] > 0
    assert snapshot["mbps"] > 0
    assert len(snapshot["history"]) == 2
