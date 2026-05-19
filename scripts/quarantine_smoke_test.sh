#!/usr/bin/env bash
# Quick smoke test for ZT quarantine behavior
# Usage: ./scripts/quarantine_smoke_test.sh <device-ip>

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <device-ip>"
  exit 2
fi

IP="$1"
BASE="http://localhost:8000"

echo "Blocking $IP via API..."
curl -s -X POST "$BASE/block/$IP" || true

echo "Checking ZT_SEGMENTS for quarantine jump for $IP"
# prefer running iptables inspection as root; use sudo -n to avoid interactive prompts
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo -n"
fi

# check segments chain jump
$SUDO iptables -S ZT_SEGMENTS 2>/dev/null | grep -E -- "-s $IP .*ZT_QUARANTINE" || echo "No explicit ZT_SEGMENTS jump found (ok if implemented differently)"

echo "Checking ZT_QUARANTINE contains DNS/public resolver blocks"
LOCAL_PATTERN='8\.8\.8\.8|8\.8\.4\.4|1\.1\.1\.1|1\.0\.0\.1|9\.9\.9\.9|149\.112\.112\.112|--dport 53'
$SUDO iptables -S ZT_QUARANTINE 2>/dev/null | grep -E -- "$LOCAL_PATTERN" || echo "ZT_QUARANTINE missing expected rules"

echo "Checking ip6tables (if IPv6)"
$SUDO ip6tables -S ZT_QUARANTINE 2>/dev/null || echo 'No ip6 ZT_QUARANTINE chain present'

echo "Now attempting to allow $IP via API..."
curl -s -X POST "$BASE/allow/$IP" || true

echo "Done. Note: this script requires sudo for iptables inspection."
