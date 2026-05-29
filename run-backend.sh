#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"
PYTHON="$VENV/bin/python"
PIDFILE="/tmp/zerotrust-backend.pid"
LOG_DIR="$ROOT/logs"
LOGFILE="$LOG_DIR/zerotrust-backend.log"
EXPORTER_LOG="$LOG_DIR/zerotrust-exporter-runtime.log"
PIDFILE="$LOG_DIR/zerotrust-backend.pid"
EXPORTER_PIDFILE="$LOG_DIR/zerotrust-exporter.pid"

if [[ ! -x "$PYTHON" ]]; then
  echo "Virtualenv not found. Create it with: python3 -m venv .venv"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Warning: starting backend without root. Networking actions may require sudo later."
  export ZT_DRY_RUN=1
fi

cd "$ROOT"
mkdir -p "$LOG_DIR"

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(<"$PIDFILE")"
  if ps -p "$oldpid" > /dev/null 2>&1; then
    echo "Backend already running with PID $oldpid"
    echo "Log file: $LOGFILE"
    exit 0
  fi
  rm -f "$PIDFILE"
fi

if [[ "${CLEAN_START:-false}" == "true" ]]; then
  rm -f backend/zerotrust.db
  echo "Clean start: removed backend/zerotrust.db"
fi

rm -f "$LOGFILE" "$PIDFILE"
nohup "$PYTHON" -m backend.main >| "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

# Start metrics exporter (non-fatal)
if [[ -x "$PYTHON" && -f backend/metrics_exporter.py ]]; then
  nohup "$PYTHON" -m backend.metrics_exporter >| "$EXPORTER_LOG" 2>&1 &
  echo $! > "$EXPORTER_PIDFILE"
  echo "Metrics exporter started with PID $(<"$EXPORTER_PIDFILE") (logs: $EXPORTER_LOG)"
fi

echo "Backend started with PID $(<"$PIDFILE")"
echo "Log file: $LOGFILE"

cat <<EOF
Helpful commands:
  sudo tail -f $LOGFILE
  curl http://127.0.0.1:8000/devices
  curl -X POST http://127.0.0.1:8000/block/<ip>
  curl -X POST http://127.0.0.1:8000/allow/<ip>
EOF