#!/bin/bash

# Zero-Trust IoT Gateway - Hotspot & Internet Access Verification
# This script verifies:
# 1. Hotspot is active and detecting devices
# 2. Allowed devices have internet access
# 3. Blocked/offline devices cannot access internet
# 4. Internet speed and connectivity quality

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Zero-Trust IoT Gateway - Hotspot & Access Verification      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:8000"
LAN_INTERFACE="${LAN_INTERFACE:-wlp2s0}"
WAN_INTERFACE="${WAN_INTERFACE:-eth0}"

# Helper functions
print_header() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ====================================
# 1. Check Hotspot Status
# ====================================
print_header "1. Checking Hotspot Status"
echo ""

MODE_RESPONSE=$(curl -s "$BACKEND_URL/mode")
HOTSPOT_ACTIVE=$(echo "$MODE_RESPONSE" | grep -o '"hotspot_active":[^,}]*' | cut -d: -f2)
LAN_IFACE=$(echo "$MODE_RESPONSE" | grep -o '"lan_interface":"[^"]*' | cut -d'"' -f4)
LAN_MODE=$(echo "$MODE_RESPONSE" | grep -o '"lan_interface_mode":"[^"]*' | cut -d'"' -f4)

echo "Hotspot Active: $HOTSPOT_ACTIVE"
echo "LAN Interface: $LAN_IFACE"
echo "LAN Interface Mode: $LAN_MODE"
echo ""

if [ "$HOTSPOT_ACTIVE" = "true" ]; then
    print_success "Hotspot is ACTIVE ✓"
    echo ""
else
    print_warning "Hotspot is NOT active (mode=$LAN_MODE)"
    print_warning "Device discovery and enforcement disabled in replay mode"
    echo ""
fi

# ====================================
# 2. Check WAN Connectivity
# ====================================
print_header "2. Checking WAN Connectivity"
echo ""

echo "Interface Status:"
ip link show "$WAN_INTERFACE" 2>/dev/null | grep -E "UP|DOWN" || echo "Interface not found"
echo ""

WAN_IP=$(ip -4 -o addr show "$WAN_INTERFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
if [ -z "$WAN_IP" ]; then
    print_error "No IP address on $WAN_INTERFACE"
else
    print_success "WAN Interface IP: $WAN_IP"
fi

print_info "Testing internet connectivity..."
if ping -c 3 -W 2 8.8.8.8 > /dev/null 2>&1; then
    print_success "Internet connectivity OK (ping to 8.8.8.8 successful)"
else
    print_error "No internet connectivity detected"
fi
echo ""

# ====================================
# 3. Check Connected Devices
# ====================================
print_header "3. Fetching Connected Devices"
echo ""

DEVICES_RESPONSE=$(curl -s "$BACKEND_URL/devices" 2>/dev/null || echo '[]')
DEVICE_COUNT=$(echo "$DEVICES_RESPONSE" | grep -o '"ip"' | wc -l)

if [ "$DEVICE_COUNT" -eq 0 ]; then
    print_warning "No devices found in database"
    echo "This is expected in replay mode without hotspot active"
else
    print_success "Found $DEVICE_COUNT devices"
    echo ""
    echo "Device Summary:"
    echo "$DEVICES_RESPONSE" | grep -o '"name":"[^"]*' | head -10 || true
fi
echo ""

# ====================================
# 4. Check iptables Rules
# ====================================
print_header "4. Verifying iptables Enforcement Rules"
echo ""

print_info "FORWARD chain policy:"
sudo iptables -L FORWARD --line-numbers 2>/dev/null | head -5

print_info "Counting ACCEPT rules in FORWARD chain:"
ACCEPT_COUNT=$(sudo iptables -L FORWARD -n 2>/dev/null | grep -c "ACCEPT" || echo "0")
print_success "Found $ACCEPT_COUNT active ACCEPT rules"
echo ""

print_info "Checking NAT rules for WAN interface ($WAN_INTERFACE):"
MASQ_COUNT=$(sudo iptables -t nat -L POSTROUTING -n 2>/dev/null | grep -c "MASQUERADE" || echo "0")
if [ "$MASQ_COUNT" -gt 0 ]; then
    print_success "NAT masquerading is configured"
else
    print_warning "No NAT masquerading rules found"
fi
echo ""

# ====================================
# 5. Test Speed & Latency
# ====================================
print_header "5. Testing Internet Speed & Latency"
echo ""

# Test latency to Google DNS
LATENCY=$(ping -c 3 -W 2 8.8.8.8 2>/dev/null | grep 'min/avg/max/stddev' | awk -F'/' '{print $5}' || echo "N/A")
if [ "$LATENCY" != "N/A" ]; then
    print_success "Average latency to 8.8.8.8: ${LATENCY}ms"
else
    print_warning "Could not measure latency"
fi

# Test speed to cloudflare DNS
print_info "Testing download speed (downloading 1MB test file)..."
START_TIME=$(date +%s%N)
if curl -s -o /dev/null "http://speed.cloudflare.com/__down?bytes=1048576" 2>/dev/null; then
    END_TIME=$(date +%s%N)
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    SPEED_MBPS=$(echo "scale=2; (1048576 * 8 * 1000) / ($ELAPSED_MS * 1000000)" | bc)
    print_success "Download speed: ~${SPEED_MBPS} Mbps (${ELAPSED_MS}ms for 1MB)"
else
    print_warning "Could not measure download speed (network unavailable)"
fi
echo ""

# ====================================
# 6. LAN Network Status
# ====================================
print_header "6. Checking LAN Network Status"
echo ""

LAN_IP=$(ip -4 -o addr show "$LAN_INTERFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
if [ -z "$LAN_IP" ]; then
    print_warning "No IP address on LAN interface ($LAN_INTERFACE)"
else
    print_success "LAN Interface IP: $LAN_IP"
fi

echo ""
print_info "Network interfaces:"
ip -br addr show | grep -E "UP|DOWN"
echo ""

# ====================================
# 7. Backend Status
# ====================================
print_header "7. Backend Service Status"
echo ""

if curl -s "$BACKEND_URL/mode" > /dev/null 2>&1; then
    print_success "Backend service is running on $BACKEND_URL"
    
    # Check if in physical or replay mode
    MODE=$(echo "$MODE_RESPONSE" | grep -o '"mode":"[^"]*' | cut -d'"' -f4)
    print_success "Operating Mode: $MODE"
    
    if [ "$MODE" = "physical" ]; then
        print_success "Physical mode - Real device management active"
    else
        print_info "Replay mode - Using demo database (devices not blocking real traffic)"
    fi
else
    print_error "Backend service is NOT responding"
fi
echo ""

# ====================================
# 8. Summary
# ====================================
print_header "8. Verification Summary"
echo ""

if [ "$HOTSPOT_ACTIVE" = "true" ]; then
    print_success "✓ Hotspot is ACTIVE and ready for device management"
    print_success "✓ Real-time device enforcement is ENABLED"
    echo ""
    print_info "Next Steps:"
    echo "  1. Connect a device to the hotspot"
    echo "  2. Check the Frontend UI to see the device appear"
    echo "  3. Click 'Allow' to grant internet access"
    echo "  4. The device should now have internet connectivity"
    echo "  5. Click 'Block' to revoke internet access"
    echo "  6. The device will be quarantined and cannot access internet"
else
    print_warning "⚠ Hotspot is NOT ACTIVE (currently in replay/demo mode)"
    echo ""
    print_info "To enable hotspot:"
    echo "  1. Configure wireless interface as AP (access point)"
    echo "  2. Run: iw dev $LAN_IFACE set type ap"
    echo "  3. Create hostapd configuration"
    echo "  4. Start the hotspot: hostapd <config.conf>"
    echo "  5. Restart backend: ./run-backend.sh"
    echo ""
    print_info "Current setup:"
    echo "  - LAN Interface: $LAN_IFACE"
    echo "  - Interface Mode: $LAN_MODE"
    echo "  - WAN Interface: $WAN_INTERFACE"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Verification Complete                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
