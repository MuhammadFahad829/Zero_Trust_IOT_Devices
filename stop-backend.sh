#!/usr/bin/env bash
set -euo pipefail
PIDFILE="/tmp/zerotrust-backend.pid"

if [[ -f "$PIDFILE" ]]; then
  pid="$(<"$PIDFILE")"
  if ps -p "$pid" > /dev/null 2>&1; then
    sudo kill "$pid"
    echo "Stopped backend PID $pid"
  else
    echo "No running backend found for PID $pid"
  fi
  rm -f "$PIDFILE"
else
  echo "No pid file found at $PIDFILE"
fi