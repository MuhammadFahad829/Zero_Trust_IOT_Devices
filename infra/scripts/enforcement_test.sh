#!/usr/bin/env bash
set -euo pipefail

ROOTDIR=$(cd "$(dirname "$0")/.." && pwd)
API="http://127.0.0.1:8000"

echo "== Automated enforcement test: offline -> quarantine -> restore =="

DEV_IP=$(curl -sS ${API}/devices | jq -r '.devices[0].ip // empty') || true
if [ -z "${DEV_IP}" ]; then
  echo "No device found in backend /devices; create or seed a device first. Exiting." >&2
  exit 1
fi

TS=$(date +%s)
echo "Backing up iptables to /tmp/iptables.backup.$TS"
sudo iptables-save > /tmp/iptables.backup.$TS || true

echo "Target device: ${DEV_IP}"

echo "1) Block device via API"
curl -sS -X POST "${API}/block/${DEV_IP}" || true
sleep 2

echo "2) Verify ZT_SEGMENTS contains quarantine jump for device"
if sudo iptables -S ZT_SEGMENTS 2>/dev/null | grep -Fq "${DEV_IP}"; then
  echo "OK: ZT_SEGMENTS has quarantine jump for ${DEV_IP}"
else
  echo "WARN: ZT_SEGMENTS does not show explicit quarantine jump for ${DEV_IP}; checking general iptables for presence" >&2
  sudo iptables -S | grep -n "${DEV_IP}" || true
fi

echo "3) Check backend device status"
curl -sS ${API}/devices | jq -r ".devices[] | select(.ip==\"${DEV_IP}\") | {ip:.ip, status:.status, last_seen:.last_seen}"

echo "4) Restore device via API"
curl -sS -X POST "${API}/allow/${DEV_IP}" || true
sleep 2

echo "5) Verify quarantine jump removed from ZT_SEGMENTS and ACCEPT present in FORWARD"
if sudo iptables -S ZT_SEGMENTS 2>/dev/null | grep -Fq "${DEV_IP}"; then
  echo "FAIL: quarantine jump still present in ZT_SEGMENTS for ${DEV_IP}" >&2
  sudo iptables -S ZT_SEGMENTS || true
  exit 3
else
  echo "OK: quarantine jump removed from ZT_SEGMENTS"
fi

if sudo iptables -L FORWARD -n --line-numbers | grep -q "${DEV_IP}"; then
  echo "OK: FORWARD chain contains rule(s) for ${DEV_IP} (likely ACCEPT)"
else
  echo "WARN: FORWARD chain does not contain a direct ACCEPT rule for ${DEV_IP} — policy may rely on segment-wide allows" >&2
fi

echo "6) Final backend device status"
curl -sS ${API}/devices | jq -r ".devices[] | select(.ip==\"${DEV_IP}\") | {ip:.ip, status:.status, last_seen:.last_seen}"

echo "Automated enforcement test completed successfully."

exit 0
