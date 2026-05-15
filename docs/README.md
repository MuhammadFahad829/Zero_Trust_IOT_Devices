# ZeroTrustMaster

Quick start

Backend:

```bash
# from project root
source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/main.py
```

Frontend:

```bash
cd frontend
npm install
npm start
```

Notes:

- The backend scaffolding is minimal; extend `backend/main.py` and other modules.
- Do not commit the virtualenv directory.

## Ubuntu / Notes

- Root privileges are required to manage networking and run `scapy` sniffers and `iptables` commands.
- Check interface names with `ip link` before configuring: wireless interfaces are often `wlp*` or `wlan*`, ethernet `eth*` or `enp*`.
- The backend auto-detects the default WAN interface if `WAN_INTERFACE` is not set.
- If you run a Wi‑Fi hotspot, the hotspot interface may be `wlp2s0` or `wlan0`.

Install dependencies (example):

```bash
sudo apt update
sudo apt install -y python3-venv python3-dev build-essential
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Easy startup helpers:

```bash
sudo ./run-backend.sh
```

Stop the backend:

```bash
./stop-backend.sh
```

For a clean database on each boot:

```bash
sudo CLEAN_START=true ./run-backend.sh
```

The full saved command list is available in `docs/COMMANDS.md`.

Notes on running:

- Sniffing with `scapy` typically needs root; run backend with `sudo` or use capabilities (e.g., `sudo setcap cap_net_raw,cap_net_admin=eip $(which python3)`).
