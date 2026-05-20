# ZeroTrust IoT Gateway

Zero-Trust IoT gateway with a React dashboard, FastAPI backend, and network provisioning helpers.

## Quick Start

The easiest local path is the bundled runner from the repository root:

```bash
./run-all.sh
```

That script will:

- create or reuse the Python virtual environment
- install backend and frontend dependencies
- build the frontend
- start the backend with root privileges when needed
- serve the frontend on `http://localhost:3000`

## Manual Startup

Backend:

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
sudo ./run-backend.sh
```

Frontend:

```bash
cd frontend
npm install
npm start
```

## Deployment Notes

- Root privileges are required for `scapy`, `iptables`, and VLAN provisioning.
- Check interface names with `ip link` before provisioning; common names are `wlp*`, `wlan*`, `eth*`, and `enp*`.
- The backend auto-detects the default WAN interface if `WAN_INTERFACE` is not set.
- If you use a Wi‑Fi hotspot, the hotspot interface may be `wlp2s0` or `wlan0`.
- Do not commit `.venv/`.

## Service Files

-- `infra/deploy/zerotrust-exporter.service` runs the Prometheus exporter.
-- `infra/deploy/zerotrust-vlans.service` provisions VLAN and dnsmasq configuration.

## Useful Commands

```bash
sudo CLEAN_START=true ./run-backend.sh
./stop-backend.sh
curl http://127.0.0.1:8000/devices
curl http://127.0.0.1:8000/traffic
curl http://127.0.0.1:8001/metrics
```

The full saved command list is available in `docs/commands.md`.
