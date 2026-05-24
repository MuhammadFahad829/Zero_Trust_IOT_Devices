# Run

How to run this project (convenience commands)

Backend (recommended separate terminal):

```bash
# create & activate venv first if needed
python3 -m venv .venv
source .venv/bin/activate

# start backend (requires sudo for certain networking operations)
sudo ./run-backend.sh
# or use convenience script (also requires sudo)
sudo scripts/start-backend.sh
```

Frontend (development):

```bash
cd frontend
npm ci
npm start
# or use convenience script from repo root
scripts/start-frontend-dev.sh
```

Full runner (builds frontend and serves it, starts backend):

```bash
./run.sh
```
