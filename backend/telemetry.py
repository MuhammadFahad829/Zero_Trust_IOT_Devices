try:
    from prometheus_client import Counter, Gauge, Histogram, start_http_server
    import logging
    import os
    import random

    logging.getLogger('prometheus_client').setLevel(logging.WARNING)

    # Start server on module import (safe short port; metrics_exporter also uses 8001)
    try:
        start_http_server(8002)
    except Exception:
        pass

    # Metrics
    TOTAL_MBPS = Gauge('zerotrust_total_mbps_live', 'Live total MB/s observed by gateway')
    PACKETS_PROCESSED = Counter('zerotrust_packets_processed_total', 'Total IP packets processed by TrafficMonitor')
    DEVICE_MBPS = Gauge('zerotrust_device_mbps', 'Per-device MB/s', ['ip'])
    PACKET_PROC_LATENCY = Histogram('zerotrust_packet_proc_seconds', 'Packet processing latency seconds')

    def set_total_mbps(val: float):
        try:
            TOTAL_MBPS.set(val)
        except Exception:
            pass

    def inc_packet_processed(n: int = 1):
        try:
            # allow batched increments
            PACKETS_PROCESSED.inc(n)
        except Exception:
            pass

    def set_device_mbps(ip: str, val: float):
        try:
            DEVICE_MBPS.labels(ip=ip).set(val)
        except Exception:
            pass

    def observe_packet_latency(sec: float):
        try:
            # sampling to reduce high-rate histogram updates; default 1.0 = observe all
            sample_rate = float(os.getenv("ZEROTRUST_HISTOGRAM_SAMPLE_RATE", "1.0"))
            if sample_rate >= 1.0 or random.random() < sample_rate:
                PACKET_PROC_LATENCY.observe(sec)
        except Exception:
            pass
except Exception:
    # prometheus_client not available; provide no-op fallbacks
    def set_total_mbps(val: float):
        return

    def inc_packet_processed():
        return

    def set_device_mbps(ip: str, val: float):
        return

    def observe_packet_latency(sec: float):
        return
