try:
    from prometheus_client import Counter, Gauge, Histogram, start_http_server
    import logging

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

    def inc_packet_processed():
        try:
            PACKETS_PROCESSED.inc()
        except Exception:
            pass

    def set_device_mbps(ip: str, val: float):
        try:
            DEVICE_MBPS.labels(ip=ip).set(val)
        except Exception:
            pass

    def observe_packet_latency(sec: float):
        try:
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
