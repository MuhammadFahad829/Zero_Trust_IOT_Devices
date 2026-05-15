#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[*] Verifying Python backend syntax..."
python3 -m py_compile backend/*.py || { echo "Python compile failed"; exit 1; }

echo "[*] Building frontend (production)..."
cd frontend
npm install --silent
npm run build --silent
cd "$ROOT"

echo "[*] Starting backend (may require sudo)..."
# run-backend.sh handles pid and log; it uses sudo internally
sudo ./run-backend.sh || { echo "Failed to start backend"; exit 1; }

sleep 2

# Serve the static build so the UI is available at :3000
if [ -d "$ROOT/frontend/build" ]; then
  echo "[*] Serving frontend build on http://localhost:3000"
  # Use npx serve if available, fallback to python http.server
  if command -v npx >/dev/null 2>&1; then
    npx serve -s "$ROOT/frontend/build" -l 3000 >| /tmp/zerotrust-frontend.log 2>&1 &
  else
    (cd "$ROOT/frontend/build" && python3 -m http.server 3000 >| /tmp/zerotrust-frontend.log 2>&1 &) 
  fi
fi

sleep 2

# Quick health checks
echo "[*] Checking backend API..."
if curl -sSf http://127.0.0.1:8000/ >/dev/null; then
  echo "Backend OK"
else
  echo "Backend did not respond on port 8000"
fi

if curl -sSf http://127.0.0.1:8000/devices >/dev/null; then
  echo "Devices endpoint OK"
else
  echo "Devices endpoint failed"
fi

echo "[*] Logs: backend=/tmp/zerotrust-backend.log frontend=/tmp/zerotrust-frontend.log"
echo "Run 'sudo tail -f /tmp/zerotrust-backend.log' to follow backend logs."

echo "All started. Open http://localhost:3000 to view the dashboard."
