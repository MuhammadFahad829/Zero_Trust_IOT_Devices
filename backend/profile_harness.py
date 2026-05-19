"""Profiling harness to simulate traffic and collect cProfile stats.

Usage:
  python3 backend/profile_harness.py --duration 10 --clients 50 --rate 100

Generates `profile_stats.prof` in the repo root.
"""
import argparse
import cProfile
import pstats
import random
import time
import os

from monitor import TrafficMonitor


def simulate_monitor(duration: int = 10, clients: int = 20, rate: int = 50):
    m = TrafficMonitor(interface="lo")
    # inject synthetic traffic: clients each send `rate` packets per second
    end = time.time() + duration
    ips = [f"10.0.0.{i+10}" for i in range(clients)]
    while time.time() < end:
        for ip in ips:
            # random packet size between 64 and 1500
            sz = random.randint(64, 1500)
            m.inject_sample(ip, sz, time.time())
        time.sleep(1.0 / max(1, int(rate)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=10)
    parser.add_argument("--clients", type=int, default=20)
    parser.add_argument("--rate", type=int, default=50, help="approx packets/sec per loop iteration")
    args = parser.parse_args()

    out = os.path.join(os.getcwd(), "profile_stats.prof")
    pr = cProfile.Profile()
    pr.enable()
    simulate_monitor(args.duration, args.clients, args.rate)
    pr.disable()
    pr.dump_stats(out)
    print(f"Wrote profile stats to {out}")
    p = pstats.Stats(out)
    p.sort_stats("cumtime").print_stats(30)


if __name__ == "__main__":
    main()
