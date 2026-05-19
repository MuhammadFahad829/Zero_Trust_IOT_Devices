#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Activate virtualenv if present
if [ -f ".venv/bin/activate" ]; then
  # shellcheck source=/dev/null
  source ".venv/bin/activate"
fi

# Kill previous backend if running
if lsof -t -i:8000 >/dev/null 2>&1; then
  echo "Stopping process on :8000"
  lsof -t -i:8000 | xargs -r kill -9 || true
fi

# Start backend in background (logs to backend.log)
echo "Starting backend..."
nohup uvicorn backend.main:app --reload --port 8000 > backend.log 2>&1 &
BACK_PID=$!
echo "Backend PID: $BACK_PID"

# Start frontend (will run in foreground)
if [ -d "$ROOT_DIR/frontend" ]; then
  echo "Starting frontend (npm start)..."
  cd "$ROOT_DIR/frontend"
  npm start
else
  echo "No frontend directory found. Backend started only."
fi
