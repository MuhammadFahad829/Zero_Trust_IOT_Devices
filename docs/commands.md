# 1.AP / NM status:

nmcli device status
iw dev wlp2s0 info
ip -4 addr show dev wlp2s0
nmcli connection show --active

ip neigh show dev wlp2s0
curl -s http://127.0.0.1:8000/devices | jq '.devices'

nmcli -f ALL device show wlp2s0

# 2.DHCP server listening (on host):

sudo ss -lunp | egrep ':67|:68' || true

# 3.Firewall / NAT rules:

sudo iptables -t nat -S
sudo iptables -S

# 4.Backend logs (while you try to connect laptop):

sudo tail -f /tmp/zerotrust-backend.log

# 5.On the laptop (after attempting to connect):

# show assigned IP

# on laptop

ip -4 addr show
nmcli device wifi list # (if using NetworkManager)
sudo journalctl -f -u NetworkManager # watch association/DHCP logs (optional)
ping -c 4 10.42.0.1

ip -4 addr show

# test reachability to AP

ping -c 4 10.42.0.1

sudo ss -lunp | egrep ':67|:68' || true

cd '/run/media/fahad-mustafa/Local Disk/Zero_Trust_IOT_Devices'
nmcli dev wifi hotspot ifname wlp2s0 ssid ZeroTrust_IOT password 12345678

sudo ./run-backend.sh
sleep 2
tail -n 200 /tmp/zerotrust-backend.log

# Important

# Start backend (if not running)

cd '/run/media/fahad-mustafa/Local Disk/Zero_Trust_IOT_Devices'
sudo ./run-backend.sh
sleep 2
sudo tail -n 200 /tmp/zerotrust-backend.log

# Ensure hotspot is up (run if you want me to enable it)

sudo nmcli device wifi hotspot ifname wlp2s0 ssid ZeroTrust_IOT password 12345678

# After connecting device: check IP + neighbor + devices API

ip -4 addr show dev wlp2s0
ip neigh show dev wlp2s0
curl -s http://127.0.0.1:8000/devices | jq '.devices'

# Verify DHCP/NAT/enforcer

sudo ss -lunp | egrep ':67|:68' || echo "DHCP not listening"
sudo iptables -t nat -S
sudo iptables -S

# Exercise limits: generate traffic from client or run curl from client to external host

# Then check monitor and logs

curl -s http://127.0.0.1:8000/traffic | jq '.' || true
sudo tail -n 200 /tmp/zerotrust-backend.log | sed -n '1,200p'

# DHCP listener + NAT + iptables

sudo ss -lunp | egrep ':67|:68' || echo "DHCP not listening"
sudo iptables -t nat -S
sudo iptables -S | sed -n '1,200p'

# neighbor table

ip neigh show dev wlp2s0
curl -s http://127.0.0.1:8000/devices | jq '.devices'
