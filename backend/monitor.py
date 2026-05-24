import threading
import time
from collections import deque
from typing import Optional, Callable

try:
    from scapy.all import sniff, IP
except Exception:
    # Allow running the monitor in environments without scapy (profiling, CI).
    sniff = None

    class _DummyIP:
        pass

    IP = _DummyIP

from backend import database
from backend import telemetry


class TrafficMonitor:
    def __init__(self, interface: str = "wlp2s0", threshold_mb: int = 20, on_alert: Optional[Callable] = None):
        """
        interface: interface to sniff on
        threshold_mb: threshold in megabytes per monitoring window before alert
        on_alert: callback(ip) when threshold crossed
        """
        self.interface = interface
        self.threshold = threshold_mb * 1024 * 1024  # MB -> Bytes
        self.device_total_bytes = {}  # { ip: total_bytes }
        self.device_windows = {}  # { ip: deque[(timestamp, bytes)] }
        self.device_history = {}  # { ip: deque[sample] }
        self.on_alert = on_alert
        self.total_bytes = 0
        self._window = deque()  # (timestamp, bytes)
        self._lock = threading.RLock()
        # throttle per-device sample appends to reduce CPU on high packet rates
        self._last_sample_time = {}

    def _trim_device_window(self, ip_src: str, now: float):
        window = self.device_windows.setdefault(ip_src, deque())
        while window and (now - window[0][0]) > 3.0:
            window.popleft()

    def _device_mbps(self, ip_src: str) -> float:
        window = self.device_windows.get(ip_src)
        if not window:
            return 0.0

        now = time.time()
        total = sum(size for _, size in window)
        span = max(now - window[0][0], 0.5)
        return (total / span) / (1024 * 1024)

    def _append_device_sample(self, ip_src: str, now: float, force: bool = False):
        # throttle history sampling to at most once per second per device when not forced
        last = self._last_sample_time.get(ip_src, 0)
        if not force and (now - last) < 1.0:
            return
        self._last_sample_time[ip_src] = now
        history = self.device_history.setdefault(ip_src, deque(maxlen=60))
        history.append(
            {
                "time": time.strftime("%H:%M:%S", time.localtime(now)),
                "mbps": round(self._device_mbps(ip_src), 4),
                "total_bytes": int(self.device_total_bytes.get(ip_src, 0)),
                "total_mb": round(self.device_total_bytes.get(ip_src, 0) / (1024 * 1024), 3),
                "timestamp": now,
            }
        )
        # update prometheus per-device and total metrics
        try:
            telemetry.set_device_mbps(ip_src, round(self._device_mbps(ip_src), 4))
            telemetry.set_total_mbps(round(self.get_current_mbps(), 4))
        except Exception:
            pass

    def _process_packet(self, pkt):
        start = time.time()
        if pkt.haslayer(IP):
            ip_src = pkt[IP].src
            p_size = len(pkt)

            with self._lock:
                now = time.time()
                self.total_bytes += p_size
                self._window.append((now, p_size))
                self._trim_window(now)

                device_window = self.device_windows.setdefault(ip_src, deque())
                device_window.append((now, p_size))
                self._trim_device_window(ip_src, now)

                self.device_total_bytes[ip_src] = self.device_total_bytes.get(ip_src, 0) + p_size
                current_total = self.device_total_bytes[ip_src]
                self._append_device_sample(ip_src, now)

            # Check per-device MB limit if configured in database, otherwise use global threshold
            try:
                mb_limit = database.get_device_mb_limit(ip_src)
                if mb_limit is None:
                    limit_bytes = self.threshold
                else:
                    limit_bytes = float(mb_limit) * 1024 * 1024
            except Exception:
                limit_bytes = self.threshold

            if current_total > limit_bytes:
                if self.on_alert:
                    try:
                        self.on_alert(ip_src)
                    except Exception:
                        pass
                # Do not reset total bytes to preserve usage history, only throttle repeated alerts
                with self._lock:
                    self.device_total_bytes[ip_src] = current_total
        # instrumentation
        try:
            telemetry.inc_packet_processed()
        except Exception:
            pass
        telemetry.observe_packet_latency(time.time() - start)

    def _trim_window(self, now: float):
        while self._window and (now - self._window[0][0]) > 3.0:
            self._window.popleft()

    def get_current_mbps(self) -> float:
        """Return near real-time traffic in MB/s based on last ~3 seconds."""
        with self._lock:
            now = time.time()
            self._trim_window(now)
            if not self._window:
                return 0.0

            total = sum(size for _, size in self._window)
            span = max(now - self._window[0][0], 0.5)
            bytes_per_sec = total / span
            return bytes_per_sec / (1024 * 1024)

    def get_snapshot(self) -> dict:
        return {
            "mbps": round(self.get_current_mbps(), 3),
            "total_bytes": int(self.total_bytes),
            "timestamp": time.time(),
        }

    def inject_sample(self, ip_src: str, bytes_count: int, timestamp: float = None):
        """Inject a synthetic or replayed traffic sample for a device.

        This keeps the live dashboard responsive when traffic is being replayed
        from stored database devices instead of sniffed from the network.
        """
        if not ip_src:
            return

        timestamp = timestamp or time.time()
        bytes_count = max(int(bytes_count or 0), 0)

        with self._lock:
            self.total_bytes += bytes_count
            self._window.append((timestamp, bytes_count))
            self._trim_window(timestamp)

            device_window = self.device_windows.setdefault(ip_src, deque())
            device_window.append((timestamp, bytes_count))
            self._trim_device_window(ip_src, timestamp)

            self.device_total_bytes[ip_src] = self.device_total_bytes.get(ip_src, 0) + bytes_count
            # when injecting synthetic samples, bypass throttle so tests and replays record each sample
            self._append_device_sample(ip_src, timestamp, force=True)
        try:
            telemetry.inc_packet_processed()
        except Exception:
            pass

    def get_device_history(self, ip_src: str) -> list:
        with self._lock:
            history = self.device_history.get(ip_src, deque())
            return list(history)

    def get_device_snapshot(self, ip_src: str) -> dict:
        with self._lock:
            return {
                "mbps": round(self._device_mbps(ip_src), 4),
                "total_bytes": int(self.device_total_bytes.get(ip_src, 0)),
                "total_mb": round(self.device_total_bytes.get(ip_src, 0) / (1024 * 1024), 3),
                "history": list(self.device_history.get(ip_src, deque())),
            }

    def start_monitoring(self):
        print(f"[*] Traffic Monitor active on {self.interface} (Limit: {self.threshold/(1024*1024)}MB)")
        sniff(iface=self.interface, prn=self._process_packet, store=0)
