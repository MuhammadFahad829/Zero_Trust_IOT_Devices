#!/usr/bin/env bash
set -euo pipefail

echo '=== iptables (filter) ==='
sudo iptables -S || true
echo
echo '=== iptables (nat) ==='
sudo iptables -t nat -S || true
echo
echo '=== Forward policy ==='
sudo iptables -L FORWARD -n --line-numbers || true
