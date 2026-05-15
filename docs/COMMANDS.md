# ZeroTrustMaster Important Commands

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Start backend

```bash
sudo ./run-backend.sh
```

If you want a clean database on start:

```bash
sudo CLEAN_START=true ./run-backend.sh
```

## Stop backend

```bash
./stop-backend.sh
```

## Frontend

```bash
cd frontend
npm install
npm start
```

## Useful status commands

```bash
ip link
ip -4 addr show dev wlp2s0
iw dev wlp2s0 info
```

## API / device control

```bash
curl http://127.0.0.1:8000/devices
curl http://127.0.0.1:8000/logs
curl -X POST http://127.0.0.1:8000/block/<device-ip>
curl -X POST http://127.0.0.1:8000/allow/<device-ip>
```

## Advanced configuration

The backend now auto-detects the current default WAN interface from the system routing table.

Set interface names only if your system uses non-standard device names or auto-detection fails:

```bash
export LAN_INTERFACE=wlp2s0
export WAN_INTERFACE=enp3s0
sudo ./run-backend.sh
```

If `scapy` needs permission without sudo, you can give the Python binary network capability once:

```bash
sudo setcap cap_net_raw,cap_net_admin=eip $(which python3)
```
