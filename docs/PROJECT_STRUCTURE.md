# Project Structure — ZeroTrustMaster

This document describes the recommended folder and file layout for the project and quick notes for maintenance.

- ZeroTrustMaster/
  - backend/
    - main.py — FastAPI app & startup
    - monitor.py — TrafficMonitor and packet capture
    - database.py — SQLite helpers + CRUD
    - models/ — Pydantic / ORM models
    - api/ — routers (devices, traffic, mode, logs, provision)
    - utils/ — helper modules (device identity, traffic parsing, broadcast manager)
    - policies.json — segment definitions (VLANs, limits)
    - requirements.txt or pyproject.toml
    - tests/ — backend unit tests
  - frontend/
    - package.json
    - src/
      - App.jsx
      - index.jsx
      - components/
        - DeviceCard.jsx
        - Sidebar.jsx
        - AuditLogsTable.jsx
        - ThreatVault.jsx
        - NetworkTopology.jsx
        - AdminPanel.jsx
      - styles/ — Tailwind config + CSS
      - utils/ — frontend helpers
    - public/
    - build/ — generated production build (remove from repo)
  - scripts/
    - create_vlans.sh
    - generate_dnsmasq_conf.sh
    - run_all.sh
    - run-backend.sh
    - stop-backend.sh
    - verify_iptables.sh
    - assert_iptables.sh
  - tests/
    - integration/
      - run_integration_tests.sh
  - infra/
    - docker-compose.yml
    - k8s/ — optional deployment manifests
  - docs/
    - PROJECT_STRUCTURE.md (this file)
    - README.md
    - ARCHITECTURE.md
    - ONBOARDING.md
  - .github/
    - workflows/
      - ci.yml
  - trash/ — reversible moves of large artifacts (node_modules/build)
  - .venv/ — local environment (exclude from VCS)
  - README.md
  - LICENSE

Notes and recommendations
- Do NOT commit runtime artifacts to git: add `node_modules/`, `frontend/build/`, and `.venv/` to `.gitignore`.
- `backend/policies.json` is the single source of truth for segments/VLANs; scripts read it for provisioning.
- Keep `scripts/` small and well documented; prefer dry-run behavior by default and `--apply` for live changes.
- For local development, run backend as non-root where possible; grant capabilities to the venv Python binary if packet capture is required:

```
sudo setcap cap_net_raw,cap_net_admin+eip "/path/to/project/.venv/bin/python"
```

- Use `docs/ONBOARDING.md` to record segmentation macros, common provisioning commands, and safe rollback steps.

Maintenance tips
- Rebuild frontend when editing UI: `cd frontend && npm run build`.
- Run tests: `PYTHONPATH=./backend .venv/bin/python -m pytest -q`.
- To revert moved artifacts: `mv trash/removed_YYYYMMDD/node_modules frontend/node_modules` (reverse for `build`).

If you want, I can also create a `.gitignore` or `docs/ONBOARDING.md` next.