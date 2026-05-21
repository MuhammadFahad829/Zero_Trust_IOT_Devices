#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ -f "package-lock.json" ] && [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies (npm ci)"
  npm ci
fi

echo "Starting frontend dev server"
exec npm start
