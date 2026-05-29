import time
import random
import cProfile
import pstats
import io

from backend.monitor import TrafficMonitor


def run_simulation():
    mon = TrafficMonitor(interface='lo', threshold_mb=50)
    N_DEVICES = 500
    samples_per_device = 20
    ips = [f'10.0.0.{i%254+1}' for i in range(N_DEVICES)]

    start = time.time()
    # Inject samples across devices
    for _ in range(samples_per_device):
        for ip in ips:
            mon.inject_sample(ip, random.randint(500, 1500), timestamp=time.time())
        # small sleep to simulate time progression
        time.sleep(0.01)

    # Snapshot retrieval pass
    for ip in ips[:50]:
        _ = mon.get_device_snapshot(ip)

    # Compute current mbps
    _ = mon.get_current_mbps()
    end = time.time()
    print(f'Simulation ran in {end-start:.2f}s; devices={N_DEVICES} samples/device={samples_per_device}')


if __name__ == '__main__':
    pr = cProfile.Profile()
    pr.enable()
    run_simulation()
    pr.disable()
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats('cumulative')
    ps.strip_dirs().sort_stats('cumulative').print_stats(20)
    print(s.getvalue())
