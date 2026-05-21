#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".venv/bin/activate" ]; then
  # shellcheck source=/dev/null
  source ".venv/bin/activate"
fi

if [[ $EUID -ne 0 ]]; then
  echo "Starting backend (requires sudo for networking operations). Run with: sudo $0"
  exit 1
fi

echo "Starting backend using run-backend.sh"
exec sudo "$ROOT_DIR/run-backend.sh"
