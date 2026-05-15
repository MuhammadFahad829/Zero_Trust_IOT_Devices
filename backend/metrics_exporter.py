#!/usr/bin/env python3
"""Lightweight Prometheus exporter that scrapes local /traffic endpoint.

Run alongside the backend (optional):
  python3 backend/metrics_exporter.py
"""
import time
import logging

from prometheus_client import start_http_server, Gauge

try:
    import requests
except Exception:
    requests = None

logging.basicConfig(level=logging.INFO)


def run():
    g = Gauge('zerotrust_total_mbps', 'Total MB/s observed by gateway')
    start_http_server(8001)
    logging.info('Prometheus exporter started on :8001')
    while True:
        try:
            if requests:
                r = requests.get('http://127.0.0.1:8000/traffic', timeout=2)
                data = r.json()
                val = float(data.get('mbps', 0) or 0)
                g.set(val)
        except Exception:
            logging.debug('Could not scrape /traffic')
        time.sleep(5)


if __name__ == '__main__':
    run()
