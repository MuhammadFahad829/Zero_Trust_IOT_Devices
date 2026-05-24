#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

log() {
  echo "[*] $*"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-20}"
  local delay="${3:-1}"
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
    i=$((i + 1))
  done
  return 1
}

# Activate virtualenv if present
if [ -f ".venv/bin/activate" ]; then
  # shellcheck source=/dev/null
  source ".venv/bin/activate"
fi

if [ -d "frontend" ] && [ -f "frontend/package-lock.json" ] && [ ! -d "frontend/node_modules" ]; then
  log "Installing frontend dependencies with npm ci"
  (cd "frontend" && npm ci --silent)
fi

PROVISION=${PROVISION:-0} # set PROVISION=1 to apply VLAN/DNS provisioning
APPLY_DNS=${APPLY_DNS:-0} # set APPLY_DNS=1 to copy dnsmasq confs to /etc/dnsmasq.d

# Optional: run create_vlans and dnsmasq generation before starting services
  if [ "${PROVISION}" = "1" ]; then
  log "Running VLAN/DNS provisioning (preview+apply)..."
  if [ -x "${ROOT_DIR}/infra/scripts/create_vlans.sh" ]; then
    "${ROOT_DIR}/infra/scripts/create_vlans.sh" "${ROOT_DIR}/backend/policies.json" --apply || true
  fi
  if [ -x "${ROOT_DIR}/infra/scripts/generate_dnsmasq_conf.sh" ]; then
    "${ROOT_DIR}/infra/scripts/generate_dnsmasq_conf.sh" "${ROOT_DIR}/backend/policies.json" "${ROOT_DIR}/deploy/dnsmasq" || true
    if [ "${APPLY_DNS}" = "1" ]; then
      log "Copying generated dnsmasq configs to /etc/dnsmasq.d (requires sudo)"
      sudo cp "${ROOT_DIR}/deploy/dnsmasq"/*.conf /etc/dnsmasq.d/ || true
      sudo systemctl restart dnsmasq || true
    fi
  fi
fi

# Start backend via the hardened launcher when available.
if [ -x "${ROOT_DIR}/run-backend.sh" ]; then
  log "Starting backend with run-backend.sh"
  sudo "${ROOT_DIR}/run-backend.sh"
else
  log "Starting backend directly on :8000"
  mkdir -p "$ROOT_DIR/logs"
  nohup uvicorn backend.main:app --reload --port 8000 > "$ROOT_DIR/logs/zerotrust-backend.log" 2>&1 &
fi

# Build and serve frontend (production) if requested
if [ -d "$ROOT_DIR/frontend" ]; then
  log "Building frontend..."
  (cd "$ROOT_DIR/frontend" && npm run build --silent)
  log "Serving frontend build on http://localhost:3000"
  mkdir -p "$ROOT_DIR/logs"
  if command -v npx >/dev/null 2>&1; then
    npx serve -s "$ROOT_DIR/frontend/build" -l 3000 > "$ROOT_DIR/logs/zerotrust-frontend.log" 2>&1 &
  else
    (cd "$ROOT_DIR/frontend/build" && python3 -m http.server 3000 > "$ROOT_DIR/logs/zerotrust-frontend.log" 2>&1 &)
  fi
fi

log "Waiting for backend health on http://127.0.0.1:8000/devices"
if wait_for_http "http://127.0.0.1:8000/devices" 20 1; then
  log "Backend is responding"
else
  echo "[!] Backend did not respond in time. Check logs: /tmp/zerotrust-backend.log or $ROOT_DIR/logs/zerotrust-backend.log" >&2
fi

echo "Started. Backend logs: ${ROOT_DIR}/logs/zerotrust-backend.log /tmp/zerotrust-backend.log  Frontend logs: ${ROOT_DIR}/logs/zerotrust-frontend.log"

exit 0
