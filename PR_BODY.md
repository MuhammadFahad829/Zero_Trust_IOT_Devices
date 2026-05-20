Title: Add enforcement dry-run toggle, quarantine hardening, and smoke-test

Summary

- Adds a safe "dry-run" mode for enforcement that simulates iptables changes.
- Hardens quarantine rules to actively block DNS and common proxy ports (IPv4 + IPv6 public resolvers).
- Adds backend audit logging for dry-run toggles and AdminPanel UI confirmation before toggling.
- Adds a non-interactive smoke-test script to validate quarantine flows.

Files changed (high level)

- `backend/enforcement.py`: added ZT_QUARANTINE IPv4/IPv6 resolver blocks and dry-run simulation support.
- `backend/main.py`: added `/enforcer/dryrun` GET/POST endpoints and audit logging for toggles.
- `frontend/src/components/AdminPanel.jsx`: fetch dry-run state, toggle with confirmation, require `PROVISION_TOKEN` for changes.
- `scripts/quarantine_smoke_test.sh`: fixed to be non-interactive and tolerant when not root.
- Misc: `.gitignore` updates, PR assets, and removal of backup files.

How to test (recommended)

1. Start backend in dry-run mode:

   ZT_DRY_RUN=true PROVISION_TOKEN=<token> uvicorn backend.main:app --reload

2. Start frontend dev server:

   cd frontend && npm start

3. Open AdminPanel, ensure `PROVISION_TOKEN` is set in localStorage, toggle "Enforcement dry-run" and observe backend logs showing simulated commands prefixed with `[DRY_RUN] would run:`.

4. Run the smoke-test (optional, non-destructive with dry-run enabled):

   ./scripts/quarantine_smoke_test.sh 10.0.0.5

Notes

- The branch `pr/dryrun-enforcement` contains these changes. I will not push or open the PR until you provide the repository remote or explicitly ask me to push.
- If `PROVISION_TOKEN` is set in the backend, include `Authorization: Bearer <token>` for toggle/patch endpoints.

Ready to push: run `git remote add origin <REPO_URL>` then `git push -u origin pr/dryrun-enforcement`.
