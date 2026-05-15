#!/usr/bin/env bash
set -euo pipefail

echo 'Running iptables assertions...'

missing=0

echo -n '1) Check FORWARD default policy is DROP: '
if sudo iptables -L FORWARD -n | grep -q 'policy DROP'; then
  echo 'OK'
else
  echo 'MISSING'
  missing=$((missing+1))
fi

echo -n '2) Check NAT MASQUERADE in POSTROUTING: '
if sudo iptables -t nat -S | grep -q 'MASQUERADE'; then
  echo 'OK'
else
  echo 'MISSING'
  missing=$((missing+1))
fi

echo -n '3) Check ZT_SEGMENTS chain exists (if used): '
if sudo iptables -S | grep -q 'ZT_SEGMENTS'; then
  echo 'OK'
else
  echo 'NOT FOUND (optional)'
fi

echo
if [[ $missing -eq 0 ]]; then
  echo 'All critical iptables assertions passed.'
  exit 0
else
  echo "$missing critical assertions failed. Inspect with scripts/verify_iptables.sh"
  exit 2
fi
