# prepare python env (if not yet)

python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# start backend (requires sudo because of networking operations)

sudo ./run-backend.sh

# watch logs

tail -f logs/zerotrust-backend.log

# in a separate terminal: build and serve frontend

cd frontend
npm ci
npm run build

# serve the built frontend:

npx serve -s build -l 3000

# full-stack launcher from repo root

./run.sh
