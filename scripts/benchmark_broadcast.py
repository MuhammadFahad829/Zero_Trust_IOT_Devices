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
import json
from statistics import mean

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
    p.add_argument('--count', type=int, help='number of devices to simulate (deprecated; use --counts)')
    p.add_argument('--counts', type=str, default='', help='comma-separated counts to sweep, e.g. 200,500,1000')
    p.add_argument('--iters', type=int, default=20, help='number of iterations per count')
    p.add_argument('--mbps', type=float, default=123.45, help='total mbps to report')
    p.add_argument('--outfile', type=str, default='', help='write JSON summary to this file')
    args = p.parse_args()

    # Build list of counts to run
    counts = []
    if args.count:
        counts.append(args.count)
    if args.counts:
        for part in args.counts.split(','):
            s = part.strip()
            if s:
                counts.append(int(s))
    if not counts:
        counts = [1000]

    results = []
    print(f"Running benchmark sweep: counts={counts} iterations={args.iters}")
    for c in counts:
        timings = []
        summaries = 0
        produced = 0
        for i in range(args.iters):
            t, is_summary, has_payload = run_once(c, args.mbps)
            timings.append(t)
            if is_summary:
                summaries += 1
            if has_payload:
                produced += 1
            if (i+1) % 10 == 0:
                print(f"  count {c} iter {i+1}/{args.iters}: {t*1000:.2f} ms summary={is_summary}")

        timings.sort()
        avg = mean(timings)
        p50 = timings[len(timings)//2]
        p95 = timings[int(len(timings)*0.95)-1]
        summary = {
            'count': c,
            'iters': args.iters,
            'mbps': args.mbps,
            'avg_ms': avg * 1000.0,
            'p50_ms': p50 * 1000.0,
            'p95_ms': p95 * 1000.0,
            'summaries': summaries,
            'payloads': produced,
        }
        results.append(summary)
        print()
        print(f"Results for count={c} over {args.iters} runs:")
        print(f"  avg: {summary['avg_ms']:.3f} ms, p50: {summary['p50_ms']:.3f} ms, p95: {summary['p95_ms']:.3f} ms")
        print(f"  summaries produced: {summaries}, payloads produced: {produced}")

    # Optionally write JSON summary
    if args.outfile:
        out = {
            'meta': {
                'counts': counts,
                'iters': args.iters,
                'mbps': args.mbps,
                'timestamp': int(time.time()),
            },
            'results': results,
        }
        with open(args.outfile, 'w') as fh:
            json.dump(out, fh, indent=2)
        print(f"Wrote JSON summary to {args.outfile}")


if __name__ == '__main__':
    main()
