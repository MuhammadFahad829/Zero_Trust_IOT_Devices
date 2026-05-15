#!/usr/bin/env bash
set -euo pipefail

echo '== Integration smoke tests =='
echo 'Checking backend /devices'
curl -sS http://127.0.0.1:8000/devices | jq '.devices | {count: (length), sample: .[0]}' || true

echo
echo 'Checking backend /traffic'
curl -sS http://127.0.0.1:8000/traffic || true

echo
echo 'Checking that DHCP (dnsmasq) socket is bound (UDP 67)'
sudo ss -lunp | egrep ':67|:68' || echo 'DHCP not listening'

echo
echo 'Run scripts/verify_iptables.sh to inspect iptables rules'
