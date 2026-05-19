from scapy.all import sniff, ARP, IP, conf
import threading
from typing import Callable, Optional
import os
import re

# simple in-memory cache to avoid repeated OUI lookups
_OUI_CACHE = {}
# optional external OUI mapping loaded from a file (env: ZT_OUI_FILE)
_EXTRA_OUI_MAP = {}
_OUI_LOADED = False


def _load_external_oui(path: str):
    """Load an external OUI file into _EXTRA_OUI_MAP.

    Supported formats:
    - CSV: "AA:BB:CC,Vendor Name" or "AABBCC,Vendor Name"
    - IEEE oui.txt lines like "00-00-00   (hex)        XEROX CORPORATION"
    """
    if not path:
        return
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                # try CSV first
                if "," in line:
                    parts = [p.strip() for p in line.split(",", 1)]
                    if len(parts) == 2:
                        oui_raw, vendor = parts
                        oui = re.sub(r"[^0-9A-Fa-f]", "", oui_raw).lower()
                        if len(oui) >= 6:
                            _EXTRA_OUI_MAP[oui[:6]] = vendor
                        continue

                # IEEE formatted: 00-00-00   (hex)        VENDOR
                m = re.match(r"^([0-9A-Fa-f]{2}[-:][0-9A-Fa-f]{2}[-:][0-9A-Fa-f]{2}).+?\s{2,}(.+)$", line)
                if m:
                    oui_raw = m.group(1)
                    vendor = m.group(2).strip()
                    oui = re.sub(r"[^0-9A-Fa-f]", "", oui_raw).lower()
                    if len(oui) >= 6:
                        _EXTRA_OUI_MAP[oui[:6]] = vendor
                        continue

                # fallback: try to extract first hex sequence
                m2 = re.search(r"([0-9A-Fa-f]{6,})", line)
                if m2:
                    oui = m2.group(1)[:6].lower()
                    vendor = line[m2.end():].strip() or line
                    _EXTRA_OUI_MAP[oui] = vendor
    except Exception:
        # best-effort: don't fail startup if file unreadable
        return


def _ensure_oui_loaded():
    global _OUI_LOADED
    if _OUI_LOADED:
        return
    # Priority: env ZT_OUI_FILE -> repo deploy/oui.txt or deploy/ouidb.csv
    path = os.environ.get("ZT_OUI_FILE")
    if not path:
        # backend file path relative to this file
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cand1 = os.path.join(base, "deploy", "oui.txt")
        cand2 = os.path.join(base, "deploy", "ouidb.csv")
        if os.path.exists(cand1):
            path = cand1
        elif os.path.exists(cand2):
            path = cand2

    if path and os.path.exists(path):
        _load_external_oui(path)

    _OUI_LOADED = True


def _lookup_oui(mac: str) -> str:
    """Resolve a MAC address to a vendor name using Scapy's local OUI database.

    Caches results and handles locally-administered/randomized MACs.
    """
    if not mac:
        return "Unknown"

    mac_norm = mac.lower()
    _ensure_oui_loaded()
    if mac_norm in _OUI_CACHE:
        return _OUI_CACHE[mac_norm]

    try:
        first_octet = int(mac.split(":", 1)[0], 16)
        # Locally administered MACs are commonly randomized on phones.
        if first_octet & 0x02:
            _OUI_CACHE[mac_norm] = "Private/Randomized"
            return "Private/Randomized"

        resolved = None
        # check external OUI map (prefix match) first
        try:
            prefix = re.sub(r"[^0-9a-f]", "", mac_norm)[:6]
            if prefix and prefix in _EXTRA_OUI_MAP:
                vendor = _EXTRA_OUI_MAP[prefix]
                _OUI_CACHE[mac_norm] = vendor
                return vendor
        except Exception:
            pass

        try:
            resolved = conf.manufdb.lookup(mac)
        except Exception:
            resolved = None

        if isinstance(resolved, tuple):
            vendor = resolved[1] or resolved[0]
        else:
            vendor = resolved

        vendor = (vendor or "").strip()
        if not vendor or vendor.lower() == mac_norm:
            vendor = "Unknown"

        _OUI_CACHE[mac_norm] = vendor
        return vendor
    except Exception:
        _OUI_CACHE[mac_norm] = "Unknown"
        return "Unknown"


def _detect_device_type(vendor: str, mac: str = None) -> str:
    """Detect device category: return one of [Mobile, Computer, Camera, Network, IoT, Other, Unknown]."""
    if not vendor:
        return "Unknown"

    vendor_lower = vendor.lower()

    # Canonical categories used by frontend
    if any(k in vendor_lower for k in ("apple", "samsung", "xiaomi", "oppo", "vivo", "oneplus", "motorola", "huawei", "pixel", "iphone", "ipad", "android")):
        return "Mobile"

    if any(k in vendor_lower for k in ("dell", "hp", "lenovo", "acer", "msi", "razer", "macbook", "intel", "asus")):
        return "Computer"

    if any(k in vendor_lower for k in ("hikvision", "dahua", "wyze", "reolink", "logitech", "gopro", "dji", "camera", "webcam")):
        return "Camera"

    if any(k in vendor_lower for k in ("tp-link", "d-link", "netgear", "asus", "linksys", "router", "ubiquiti", "mikrotik", "tenda", "wifi", "mesh")):
        return "Network"

    # IoT umbrella: smart bulbs, plugs, thermostats, appliances, voice assistants
    if any(k in vendor_lower for k in ("philips", "hue", "lifx", "yeelight", "sonoff", "tuya", "smart", "iot", "switch", "plug", "thermostat", "nest", "amazon", "alexa", "echo", "google home")):
        return "IoT"

    if "private" in vendor_lower or "randomized" in vendor_lower:
        return "Unknown"

    return "Other"


class NetworkOrchestrator:
    def __init__(self, interface: str = "wlp2s0", callback: Optional[Callable] = None):
        self.interface = interface
        self.on_discover = callback
        self.discovered_ips = set()

    def _packet_callback(self, pkt):
        """Processes captured packets to extract identity and call the discovery callback."""
        ip_src = None
        mac_src = None

        if pkt.haslayer(ARP):
            ip_src = pkt[ARP].psrc
            mac_src = pkt[ARP].hwsrc
        elif pkt.haslayer(IP):
            ip_src = pkt[IP].src
            # MAC is available if packet includes an Ethernet layer; use pkt.src as fallback
            try:
                mac_src = pkt.src
            except Exception:
                mac_src = None

        if ip_src and ip_src not in self.discovered_ips:
            # Skip gateway or broadcast IPs if needed
            if ip_src.endswith(".1") or ip_src == "0.0.0.0":
                return

            self.discovered_ips.add(ip_src)
            manufacturer = _lookup_oui(mac_src)
            device_type = _detect_device_type(manufacturer, mac_src)

            if self.on_discover:
                try:
                    self.on_discover(ip_src, mac_src, manufacturer, device_type)
                except Exception:
                    # Ensure sniffing loop isn't broken by callback errors
                    pass

    def start_sniffing(self):
        """Starts a non-blocking background thread for sniffing on the configured interface."""
        print(f"[*] Scout is listening on {self.interface} (lightweight capture)...")

        # Use a tight BPF filter to reduce kernel-to-user traffic:
        # - ARP for address learning
        # - ICMP to catch ping-based ARP triggers
        # - DHCP (UDP ports 67/68) to catch clients requesting addresses
        bpf = "arp or icmp or (udp and (port 67 or port 68))"

        def _runner():
            try:
                sniff(iface=self.interface, prn=self._packet_callback, store=0, filter=bpf, promisc=False)
            except Exception as e:
                # If interface is down or not present, log and exit gracefully
                print(f"[!] Scout sniffing failed on {self.interface}: {e}")

        sniff_thread = threading.Thread(target=_runner, daemon=True)
        sniff_thread.start()

