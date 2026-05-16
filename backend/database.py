import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "zerotrust.db"


def _normalize_segment(segment: str) -> str:
    if segment is None:
        return ""
    normalized = str(segment).strip()
    if normalized.lower() in ("default", "none", "unassigned", "clear"):
        return ""
    return normalized


def suggest_segment_for_device(device_type: str = None, vendor: str = None) -> str:
    text = f"{device_type or ''} {vendor or ''}".lower()

    if any(token in text for token in ("personal", "iphone", "ipad", "macbook", "android", "mobile", "phone")):
        return "personal"
    if any(token in text for token in ("private", "randomized", "unknown")):
        return "private"
    if any(token in text for token in ("camera", "ipcamera", "security cam", "cctv")):
        return "camera"
    if any(token in text for token in ("router", "gateway", "switch", "ap", "access point")):
        return "network"
    if any(token in text for token in ("desktop", "laptop", "pc", "computer", "workstation")):
        return "work"
    if any(token in text for token in ("iot", "appliance", "speaker", "tv", "smart")):
        return "iot"

    return "other"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT UNIQUE,
            mac TEXT,
            vendor TEXT,
            device_type TEXT DEFAULT 'Unknown',
            status TEXT DEFAULT 'Blocked',
            last_seen REAL,
            mb_limit REAL DEFAULT 100.0,
            segment TEXT DEFAULT ''
        )
        """
    )
    # Add vendor and status columns if they don't exist (for backward compatibility)
    cur.execute("PRAGMA table_info(devices)")
    columns = {row[1] for row in cur.fetchall()}
    if "vendor" not in columns:
        cur.execute("ALTER TABLE devices ADD COLUMN vendor TEXT")
    if "status" not in columns:
        cur.execute("ALTER TABLE devices ADD COLUMN status TEXT DEFAULT 'Blocked'")
    if "device_type" not in columns:
        cur.execute("ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT 'Unknown'")
    if "mb_limit" not in columns:
        cur.execute("ALTER TABLE devices ADD COLUMN mb_limit REAL DEFAULT 100.0")
    if "segment" not in columns:
        cur.execute("ALTER TABLE devices ADD COLUMN segment TEXT DEFAULT ''")
    
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT,
            ip TEXT,
            detail TEXT,
            timestamp REAL
        )
        """
    )
    conn.commit()
    conn.close()


def add_or_update_device(ip: str, mac: str, last_seen: float, vendor: str = None, device_type: str = None, status: str = "Blocked", mb_limit: float = 100.0, segment: str = ""):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT segment FROM devices WHERE ip = ?", (ip,))
    existing = cur.fetchone()

    normalized_segment = _normalize_segment(segment)
    if normalized_segment:
        effective_segment = normalized_segment
    elif existing and existing[0]:
        effective_segment = existing[0]
    else:
        effective_segment = suggest_segment_for_device(device_type, vendor)

    cur.execute(
        "INSERT INTO devices (ip, mac, vendor, device_type, status, last_seen, mb_limit, segment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        "ON CONFLICT(ip) DO UPDATE SET mac=excluded.mac, vendor=excluded.vendor, device_type=excluded.device_type, status=excluded.status, last_seen=excluded.last_seen, mb_limit=excluded.mb_limit, segment=COALESCE(NULLIF(excluded.segment, ''), devices.segment)",
        (ip, mac, vendor, device_type, status, last_seen, mb_limit, effective_segment),
    )
    conn.commit()
    conn.close()


def mark_all_devices_seen(timestamp: float = None):
    """Refresh last_seen for every stored device.

    This is used by the no-physical-connection / demo path so existing
    database devices still appear as active in the dashboard.
    """
    timestamp = timestamp or __import__('time').time()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("UPDATE devices SET last_seen = ?", (timestamp,))
    conn.commit()
    conn.close()


def add_log(event: str, ip: str = None, detail: str = None, timestamp: float = None):
    timestamp = timestamp or __import__('time').time()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO logs (event, ip, detail, timestamp) VALUES (?, ?, ?, ?)",
        (event, ip, detail, timestamp),
    )
    conn.commit()
    conn.close()


def list_logs(limit: int = 200):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT event, ip, detail, timestamp FROM logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    conn.close()
    return [{"event": r[0], "ip": r[1], "detail": r[2], "timestamp": r[3]} for r in rows]


def list_devices():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT ip, mac, vendor, device_type, status, last_seen, mb_limit, segment FROM devices")
    rows = cur.fetchall()
    conn.close()
    return [{"ip": r[0], "mac": r[1], "vendor": r[2], "device_type": r[3], "status": r[4], "last_seen": r[5], "mb_limit": r[6], "segment": r[7], "score": 100} for r in rows]


def update_device_mb_limit(ip: str, mb_limit: float):
    """Update the MB limit for a device."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("UPDATE devices SET mb_limit = ? WHERE ip = ?", (mb_limit, ip))
    conn.commit()
    conn.close()


def update_device_segment(ip: str, segment: str):
    """Assign a device to a micro-segmentation group."""
    segment = _normalize_segment(segment)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("UPDATE devices SET segment = ? WHERE ip = ?", (segment, ip))
    conn.commit()
    conn.close()


def get_device(ip: str):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT ip, mac, vendor, device_type, status, last_seen, mb_limit, segment FROM devices WHERE ip = ?", (ip,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {"ip": row[0], "mac": row[1], "vendor": row[2], "device_type": row[3], "status": row[4], "last_seen": row[5], "mb_limit": row[6], "segment": row[7]}


def get_device_mb_limit(ip: str) -> float:
    d = get_device(ip)
    if not d:
        return None
    return float(d.get("mb_limit", 100.0))

