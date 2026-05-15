def detect_anomalies(traffic_samples: list):
    """Simple anomaly detection placeholder: flag if sudden jump in bytes."""
    alerts = []
    for i in range(1, len(traffic_samples)):
        prev = traffic_samples[i-1]
        cur = traffic_samples[i]
        if cur.get("rx_bytes", 0) > prev.get("rx_bytes", 0) * 5:
            alerts.append({"type": "bandwidth_spike", "sample": cur})
    return alerts
