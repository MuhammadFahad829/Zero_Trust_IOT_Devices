#!/usr/bin/env bash
set -euo pipefail
# Create VLAN interfaces and optional bridges based on backend/policies.json
# Usage: ./scripts/create_vlans.sh [policies.json] [--apply]

ROOTDIR="$(cd "$(dirname "$0")/.." && pwd)"
POLICIES=${1:-"${ROOTDIR}/backend/policies.json"}
APPLY=false
if [ "${2:-}" = "--apply" ]; then
  APPLY=true
fi

echo "Using policies: $POLICIES"

python3 - <<PY
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
if not p.exists():
    print('# policies file not found:', p)
    sys.exit(1)
data=json.load(p.open())
segs=data.get('segments', [])
for s in segs:
    name=s.get('name')
    iface=s.get('iface')
    vlan=s.get('vlan_id')
    if not name:
        continue
    if iface and vlan:
        print(f"# SEGMENT {name} -> VLAN {vlan} iface {iface}")
        # infer parent interface (e.g., eth0.100 -> eth0)
        parent=iface.split('.')[0]
        print(f"sudo ip link add link {parent} name {iface} type vlan id {vlan}")
        print(f"sudo ip link set dev {iface} up")
        br=f"br-{name}"
        print(f"sudo ip link add name {br} type bridge || true")
        print(f"sudo ip link set dev {br} up")
        print(f"sudo ip link set dev {iface} master {br}")
        # note: IP addressing/dnsmasq is created separately
    elif iface:
        print(f"# SEGMENT {name} -> iface {iface} (no vlan_id)")
        print(f"sudo ip link set dev {iface} up")
    else:
        print(f"# SEGMENT {name} has no iface/vlan configured; skipping L2 provisioning")

PY "$POLICIES"

if [ "$APPLY" = true ]; then
  echo "Applying changes... (already printed commands above)"
  # Re-run python to execute commands directly
  python3 - <<PY
import json,sys,subprocess
from pathlib import Path
p=Path(sys.argv[1])
data=json.load(p.open())
segs=data.get('segments', [])
for s in segs:
    name=s.get('name')
    iface=s.get('iface')
    vlan=s.get('vlan_id')
    if iface and vlan:
        parent=iface.split('.')[0]
        subprocess.run(["sudo","ip","link","add","link",parent,"name",iface,"type","vlan","id",str(vlan)])
        subprocess.run(["sudo","ip","link","set","dev",iface,"up"])
        br=f"br-{name}"
        subprocess.run(["sudo","ip","link","add","name",br,"type","bridge"], check=False)
        subprocess.run(["sudo","ip","link","set","dev",br,"up"])
        subprocess.run(["sudo","ip","link","set","dev",iface,"master",br])
    elif iface:
        subprocess.run(["sudo","ip","link","set","dev",iface,"up"], check=False)

PY "$POLICIES"
fi

echo "Done. If you used --apply, VLAN interfaces/bridges were created."
