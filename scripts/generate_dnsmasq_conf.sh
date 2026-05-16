#!/usr/bin/env bash
set -euo pipefail
# Generate per-segment dnsmasq configuration files from backend/policies.json
# Usage: ./scripts/generate_dnsmasq_conf.sh [policies.json] [output_dir]

ROOTDIR="$(cd "$(dirname "$0")/.." && pwd)"
POLICIES=${1:-"${ROOTDIR}/backend/policies.json"}
OUTDIR=${2:-"${ROOTDIR}/deploy/dnsmasq"}

mkdir -p "$OUTDIR"
echo "Using policies: $POLICIES -> output: $OUTDIR"

python3 - <<PY
import json,sys
from pathlib import Path
import ipaddress

p=Path(sys.argv[1])
out=Path(sys.argv[2])
data=json.load(p.open())
segs=data.get('segments', [])
for s in segs:
    name=s.get('name')
    cidr=s.get('cidr')
    iface=s.get('iface')
    if not name or not cidr or not iface:
        continue
    net=ipaddress.ip_network(cidr)
    gw=str(next(net.hosts()))  # first usable
    # pick pool .100 - .200 if available
    hosts=list(net.hosts())
    start = hosts[99] if len(hosts) > 199 else hosts[9]
    end = hosts[199] if len(hosts) > 200 else hosts[-1]
    fname = out / f"{name}.conf"
    with fname.open('w') as fh:
        fh.write(f"# dnsmasq conf for segment {name}\n")
        fh.write(f"interface={iface}\n")
        fh.write("bind-interfaces\n")
        fh.write(f"dhcp-range={start},{end},12h\n")
        fh.write(f"dhcp-option=option:router,{gw}\n")
        fh.write(f"dhcp-option=option:dns-server,{gw}\n")
    print('wrote', fname)

PY "$POLICIES" "$OUTDIR"

echo "Generated dnsmasq configs in $OUTDIR. Copy into /etc/dnsmasq.d/ and restart dnsmasq."
