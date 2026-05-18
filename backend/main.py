import asyncio
import ipaddress
import json
import math
import os
import subprocess
import sys

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Make local backend modules importable when running `python backend/main.py`
BASE_DIR = os.path.dirname(__file__)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enforcement import EnforcementEngine
from orchestrator import NetworkOrchestrator, _lookup_oui, _detect_device_type
from monitor import TrafficMonitor
import database
import time
from typing import Optional

app = FastAPI(title="Zero-Trust IoT Gateway")

LAN_INTERFACE = os.environ.get("LAN_INTERFACE", "wlp2s0")


def _detect_default_wan_interface() -> str:
    """Detect the current default internet-facing interface from the system routing table."""
    try:
        result = subprocess.run(
            ["ip", "route", "show", "default"],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in result.stdout.splitlines():
            parts = line.split()
            if "dev" in parts:
                dev_idx = parts.index("dev") + 1
                if dev_idx < len(parts):
                    return parts[dev_idx]
    except Exception:
        pass
    return "enxc688a1bd0aa9"


def _detect_hotspot_interface() -> str:
    """Auto-detect a LAN/hotspot wireless interface.

    Strategy:
    - Prefer an interface reported by `iw dev` with `type AP`.
    - Fallback to any interface that has a private IPv4 address commonly used
      for hotspots (10.x.x.x, 192.168.x.x, 172.16-31.x.x).
    - Final fallback: `LAN_INTERFACE` env or `wlp2s0`.
    """
    # 1) Look for AP-type wireless interfaces via `iw dev`
    try:
        result = subprocess.run(["iw", "dev"], check=True, capture_output=True, text=True)
        cur_iface = None
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("Interface "):
                parts = line.split()
                if len(parts) >= 2:
                    cur_iface = parts[1]
                continue
            if line.startswith("type ") and cur_iface:
                if "ap" in line.lower() or "AP" in line:
                    return cur_iface
    except Exception:
        pass

    # 2) Fallback: pick an interface with a private IP address likely used by hotspots
    try:
        result = subprocess.run(["ip", "-4", "-o", "addr", "show"], check=True, capture_output=True, text=True)
        for l in result.stdout.splitlines():
            parts = l.split()
            if len(parts) >= 4:
                iface = parts[1]
                addr = parts[3]
                if addr.startswith(("10.", "192.168.", "172.")):
                    return iface
    except Exception:
        pass

    # 3) Last-resort fallback to configured env or common wlan name
    return os.environ.get("LAN_INTERFACE", "wlp2s0")

RAW_WAN_INTERFACE = os.environ.get("WAN_INTERFACE")
RAW_LAN_INTERFACE = os.environ.get("LAN_INTERFACE")
LAN_INTERFACE = RAW_LAN_INTERFACE if RAW_LAN_INTERFACE else _detect_hotspot_interface()
WAN_INTERFACE = RAW_WAN_INTERFACE if RAW_WAN_INTERFACE else _detect_default_wan_interface()
if RAW_LAN_INTERFACE:
    print(f"[*] Using configured LAN_INTERFACE={LAN_INTERFACE}")
else:
    print(f"[*] Auto-detected LAN_INTERFACE={LAN_INTERFACE}")
if RAW_WAN_INTERFACE:
    print(f"[*] Using configured WAN_INTERFACE={WAN_INTERFACE}")
else:
    print(f"[*] Auto-detected WAN_INTERFACE={WAN_INTERFACE}")


def _interface_mode(interface: str) -> str:
    """Return wireless interface mode (e.g., AP, managed) if available."""
    try:
        result = subprocess.run(
            ["iw", "dev", interface, "info"],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("type "):
                return line.split(" ", 1)[1].strip().lower()
    except Exception:
        pass
    return "unknown"


def _lan_network_from_interface(interface: str = LAN_INTERFACE):
    try:
        result = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "dev", interface],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in result.stdout.splitlines():
            parts = line.split()
            if "inet" in parts:
                idx = parts.index("inet")
                if idx + 1 < len(parts):
                    return ipaddress.ip_network(parts[idx + 1], strict=False)
    except Exception:
        pass
    return None


LAN_NETWORK = _lan_network_from_interface(LAN_INTERFACE)
LAN_INTERFACE_MODE = _interface_mode(LAN_INTERFACE)
HOTSPOT_ACTIVE = LAN_INTERFACE_MODE == "ap"
# track prior state so we can react to mode transitions at runtime
PREV_HOTSPOT_ACTIVE = HOTSPOT_ACTIVE

if not HOTSPOT_ACTIVE:
    print(f"[*] Hotspot not active on {LAN_INTERFACE} (mode={LAN_INTERFACE_MODE}). Device discovery is paused.")


def _database_demo_mode_enabled() -> bool:
    mode = os.environ.get("DEMO_DATABASE_MODE", "auto").strip().lower()
    if mode in ("1", "true", "yes", "on"):
        return True
    if mode in ("0", "false", "no", "off"):
        return False
    return not HOTSPOT_ACTIVE


def _is_device_online(last_seen: float) -> bool:
    if not HOTSPOT_ACTIVE:
        return False

    try:
        last_seen_value = float(last_seen or 0)
    except Exception:
        return False

    if last_seen_value <= 0:
        return False

    return (time.time() - last_seen_value) <= 45


def _broadcast_device_presence(ip: str, mac: str, vendor: str = None, device_type: str = None, online: bool = True):
    now = time.time()
    current = database.get_device(ip) or {}
    status = current.get("status") or "Blocked"
    segment = current.get("segment", "") if current else ""
    mb_limit = current.get("mb_limit", 100.0) if current else 100.0

    try:
        database.add_or_update_device(
            ip,
            mac,
            now,
            vendor=vendor or current.get("vendor"),
            device_type=device_type or current.get("device_type"),
            status=status,
            mb_limit=mb_limit,
            segment=segment,
        )
    except Exception:
        pass

    payload = {
        "event": "NEW_DEVICE",
        "data": {
            "ip": ip,
            "mac": mac or current.get("mac"),
            "vendor": vendor or current.get("vendor"),
            "device_type": device_type or current.get("device_type"),
            "status": status,
            "score": 100,
            "online": bool(online),
            "last_seen": now,
            "segment": segment,
        },
    }

    try:
        asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop)
    except Exception:
        pass


DEMO_TRAFFIC_TICK = 0
DEMO_TRAFFIC_PRIMED = False


def _device_demo_bytes(ip: str, tick: int, position: int, blocked: bool) -> int:
    seed = sum(ord(ch) for ch in str(ip)) + position * 37
    base = 12_000 + (seed % 18_000)
    wave = int(abs(math.sin((tick + position + seed) / 3.0)) * 18_000)
    bytes_count = base + wave
    if blocked:
        bytes_count = max(4_000, bytes_count // 2)
    return bytes_count


def _prime_demo_traffic_from_database() -> None:
    global DEMO_TRAFFIC_PRIMED
    if DEMO_TRAFFIC_PRIMED or not _database_demo_mode_enabled():
        return

    rows = database.list_devices()
    if not rows:
        return

    now = time.time()
    for idx, row in enumerate(rows):
        ip = row.get("ip")
        if not ip:
            continue

        blocked = (row.get("status") or "").lower() in ("blocked", "quarantined")
        for offset in range(6):
            sample_ts = now - ((6 - offset) * 5)
            bytes_count = _device_demo_bytes(ip, offset, idx, blocked)
            monitor.inject_sample(ip, bytes_count, sample_ts)

    DEMO_TRAFFIC_PRIMED = True
    print(f"[*] Demo traffic primed for {len(rows)} stored device(s)")


def _advance_demo_traffic_from_database() -> None:
    global DEMO_TRAFFIC_TICK
    if not _database_demo_mode_enabled():
        return

    rows = database.list_devices()
    if not rows:
        return

    DEMO_TRAFFIC_TICK += 1
    for idx, row in enumerate(rows):
        ip = row.get("ip")
        if not ip:
            continue
        blocked = (row.get("status") or "").lower() in ("blocked", "quarantined")
        bytes_count = _device_demo_bytes(ip, DEMO_TRAFFIC_TICK, idx, blocked)
        monitor.inject_sample(ip, bytes_count, time.time())


def _is_hotspot_client_ip(ip_text: str) -> bool:
    if not HOTSPOT_ACTIVE:
        return False

    try:
        ip_obj = ipaddress.ip_address(ip_text)
    except Exception:
        return False

    if LAN_NETWORK is not None:
        return ip_obj in LAN_NETWORK and ip_obj != LAN_NETWORK.network_address and ip_obj != LAN_NETWORK.broadcast_address

    # Conservative fallback if interface query fails.
    return str(ip_text).startswith("10.42.0.")

# CORS setup so React (localhost:3000) can talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize Engines (update interfaces as needed)
enforcer = EnforcementEngine(wan_iface=WAN_INTERFACE, lan_iface=LAN_INTERFACE)
enforcer.setup_gateway()

# Initialize DB
# Optional clean-start: remove persisted DB so dashboard is empty on boot when enabled
clean_start = os.environ.get("CLEAN_START", "false").lower() in ("1", "true", "yes")
if clean_start:
    try:
        db_file = os.path.join(BASE_DIR, "zerotrust.db")
        if os.path.exists(db_file):
            os.remove(db_file)
            print("[*] CLEAN_START enabled — removed existing database")
    except Exception as e:
        print(f"[!] CLEAN_START: failed to remove DB: {e}")

database.init_db()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        text = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text)
            except Exception:
                # ignore/send errors per-connection
                pass


manager = ConnectionManager()


# --- Orchestrator Callback ---
def on_device_discovered(ip, mac, vendor=None, device_type=None):
    """Called by the scout when a new device is seen."""
    if not _is_hotspot_client_ip(ip):
        return

    print(f"[*] New Device Alert: {ip} | {vendor} | Type: {device_type}")
    # persist device and add log
    try:
        _broadcast_device_presence(ip, mac, vendor=vendor, device_type=device_type, online=True)
        database.add_log("NEW_DEVICE", ip=ip, detail=str({"mac": mac, "vendor": vendor, "device_type": device_type}))
    except Exception:
        pass


# Prepare event loop before starting sniffing so callbacks can post to it
try:
    loop = asyncio.get_event_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

# Scout Start
scout = NetworkOrchestrator(interface=LAN_INTERFACE, callback=on_device_discovered)
scout.start_sniffing()

# Cursor for deterministic round-robin probing across LAN hosts.
PROBE_CURSOR = 0


def seed_connected_devices_from_neighbors():
    """Seed devices that are already connected but may not have emitted traffic yet."""
    global PROBE_CURSOR
    if not HOTSPOT_ACTIVE:
        return

    def _consume_neighbors() -> None:
        try:
            result = subprocess.run(
                ["ip", "neigh", "show", "dev", LAN_INTERFACE],
                check=True,
                capture_output=True,
                text=True,
            )
        except Exception as exc:
            print(f"[!] Neighbor seed skipped: {exc}")
            return

        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 2:
                continue

            ip_addr = parts[0]
            mac_addr = None
            if "lladdr" in parts:
                mac_index = parts.index("lladdr") + 1
                if mac_index < len(parts):
                    mac_addr = parts[mac_index]

            # If entry is FAILED with no MAC, trigger a quick ARP attempt.
            if not mac_addr and "FAILED" in parts:
                try:
                    subprocess.Popen(
                        ["ping", "-c", "1", "-W", "1", "-I", LAN_INTERFACE, ip_addr],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except Exception:
                    pass
                continue

            if not mac_addr:
                continue

            if ip_addr in scout.discovered_ips:
                if _is_hotspot_client_ip(ip_addr):
                    _broadcast_device_presence(ip_addr, mac_addr, _lookup_oui(mac_addr), _detect_device_type(_lookup_oui(mac_addr), mac_addr), online=True)
                continue

            if not _is_hotspot_client_ip(ip_addr):
                continue

            scout.discovered_ips.add(ip_addr)
            on_device_discovered(ip_addr, mac_addr, _lookup_oui(mac_addr))

    # First pass: consume already-known neighbors quickly.
    _consume_neighbors()

    # Active probing: deterministic round-robin scan over subnet in small batches,
    # so every host gets probed over time and quiet clients are eventually discovered.
    try:
        if LAN_NETWORK is not None:
            candidates = [str(h) for h in LAN_NETWORK.hosts() if str(h) not in scout.discovered_ips]
            if candidates:
                batch_size = min(64, max(16, len(candidates) // 8))
                start = PROBE_CURSOR % len(candidates)
                batch = []
                for i in range(batch_size):
                    batch.append(candidates[(start + i) % len(candidates)])
                PROBE_CURSOR = (start + batch_size) % len(candidates)

                for probe_ip in batch:
                    try:
                        subprocess.Popen(
                            ["ping", "-c", "1", "-W", "1", "-I", LAN_INTERFACE, probe_ip],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                    except Exception:
                        pass
    except Exception:
        pass

    # Second pass: consume neighbors again after probes to ingest newly learned ARP entries.
    _consume_neighbors()


def seed_devices_from_database():
    """Promote stored devices into a visible, active state when hardware discovery is unavailable."""
    if not _database_demo_mode_enabled():
        return

    rows = database.list_devices()
    if not rows:
        return

    for row in rows:
        ip = row.get("ip")
        if not ip:
            continue

        scout.discovered_ips.add(ip)
        payload = {
            "event": "NEW_DEVICE",
            "data": {
                "ip": ip,
                "mac": row.get("mac"),
                "vendor": row.get("vendor"),
                "device_type": row.get("device_type"),
                "status": row.get("status") or "Blocked",
                "score": row.get("score", 100),
                "online": False,
                "last_seen": row.get("last_seen"),
            },
        }
        try:
            asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop)
        except Exception:
            pass

    print(f"[*] Demo database mode seeded {len(rows)} device(s) from SQLite")


seed_connected_devices_from_neighbors()
seed_devices_from_database()

# --- Anomaly Alert Callback ---
def on_anomaly_detected(ip: str):
    print(f"[!!!] ANOMALY DETECTED: {ip} exceeded bandwidth limit!")
    # Physically block the device
    try:
        enforcer.block_device(ip)
    except Exception:
        pass

    # Notify React Dashboard instantly
    payload = {
        "event": "ANOMALY_ALERT",
        "ip": ip,
        "message": "Device Quarantined due to high usage",
        "status": "Quarantined",
    }
    try:
        asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop)
    except Exception:
        pass
    # persist log
    try:
        database.add_log("ANOMALY_ALERT", ip=ip, detail="Quarantined for high usage")
        # Update device status in DB
        existing = next((row for row in database.list_devices() if row["ip"] == ip), None)
        if existing:
            database.add_or_update_device(ip, existing.get("mac", ""), time.time(), vendor=existing.get("vendor"), device_type=existing.get("device_type"), status="Quarantined", mb_limit=existing.get("mb_limit", 100.0), segment=existing.get("segment", ""))
    except Exception:
        pass

# Monitor Start (Limit set to 50MB for testing)
import threading
monitor = TrafficMonitor(interface=LAN_INTERFACE, threshold_mb=50, on_alert=on_anomaly_detected)
threading.Thread(target=monitor.start_monitoring, daemon=True).start()

# Prime demo traffic after monitor is available
try:
    _prime_demo_traffic_from_database()
except Exception:
    pass


def _find_ip_for_mac(mac: str) -> str:
    """Map a MAC address to an IP using the kernel neighbor table for the LAN interface."""
    try:
        result = subprocess.run([
            "ip",
            "neigh",
            "show",
            "dev",
            LAN_INTERFACE,
        ], check=True, capture_output=True, text=True)
    except Exception:
        return None

    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        ip_addr = parts[0]
        if "lladdr" in parts:
            mac_idx = parts.index("lladdr") + 1
            if mac_idx < len(parts) and parts[mac_idx].lower() == mac.lower():
                return ip_addr
    return None


async def _station_poller_loop():
    """Periodically poll `iw dev <iface> station dump` for associated stations and seed them."""
    while True:
        try:
            # Only run when hotspot is active
            _refresh_hotspot_state()
            if not HOTSPOT_ACTIVE:
                await asyncio.sleep(2)
                continue

            # Run blocking iw command in thread
            try:
                iw = await asyncio.to_thread(lambda: subprocess.run(["iw", "dev", LAN_INTERFACE, "station", "dump"], capture_output=True, text=True))
                out = iw.stdout or ""
            except Exception:
                out = ""

            macs = []
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("Station "):
                    parts = line.split()
                    if len(parts) >= 2:
                        macs.append(parts[1].lower())

            for mac in macs:
                # Try to map MAC -> IP via neighbor table
                ip = _find_ip_for_mac(mac)
                if not ip:
                    # quick ARP ping sweep to populate neighbor if we don't have mapping
                    try:
                        await asyncio.to_thread(subprocess.Popen, ["arping", "-c", "1", "-I", LAN_INTERFACE, "-s", mac],)
                    except Exception:
                        pass
                    ip = _find_ip_for_mac(mac)

                if ip and ip not in scout.discovered_ips and _is_hotspot_client_ip(ip):
                    scout.discovered_ips.add(ip)
                    vendor = _lookup_oui(mac)
                    d_type = _detect_device_type(vendor, mac)
                    try:
                        on_device_discovered(ip, mac, vendor, d_type)
                    except Exception:
                        pass
                elif ip and _is_hotspot_client_ip(ip):
                    vendor = _lookup_oui(mac)
                    d_type = _detect_device_type(vendor, mac)
                    _broadcast_device_presence(ip, mac, vendor, d_type, online=True)

        except Exception:
            pass
        await asyncio.sleep(3)


def _refresh_hotspot_state() -> None:
    global LAN_INTERFACE_MODE, HOTSPOT_ACTIVE, LAN_NETWORK, PREV_HOTSPOT_ACTIVE
    prev = HOTSPOT_ACTIVE
    LAN_INTERFACE_MODE = _interface_mode(LAN_INTERFACE)
    HOTSPOT_ACTIVE = LAN_INTERFACE_MODE == "ap"
    LAN_NETWORK = _lan_network_from_interface(LAN_INTERFACE)

    # React to a transition from non-AP -> AP: start seeding and ensure sniffing
    if HOTSPOT_ACTIVE and not prev:
        print(f"[*] Hotspot became active on {LAN_INTERFACE} (mode={LAN_INTERFACE_MODE}) — starting discovery tasks")
        try:
            # ensure scout is listening (start_sniffing is idempotent / safe to call)
            scout.start_sniffing()
        except Exception:
            pass
        try:
            # run a seeding pass in background to quickly populate DB for new clients
            asyncio.get_event_loop().run_in_executor(None, seed_connected_devices_from_neighbors)
        except Exception:
            # fallback if event loop not yet ready
            try:
                asyncio.to_thread(seed_connected_devices_from_neighbors)
            except Exception:
                pass

    # React to a transition from AP -> non-AP
    if not HOTSPOT_ACTIVE and prev:
        print(f"[*] Hotspot no longer active on {LAN_INTERFACE} (mode={LAN_INTERFACE_MODE}). Device discovery paused")

    PREV_HOTSPOT_ACTIVE = HOTSPOT_ACTIVE


async def traffic_broadcast_loop():
    while True:
        # Re-evaluate hotspot/interface state at runtime in case mode changes
        try:
            _refresh_hotspot_state()
        except Exception:
            pass

        try:
            _advance_demo_traffic_from_database()
        except Exception:
            pass

        try:
            await asyncio.to_thread(seed_connected_devices_from_neighbors)
        except Exception:
            pass

        mbps = monitor.get_current_mbps()
        await manager.broadcast(
            {
                "event": "TRAFFIC_UPDATE",
                "data": {
                    "mbps": round(float(mbps), 3),
                    "timestamp": time.time(),
                },
            }
        )
        # Also broadcast per-device snapshots so frontend can show live per-device traffic
        try:
            device_rows = database.list_devices()
            per = {}
            for d in device_rows:
                ip = d.get("ip")
                if not ip:
                    continue
                snap = monitor.get_device_snapshot(ip)
                per[ip] = {
                    "mbps": snap.get("mbps", 0.0),
                    "total_mb": snap.get("total_mb", 0.0),
                    "total_bytes": snap.get("total_bytes", 0),
                    "history": snap.get("history", []),
                }
            await manager.broadcast({"event": "DEVICES_TRAFFIC", "data": per})
        except Exception:
            pass
        await asyncio.sleep(2)


@app.on_event("startup")
async def startup_tasks():
    asyncio.create_task(traffic_broadcast_loop())
    # Start station poller to detect associated stations from the wireless driver
    try:
        asyncio.create_task(_station_poller_loop())
    except Exception:
        pass


    def _run_provisioning(apply_vlan: bool = False, apply_dns: bool = False) -> dict:
        """Run system provisioning steps synchronously. Returns result dict."""
        root = os.path.dirname(__file__)
        repo_root = os.path.abspath(os.path.join(root, '..'))
        scripts_dir = os.path.join(repo_root, 'scripts')
        policies = os.path.join(root, 'policies.json')
        result = {"steps": []}

        try:
            # VLANs
            if apply_vlan:
                cmd = [os.path.join(scripts_dir, 'create_vlans.sh'), policies, '--apply']
                result['steps'].append({'cmd': ' '.join(cmd)})
                subprocess.run(cmd, check=True, capture_output=True, text=True)

            # Generate dnsmasq configs
            cmd2 = [os.path.join(scripts_dir, 'generate_dnsmasq_conf.sh'), policies, os.path.join(repo_root, 'deploy', 'dnsmasq')]
            result['steps'].append({'cmd': ' '.join(cmd2)})
            subprocess.run(cmd2, check=True, capture_output=True, text=True)

            if apply_dns:
                # copy generated confs into /etc/dnsmasq.d and restart dnsmasq
                copy_cmd = ['sudo', 'cp', os.path.join(repo_root, 'deploy', 'dnsmasq', '*.conf'), '/etc/dnsmasq.d/']
                # execute via shell for wildcard copy
                subprocess.run(' '.join(copy_cmd), shell=True, check=False, capture_output=True, text=True)
                subprocess.run(['sudo', 'systemctl', 'restart', 'dnsmasq'], check=False, capture_output=True, text=True)

            result['status'] = 'ok'
        except Exception as e:
            result['status'] = 'error'
            result['error'] = str(e)

        return result


    @app.post('/provision')
    async def provision_endpoint(payload: dict = None, authorization: Optional[str] = Header(None)):
        """Trigger VLAN/DHCP provisioning from the backend/UI.

        Security: If `PROVISION_TOKEN` env var is set, client must send header `authorization: Bearer <token>`.
        Payload: { "apply_vlan": bool, "apply_dns": bool }
        """
        token = os.environ.get('PROVISION_TOKEN')
        if token:
            if not authorization or not authorization.lower().startswith('bearer '):
                raise HTTPException(status_code=401, detail='missing authorization')
            provided = authorization.split(None, 1)[1].strip()
            if provided != token:
                raise HTTPException(status_code=403, detail='invalid token')

        body = payload or {}
        apply_vlan = bool(body.get('apply_vlan', False))
        apply_dns = bool(body.get('apply_dns', False))

        # Run provisioning in background to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        fut = loop.run_in_executor(None, _run_provisioning, apply_vlan, apply_dns)

        try:
            res = await asyncio.wait_for(fut, timeout=300)
        except asyncio.TimeoutError:
            # Return accepted and let background continue
            asyncio.create_task(loop.run_in_executor(None, _run_provisioning, apply_vlan, apply_dns))
            database.add_log('PROVISION', detail=str({'apply_vlan': apply_vlan, 'apply_dns': apply_dns}))
            return {'status': 'accepted', 'message': 'provisioning started in background'}

        database.add_log('PROVISION', detail=str({'apply_vlan': apply_vlan, 'apply_dns': apply_dns, 'result': res.get('status')}))
        return res


# --- API Endpoints ---


@app.get("/")
def read_root():
    return {"status": "Zero-Trust Gateway Online"}


@app.post("/allow/{ip}")
async def allow_access(ip: str):
    """Grant access to a verified device."""
    ok = enforcer.allow_device(ip)
    status = "Allowed" if ok else "Error"
    await manager.broadcast({"event": "STATUS_UPDATE", "ip": ip, "status": status})
    try:
        existing = next((row for row in database.list_devices() if row["ip"] == ip), None)
        database.add_log("ALLOW", ip=ip, detail=f"status={status}")
        database.add_or_update_device(
            ip,
            existing["mac"] if existing else "",
            time.time(),
            vendor=existing["vendor"] if existing else None,
            device_type=existing["device_type"] if existing else None,
            status=status,
            mb_limit=existing.get("mb_limit", 100.0) if existing else 100.0,
            segment=existing.get("segment", "") if existing else "",
        )
    except Exception:
        pass
    return {"message": f"Access {status} to {ip}"}


@app.post("/block/{ip}")
async def block_access(ip: str):
    """Quarantine a device (revoke prior allow)."""
    ok = enforcer.block_device(ip)
    status = "Quarantined" if ok else "Error"
    await manager.broadcast({"event": "STATUS_UPDATE", "ip": ip, "status": status})
    try:
        existing = next((row for row in database.list_devices() if row["ip"] == ip), None)
        database.add_log("BLOCK", ip=ip, detail=f"status={status}")
        if existing:
            database.add_or_update_device(
                ip,
                existing["mac"],
                time.time(),
                vendor=existing["vendor"],
                device_type=existing["device_type"],
                status=status,
                mb_limit=existing.get("mb_limit", 100.0),
                segment=existing.get("segment", ""),
            )
    except Exception:
        pass
    return {"message": f"Device {ip} {status}"}


@app.post('/limit/{ip}/{mb}')
async def set_device_limit(ip: str, mb: float):
    """Set per-device cumulative MB limit (in megabytes)."""
    try:
        database.update_device_mb_limit(ip, float(mb))
        database.add_log('SET_LIMIT', ip=ip, detail=str({'mb_limit': mb}))
        await manager.broadcast({'event': 'LIMIT_UPDATE', 'ip': ip, 'mb_limit': float(mb)})
        return {'message': f'set mb_limit={mb} for {ip}'}
    except Exception as e:
        return {'error': str(e)}


@app.post('/segment/{ip}/{segment}')
async def set_device_segment(ip: str, segment: str):
    """Assign a device to a network micro-segmentation group."""
    try:
        normalized = (segment or '').strip()
        if normalized.lower() in ('default', 'none', 'unassigned', 'clear'):
            normalized = ''

        database.update_device_segment(ip, normalized)
        try:
            enforcer.apply_segment_policies()
        except Exception:
            pass
        database.add_log('SET_SEGMENT', ip=ip, detail=str({'segment': normalized or 'Unassigned'}))
        await manager.broadcast({'event': 'SEGMENT_UPDATE', 'ip': ip, 'segment': normalized})
        return {'message': f"set segment={normalized or 'Unassigned'} for {ip}"}
    except Exception as e:
        return {'error': str(e)}


@app.get('/devices')
def api_list_devices():
    device_rows = database.list_devices()
    devices = []
    for row in device_rows:
        live = monitor.get_device_snapshot(row["ip"])
        online = _is_device_online(row.get("last_seen"))
        devices.append({
            **row,
            "online": online,
            "trafficMbps": live.get("mbps", 0.0),
            "trafficBytes": live.get("total_bytes", 0),
            "trafficMB": live.get("total_mb", 0.0),
            "trafficHistory": live.get("history", []),
        })
    return {"devices": devices}


@app.get('/logs')
def api_list_logs(limit: int = 200):
    return {"logs": database.list_logs(limit=limit)}


@app.get('/traffic')
def api_traffic_snapshot():
    mbps = monitor.get_current_mbps()
    return {
        "mbps": round(float(mbps), 3),
        "timestamp": time.time(),
    }


@app.get('/mode')
def api_runtime_mode():
    return {
        "mode": "physical" if HOTSPOT_ACTIVE else "replay",
        "demo_database_mode": _database_demo_mode_enabled(),
        "hotspot_active": HOTSPOT_ACTIVE,
        "lan_interface": LAN_INTERFACE,
        "lan_interface_mode": LAN_INTERFACE_MODE,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive by receiving pings from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    # Start uvicorn; `loop` is already obtained above for scapy callbacks
    uvicorn.run(app, host="0.0.0.0", port=8000)
