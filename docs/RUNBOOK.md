# Runbook — Zero Trust IoT Gateway

Quick steps to start and verify the system locally.

Start hotspot (NetworkManager):

```bash
sudo nmcli device wifi hotspot ifname wlp2s0 ssid ZeroTrust_IOT password 12345678
```

Start backend (run from repo root):

```bash
sudo ./run-backend.sh
sleep 2
tail -n 200 /tmp/zerotrust-backend.log
```

Verify services and APIs:

```bash
curl -s http://127.0.0.1:8000/devices | jq '.devices'
curl -s http://127.0.0.1:8000/traffic | jq '.'
```

Inspect DHCP and iptables:

```bash
sudo ss -lunp | egrep ':67|:68' || echo "DHCP not listening"
sudo iptables -t nat -S
sudo iptables -S
```

Quick smoke tests (from repo root):

```bash
./tests/integration/run_integration_tests.sh
```

Monitoring:

Run the lightweight exporter (optional):

```bash
python3 backend/metrics_exporter.py &
```

Then open `http://<host>:8001/metrics` for Prometheus scraping.
