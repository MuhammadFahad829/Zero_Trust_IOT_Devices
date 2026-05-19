PR assets and instructions for the `pr/dryrun-enforcement` pull request

Contents:
- `PR_BODY.md` – draft PR body (already created at repo root)
- `SCREENSHOTS.md` – instructions for capturing screenshots of AdminPanel and smoke-tests

Instructions to capture screenshots
1. Start backend in dry-run: `ZT_DRY_RUN=true PROVISION_TOKEN=<token> uvicorn backend.main:app --reload`
2. Start frontend dev server: `cd frontend && npm start`
3. Open browser to `http://localhost:3000`, navigate to Admin → Policies/Segments.
4. Toggle `Enforcement dry-run` in AdminPanel and capture the console/backend logs showing `[DRY_RUN] would run:` messages.

Save screenshots into this folder and reference them in the PR.
