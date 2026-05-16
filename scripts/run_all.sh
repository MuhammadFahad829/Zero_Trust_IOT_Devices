#!/usr/bin/env bash
set -euo pipefail
# One-shot helper to prepare and run the project. Use flags to control system changes.
# Usage: ./scripts/run_all.sh [--apply-vlan] [--apply-dns] [--no-serve] [--foreground-backend]

ROOTDIR="$(cd "$(dirname "$0")/.." && pwd)"
VEVDIR="$ROOTDIR/.venv"
POLICIES="$ROOTDIR/backend/policies.json"

APPLY_VLAN=false
APPLY_DNS=false
NO_SERVE=false
FG_BACKEND=false

for arg in "$@"; do
  case "$arg" in
    --apply-vlan) APPLY_VLAN=true ;; 
    --apply-dns) APPLY_DNS=true ;; 
    --no-serve) NO_SERVE=true ;; 
    --foreground-backend) FG_BACKEND=true ;;
    -h|--help)
      sed -n '1,200p' "$0"; exit 0;;
    *) echo "Unknown arg $arg"; exit 1;;
  esac
done

echo "[run_all] Starting project setup (root: $ROOTDIR)"

if [ ! -d "$VEVDIR" ]; then
  echo "[run_all] Creating venv..."
  python3 -m venv "$VEVDIR"
fi

echo "[run_all] Activating venv and installing Python deps (if requirements.txt exists)"
source "$VEVDIR/bin/activate"
if [ -f "$ROOTDIR/requirements.txt" ]; then
  pip install -r "$ROOTDIR/requirements.txt"
fi

echo "[run_all] Building frontend"
if [ -d "$ROOTDIR/frontend" ]; then
  (cd "$ROOTDIR/frontend" && npm install --no-audit --no-fund)
  (cd "$ROOTDIR/frontend" && npm run build)
else
  echo "[run_all] frontend/ missing — skipping build"
fi

if [ "$NO_SERVE" = false ]; then
  echo "[run_all] Serving frontend on :3000 (background)"
  (cd "$ROOTDIR/frontend" && npx serve -s build -l 3000 > "$ROOTDIR/serve.log" 2>&1 &) || true
  echo "[run_all] Frontend serve started (see serve.log)"
fi

echo "[run_all] Starting backend"
if [ "$FG_BACKEND" = true ]; then
  sudo "$ROOTDIR/run-backend.sh"
else
  sudo "$ROOTDIR/run-backend.sh" > "$ROOTDIR/backend.log" 2>&1 &
  echo "[run_all] Backend started in background (logs: backend.log)"
fi

echo "[run_all] VLAN provisioning (policies: $POLICIES)"
if [ "$APPLY_VLAN" = true ]; then
  echo "[run_all] Applying VLAN/bridge changes (requires sudo)"
  sudo "$ROOTDIR/scripts/create_vlans.sh" "$POLICIES" --apply
else
  echo "[run_all] Dry-run: printed commands below. To apply changes, re-run with --apply-vlan"
  "$ROOTDIR/scripts/create_vlans.sh" "$POLICIES"
fi

echo "[run_all] Generating dnsmasq configs"
"$ROOTDIR/scripts/generate_dnsmasq_conf.sh" "$POLICIES" "$ROOTDIR/deploy/dnsmasq"
if [ "$APPLY_DNS" = true ]; then
  echo "[run_all] Copying dnsmasq configs to /etc/dnsmasq.d/ and restarting dnsmasq (requires sudo)"
  sudo cp "$ROOTDIR/deploy/dnsmasq"/*.conf /etc/dnsmasq.d/ || true
  sudo systemctl restart dnsmasq || true
fi

echo "[run_all] Setup complete. Helpful commands to validate:"
echo "  curl http://127.0.0.1:8000/devices"
echo "  curl http://127.0.0.1:8000/traffic"
echo "  curl http://127.0.0.1:8001/metrics"
echo "  sudo ip -d link show"
echo "  sudo iptables -S"

echo "[run_all] Logs: frontend serve -> serve.log, backend -> backend.log"
