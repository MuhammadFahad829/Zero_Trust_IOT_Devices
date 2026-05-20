#!/usr/bin/env bash
set -euo pipefail
# Generate per-segment dnsmasq configuration files from backend/policies.json
# Usage: ./scripts/generate_dnsmasq_conf.sh [policies.json] [output_dir]

ROOTDIR="$(cd "$(dirname "$0")/.." && pwd)"
POLICIES=${1:-"${ROOTDIR}/backend/policies.json"}
OUTDIR=${2:-"${ROOTDIR}/infra/deploy/dnsmasq"}

mkdir -p "$OUTDIR"
echo "Using policies: $POLICIES -> output: $OUTDIR"

python3 - "$POLICIES" "$OUTDIR" <<'PY'
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
    import subprocess, os, tempfile
    net=ipaddress.ip_network(cidr)
    gw=str(next(net.hosts()))  # first usable
    # pick pool .100 - .200 if available
    hosts=list(net.hosts())
    start = hosts[99] if len(hosts) > 199 else hosts[9]
    end = hosts[199] if len(hosts) > 200 else hosts[-1]
    fname = out / f"{name}.conf"
    # check that interface exists (warn if not)
    iface_ok = subprocess.run(["ip","link","show",iface], capture_output=True, text=True).returncode == 0
    tmp = None
    try:
        with tempfile.NamedTemporaryFile('w', delete=False, dir=out, prefix=f"{name}.", suffix='.tmp') as fh:
            tmp = fh.name
            fh.write(f"# dnsmasq conf for segment {name}\n")
            fh.write(f"# generated for iface={iface} (exists={iface_ok})\n")
            fh.write(f"interface={iface}\n")
            fh.write("bind-interfaces\n")
            fh.write(f"dhcp-range={start},{end},12h\n")
            fh.write(f"dhcp-option=option:router,{gw}\n")
            fh.write(f"dhcp-option=option:dns-server,{gw}\n")
        os.replace(tmp, fname)
        print('wrote', fname)
        if not iface_ok:
            print('# warning: interface', iface, 'not present on this host')
    finally:
        try:
            if tmp and os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
PY

echo "Generated dnsmasq configs in $OUTDIR. Copy into /etc/dnsmasq.d/ and restart dnsmasq."
