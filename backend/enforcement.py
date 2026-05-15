import subprocess
import shlex
from typing import Dict, Optional
import database


class EnforcementEngine:
    def __init__(self, wan_iface: str = "eth0", lan_iface: str = "wlp2s0", segments: Optional[Dict[str, str]] = None):
        """
        wan_iface: Internet input interface (e.g., Ethernet)
        lan_iface: Default LAN / hotspot output interface (e.g., Wi-Fi)
        segments: Optional mapping of segment name -> interface for multi-segment setups
        """
        self.wan = wan_iface
        self.lan = lan_iface
        self.segments = segments or {}

    def _run_cmd(self, command: str) -> bool:
        """Safely executes a shell command using shlex for input sanitization."""
        try:
            result = subprocess.run(shlex.split(command), check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode().strip() if e.stderr else str(e)
            print(f"[!] Execution Error: {stderr}")
            return False

    def _check_cmd(self, command: str) -> bool:
        """Run a command and return True if it exits 0, False otherwise (no noisy output)."""
        try:
            subprocess.run(shlex.split(command), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            return False

    def setup_gateway(self) -> bool:
        """Initializes the Zero-Trust environment with a default deny policy and NAT."""
        print("[*] Configuring Linux Kernel for Zero-Trust Routing...")
        # Enable IPv4 forwarding immediately and persist via sysctl file
        if not self._run_cmd("sudo sysctl -w net.ipv4.ip_forward=1"):
            return False
        try:
            with open('/etc/sysctl.d/99-zerotrust.conf', 'a') as fh:
                fh.write('net.ipv4.ip_forward=1\n')
        except Exception:
            # not fatal if we cannot write persistence file
            pass

        # Set default FORWARD policy to DROP (idempotent)
        if not self._check_cmd(f"sudo iptables -P FORWARD DROP"):
            # try to set it anyway (will print on failure)
            if not self._run_cmd(f"sudo iptables -P FORWARD DROP"):
                return False

        # Ensure established/related forwarding allowed (idempotent insert via -C check)
        related_cmd = "sudo iptables -C FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT"
        if not self._check_cmd(related_cmd):
            if not self._run_cmd("sudo iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT"):
                return False

        # Ensure a single MASQUERADE rule exists in POSTROUTING for WAN interface
        wan_quoted = shlex.quote(self.wan)
        nat_check = f"sudo iptables -t nat -C POSTROUTING -o {wan_quoted} -j MASQUERADE"
        if not self._check_cmd(nat_check):
            nat_add = f"sudo iptables -t nat -A POSTROUTING -o {wan_quoted} -j MASQUERADE"
            if not self._run_cmd(nat_add):
                return False
        else:
            # Normalize duplicates: if multiple identical MASQUERADE entries exist,
            # delete all and ensure exactly one remains to avoid NAT processing overhead.
            try:
                out = subprocess.run(["iptables", "-t", "nat", "-S", "POSTROUTING"], check=True, capture_output=True, text=True)
                lines = [l.strip() for l in out.stdout.splitlines()]
                match = f"-A POSTROUTING -o {self.wan} -j MASQUERADE"
                matches = [l for l in lines if l == match]
                if len(matches) > 1:
                    # delete all matching rules first
                    for _ in range(len(matches)):
                        try:
                            subprocess.run(["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", "-o", self.wan, "-j", "MASQUERADE"], check=True, capture_output=True)
                        except Exception:
                            pass
                    # add a single normalized rule
                    if not self._run_cmd(f"sudo iptables -t nat -A POSTROUTING -o {wan_quoted} -j MASQUERADE"):
                        return False
            except Exception:
                # best-effort normalization; ignore failures
                pass

        print("[+] Zero-Trust Lockdown Active. Internet is now restricted.")
        # Ensure segment chain exists and is attached
        try:
            # create custom chain if missing
            subprocess.run(["sudo", "iptables", "-N", "ZT_SEGMENTS"], check=False, capture_output=True)
            # ensure FORWARD jumps to ZT_SEGMENTS early
            if not self._check_cmd("sudo iptables -C FORWARD -j ZT_SEGMENTS"):
                subprocess.run(["sudo", "iptables", "-I", "FORWARD", "-j", "ZT_SEGMENTS"], check=False, capture_output=True)
        except Exception:
            pass
        return True

    def apply_segment_policies(self) -> bool:
        """Rebuild ZT_SEGMENTS chain based on database `segment` assignments.

        Policy: allow forwarding between hosts that share the same non-empty segment.
        All other inter-LAN forwarding remains subject to default DROP unless explicit ACCEPT exists.
        """
        try:
            # Flush chain
            subprocess.run(["sudo", "iptables", "-F", "ZT_SEGMENTS"], check=False, capture_output=True)
            devices = database.list_devices()
            # group by segment
            seg_map = {}
            for d in devices:
                seg = d.get("segment") or ""
                ip = d.get("ip")
                if not ip:
                    continue
                seg_map.setdefault(seg, []).append(ip)

            # For each non-empty segment, allow traffic between pairs
            for seg, ips in seg_map.items():
                if not seg:
                    continue
                for src in ips:
                    for dst in ips:
                        if src == dst:
                            continue
                        # insert rule to accept forwarding between src->dst
                        try:
                            subprocess.run(["sudo", "iptables", "-A", "ZT_SEGMENTS", "-s", src, "-d", dst, "-j", "ACCEPT"], check=False, capture_output=True)
                        except Exception:
                            pass
            return True
        except Exception:
            return False

    def _iface_for_segment(self, segment: Optional[str]) -> str:
        if segment and segment in self.segments:
            return self.segments[segment]
        return self.lan

    def allow_device(self, ip: str, segment: Optional[str] = None) -> bool:
        """Insert an ACCEPT rule for a verified IP on the appropriate segment interface."""
        iface = self._iface_for_segment(segment)
        check_cmd = f"sudo iptables -C FORWARD -s {shlex.quote(ip)} -i {shlex.quote(iface)} -j ACCEPT"
        # If rule already exists, nothing to do
        if self._check_cmd(check_cmd):
            print(f"[SUCCESS] Access already granted to {ip} on {iface}")
            return True

        add_cmd = f"sudo iptables -I FORWARD -s {shlex.quote(ip)} -i {shlex.quote(iface)} -j ACCEPT"
        if self._run_cmd(add_cmd):
            print(f"[SUCCESS] Access granted to {ip} on {iface}")
            return True
        return False

    def block_device(self, ip: str, segment: Optional[str] = None) -> bool:
        """Remove a previously-inserted ACCEPT rule, returning device to default DROP policy."""
        iface = self._iface_for_segment(segment)
        del_cmd = f"sudo iptables -D FORWARD -s {shlex.quote(ip)} -i {shlex.quote(iface)} -j ACCEPT"
        removed_any = False
        # Attempt to delete matching rules repeatedly until none remain
        while True:
            try:
                subprocess.run(shlex.split(del_cmd), check=True, capture_output=True)
                removed_any = True
            except subprocess.CalledProcessError:
                break

        if removed_any:
            print(f"[QUARANTINE] Access revoked for {ip} on {iface}")
            return True

        # No rule found — already blocked by policy
        print(f"[QUARANTINE] {ip} already blocked on {iface}")
        return True

    def apply_raw_rule(self, rule_cmd: str) -> bool:
        """Apply a raw iptables rule string after sanitizing with shlex.
        Use with caution — prefer the structured helpers above."""
        return self._run_cmd(rule_cmd)

