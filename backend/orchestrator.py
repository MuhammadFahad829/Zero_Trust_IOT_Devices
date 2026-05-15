from scapy.all import sniff, ARP, IP, conf
import threading
from typing import Callable, Optional


def _lookup_oui(mac: str) -> str:
    """Resolve a MAC address to a vendor name using Scapy's local OUI database."""
    if not mac:
        return "Unknown"

    try:
        first_octet = int(mac.split(":", 1)[0], 16)
        # Locally administered MACs are commonly randomized on phones.
        if first_octet & 0x02:
            return "Private/Randomized MAC"

        resolved = conf.manufdb.lookup(mac)
        if isinstance(resolved, tuple):
            vendor = resolved[1] or resolved[0]
        else:
            vendor = resolved
        vendor = (vendor or "").strip()
        if not vendor or vendor.lower() == mac.lower():
            return "Unknown"
        return vendor
    except Exception:
        return "Unknown"


def _detect_device_type(vendor: str, mac: str = None) -> str:
    """Detect device type category (Mobile, Camera, Smart Speaker, etc.) based on vendor."""
    if not vendor:
        return "Unknown"
    
    vendor_lower = vendor.lower()
    
    # Mobile Phones & Tablets
    mobile_keywords = ("apple", "samsung", "xiaomi", "oppo", "vivo", "realme", "oneplus", "motorola", "htc", "nokia", "huawei", "pixel", "lg electronics", "iphone", "ipad")
    if any(kw in vendor_lower for kw in mobile_keywords):
        return "Mobile"
    
    # Cameras & Surveillance
    camera_keywords = ("hikvision", "dahua", "wyze", "reolink", "logitech", "gopro", "dji", "camera", "webcam")
    if any(kw in vendor_lower for kw in camera_keywords):
        return "Camera"
    
    # Smart Speakers & Voice Assistants
    speaker_keywords = ("amazon", "google", "echo", "home", "nest", "sonos", "bose")
    if any(kw in vendor_lower for kw in speaker_keywords):
        return "Smart Speaker"
    
    # Smart Home Hubs & Routers
    router_keywords = ("tp-link", "d-link", "netgear", "asus", "linksys", "tenda", "router", "mesh", "wifi")
    if any(kw in vendor_lower for kw in router_keywords):
        return "Router/Hub"
    
    # Smart Lights & Bulbs
    light_keywords = ("philips hue", "wyze", "nanoleaf", "lifx", "yeelight", "smartbulb", "lightbulb")
    if any(kw in vendor_lower for kw in light_keywords):
        return "Smart Light"
    
    # Smart Appliances (fans, switches, plugs, thermostats)
    appliance_keywords = ("fan", "switch", "plug", "outlet", "thermostat", "ac", "heater", "smart home", "iot")
    if any(kw in vendor_lower for kw in appliance_keywords):
        return "Smart Appliance"
    
    # Laptops & Desktop
    computer_keywords = ("dell", "hp", "lenovo", "asus", "acer", "msi", "razer", "macbook", "intel")
    if any(kw in vendor_lower for kw in computer_keywords):
        return "Computer"
    
    # Printers
    printer_keywords = ("brother", "canon", "epson", "hp", "xerox", "ricoh", "printer")
    if any(kw in vendor_lower for kw in printer_keywords):
        return "Printer"
    
    # Gaming Devices
    gaming_keywords = ("nintendo", "sony", "playstation", "xbox", "steam", "gaming")
    if any(kw in vendor_lower for kw in gaming_keywords):
        return "Gaming Device"
    
    # Wearables
    wearable_keywords = ("fitbit", "garmin", "apple watch", "smartwatch", "wearable", "band")
    if any(kw in vendor_lower for kw in wearable_keywords):
        return "Wearable"
    
    # Private/Randomized
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

