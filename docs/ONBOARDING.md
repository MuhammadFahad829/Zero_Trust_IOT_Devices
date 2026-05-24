# Onboarding & Operations — ZeroTrust IoT Gateway

This document describes local development, provisioning, segmentation macros, VLAN provisioning, and rollback steps.

## Run locally (dev)

- Create and activate Python venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

- Build frontend (when changing UI):

```bash
cd frontend
npm install
npm run build
```

- Start backend (recommended non-root with capabilities):

```bash
# Option A: grant capabilities so python can sniff as non-root
sudo setcap cap_net_raw,cap_net_admin+eip "/path/to/project/.venv/bin/python"
# then run as your user
.venv/bin/python backend/main.py

# Option B: run as root (not recommended for development)
sudo .venv/bin/python backend/main.py
```

- Serve frontend build (static):

```bash
npx serve -s frontend/build -l 3000
```

## Segmentation macros (batch assignment)

- Macros provide quick segment presets for common groups. Suggested macros:
  - `iot` -> VLAN 100, low bandwidth, quarantined-by-default
  - `guest` -> VLAN 200, limited access
  - `office` -> VLAN 300, full LAN access

- How to apply macros in UI: select devices → choose macro → Apply.
- Backend source of truth: `backend/policies.json` — update `segments` entries to add/remove macros.

## VLAN provisioning (scripts/create_vlans.sh)

- Dry-run (safe): prints commands without applying changes

```bash
./scripts/create_vlans.sh [path/to/policies.json]
```

- Apply (will run `ip` commands and require `sudo`):

```bash
sudo ./scripts/create_vlans.sh [path/to/policies.json] --apply
```

- The script expects `iface` entries like `eth0.100` — parent part is inferred (`eth0`). If your host interface differs (e.g., `wlp2s0`), update `backend/policies.json` or run a quick replace before applying.

- Troubleshooting:
  - `Cannot find device` → wrong parent interface. Use `ip link` to view available interfaces and adapt `policies.json`.
  - `RTNETLINK answers: File exists` → interface or bridge already exists; consider cleaning previous resources first.

## Safe cleanup (reversible)

- We move large artifacts to `./trash/removed_YYYYMMDD_HHMMSS/` instead of deleting.
- Restore by moving contents back to original locations.

## Rollback / revert

- Policies backup: the script and edits should be backed up. Example restore:

```bash
mv backend/policies.json.bak backend/policies.json
```

- Remove VLANs and bridges (cleanup):

```bash
sudo ip link set dev wlp2s0.100 down || true
sudo ip link delete wlp2s0.100 || true
sudo ip link set dev br-iot down || true
sudo ip link delete br-iot type bridge || true
```

## Tests

- Backend tests:

```bash
PYTHONPATH=./backend .venv/bin/python -m pytest backend/tests -q
```

- Integration: see `tests/integration/run_integration_tests.sh`.

## Notes

- Keep runtime artifacts out of Git using `.gitignore` (node_modules, frontend/build, .venv).
- Use `docs/PROJECT_STRUCTURE.md` and `docs/ONBOARDING.md` for operational guidance.

If you'd like, I can also add example segmentation macros to `backend/policies.json` or create a small CLI to apply macros to many devices.
