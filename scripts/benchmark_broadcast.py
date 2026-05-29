#!/usr/bin/env python3
"""Benchmark harness for device broadcast/coalescing logic.

Usage:
  python3 scripts/benchmark_broadcast.py --count 1000 --iters 50

This script sets `ZT_DISABLE_MONITOR=1` to avoid starting raw-socket monitors
when importing the backend, then generates synthetic per-device snapshots and
measures the time taken by `build_device_traffic_payload` to produce either
partial diffs or aggregated summaries.
"""
import os
import time
import argparse
import random

# Disable monitor threads when importing backend
os.environ.setdefault('ZT_DISABLE_MONITOR', '1')

from backend.main import build_device_traffic_payload


def make_per(n):
    per = {}
    for i in range(n):
        ip = f"10.0.0.{i+1}"
        per[ip] = {
            'display_name': f'Device-{i+1}',
            'mbps': float(random.random() * 10.0),
            'total_mb': float(i * 5),
            'total_bytes': i * 1024,
            'history': [],
        }
    return per


def make_rows(n):
    rows = []
    for i in range(n):
        rows.append({'ip': f"10.0.0.{i+1}", 'segment': random.choice(['iot','work','guest','home'])})
    return rows


def run_once(count, mbps):
    per = make_per(count)
    rows = make_rows(count)
    t0 = time.perf_counter()
    payload, is_summary = build_device_traffic_payload(per, rows, mbps)
    t1 = time.perf_counter()
    return (t1 - t0), is_summary, (payload is not None)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--count', type=int, default=1000, help='number of devices to simulate')
    p.add_argument('--iters', type=int, default=20, help='number of iterations')
    p.add_argument('--mbps', type=float, default=123.45, help='total mbps to report')
    args = p.parse_args()

    timings = []
    summaries = 0
    produced = 0
    print(f"Running benchmark: count={args.count} iterations={args.iters}")
    for i in range(args.iters):
        t, is_summary, has_payload = run_once(args.count, args.mbps)
        timings.append(t)
        if is_summary:
            summaries += 1
        if has_payload:
            produced += 1
        if (i+1) % 10 == 0:
            print(f"  iter {i+1}/{args.iters}: {t*1000:.2f} ms summary={is_summary}")

    timings.sort()
    total = sum(timings)
    avg = total / len(timings)
    p50 = timings[len(timings)//2]
    p95 = timings[int(len(timings)*0.95)-1]
    print()
    print(f"Results over {args.iters} runs:")
    print(f"  avg: {avg*1000:.3f} ms, p50: {p50*1000:.3f} ms, p95: {p95*1000:.3f} ms")
    print(f"  summaries produced: {summaries}, payloads produced: {produced}")


if __name__ == '__main__':
    main()
