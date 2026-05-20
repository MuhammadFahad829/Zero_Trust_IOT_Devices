import subprocess
import shlex
import json
from pathlib import Path
from typing import Dict, Optional
import database


class EnforcementEngine:
    def __init__(self, wan_iface: str = "eth0", lan_iface: str = "wlp2s0", segments: Optional[Dict[str, str]] = None, dry_run: bool = False):
        """
        wan_iface: Internet input interface (e.g., Ethernet)
        lan_iface: Default LAN / hotspot output interface (e.g., Wi-Fi)
        segments: Optional mapping of segment name -> interface for multi-segment setups
        """
        self.wan = wan_iface
        self.lan = lan_iface
        self.segments = segments or {}
        self.dry_run = bool(dry_run)
        # policy_defs holds the raw policy objects from policies.json
        self.policy_defs: Dict[str, dict] = {}
        # Attempt to load policies.json from the backend directory
        try:
            self.load_policies()
        except Exception:
            # best-effort; do not fail initialization if policies missing or malformed
            pass

    def _run_cmd(self, command: str) -> bool:
        """Safely executes a shell command using shlex for input sanitization."""
        if self.dry_run:
            print(f"[DRY_RUN] would run: {command}")
            return True
        try:
            result = subprocess.run(shlex.split(command), check=True, capture_output=True)
            return True
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode().strip() if e.stderr else str(e)
            print(f"[!] Execution Error: {stderr}")
            return False

    def _check_cmd(self, command: str) -> bool:
        """Run a command and return True if it exits 0, False otherwise (no noisy output)."""
        if self.dry_run:
            print(f"[DRY_RUN] check: {command} -> pretending OK")
            return True
        try:
            subprocess.run(shlex.split(command), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            return False

    def set_dry_run(self, value: bool):
        self.dry_run = bool(value)

    def _exec_list(self, args, check=False, capture_output=True, text=False):
        """Execute a subprocess.run style list command, or print when in dry-run mode."""
        if self.dry_run:
            try:
                printable = ' '.join(args)
            except Exception:
                printable = str(args)
            print(f"[DRY_RUN] would run: {printable}")
            return subprocess.CompletedProcess(args, 0, stdout=("" if text else b""), stderr=("" if text else b""))
        return subprocess.run(args, check=check, capture_output=capture_output, text=text)

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
            self._exec_list(["sudo", "iptables", "-N", "ZT_SEGMENTS"], check=False, capture_output=True)
            # ensure FORWARD jumps to ZT_SEGMENTS early
            if not self._check_cmd("sudo iptables -C FORWARD -j ZT_SEGMENTS"):
                self._exec_list(["sudo", "iptables", "-I", "FORWARD", "-j", "ZT_SEGMENTS"], check=False, capture_output=True)
            # create quarantine chain and populate with conservative drop rules
            self._exec_list(["sudo", "iptables", "-N", "ZT_QUARANTINE"], check=False, capture_output=True)
            # flush and seed quarantine chain
            self._exec_list(["sudo", "iptables", "-F", "ZT_QUARANTINE"], check=False, capture_output=True)
            # allow established/related to avoid breaking existing connections
            self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-m", "conntrack", "--ctstate", "RELATED,ESTABLISHED", "-j", "ACCEPT"], check=False, capture_output=True)
            # allow DHCP traffic (clients need to obtain IP)
            self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-p", "udp", "--dport", "67:68", "-j", "ACCEPT"], check=False, capture_output=True)
            # actively reject DNS to prevent name resolution
            self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-p", "udp", "--dport", "53", "-j", "REJECT", "--reject-with", "icmp-port-unreachable"], check=False, capture_output=True)
            self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-p", "tcp", "--dport", "53", "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)
            # proactively block traffic headed to common public DNS resolvers (prevents device from bypassing local DNS)
            # Block common public DNS resolvers (IPv4)
            public_resolvers = [
                "8.8.8.8",
                "8.8.4.4",
                "1.1.1.1",
                "1.0.0.1",
                "9.9.9.9",
                "149.112.112.112",
                # additional well-known resolvers
                "208.67.222.222",
                "208.67.220.220",
                "64.6.64.6",
                "64.6.65.6",
            ]
            for r in public_resolvers:
                self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-d", r, "-p", "udp", "--dport", "53", "-j", "REJECT", "--reject-with", "icmp-port-unreachable"], check=False, capture_output=True)
                self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-d", r, "-p", "tcp", "--dport", "53", "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)

            # block common proxy and tunneling ports to reduce bypass attempts
            for p in ["3128", "8080", "8888", "8000", "1080"]:
                self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-p", "tcp", "--dport", p, "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)
                self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-p", "udp", "--dport", p, "-j", "REJECT", "--reject-with", "icmp-port-unreachable"], check=False, capture_output=True)
            # final drop: anything not explicitly allowed is dropped
            self._exec_list(["sudo", "iptables", "-A", "ZT_QUARANTINE", "-j", "DROP"], check=False, capture_output=True)
            # --- IPv6 equivalent chains ---
            try:
                self._exec_list(["sudo", "ip6tables", "-N", "ZT_QUARANTINE"], check=False, capture_output=True)
                self._exec_list(["sudo", "ip6tables", "-F", "ZT_QUARANTINE"], check=False, capture_output=True)
                self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-m", "conntrack", "--ctstate", "RELATED,ESTABLISHED", "-j", "ACCEPT"], check=False, capture_output=True)
                # block IPv6 DNS (port 53) and common proxy ports
                self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-p", "udp", "--dport", "53", "-j", "DROP"], check=False, capture_output=True)
                self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-p", "tcp", "--dport", "53", "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)
                # IPv6 public resolvers to proactively block (common anycast / provider addresses)
                ipv6_resolvers = [
                    "2001:4860:4860::8888",
                    "2001:4860:4860::8844",
                    "2606:4700:4700::1111",
                    "2606:4700:4700::1001",
                    "2620:fe::fe",
                    "2620:fe::9",
                ]
                for r6 in ipv6_resolvers:
                    self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-d", r6, "-p", "udp", "--dport", "53", "-j", "DROP"], check=False, capture_output=True)
                    self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-d", r6, "-p", "tcp", "--dport", "53", "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)
                for p in ["3128", "8080", "8888", "8000", "1080"]:
                    self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-p", "tcp", "--dport", p, "-j", "REJECT", "--reject-with", "tcp-reset"], check=False, capture_output=True)
                    self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-p", "udp", "--dport", p, "-j", "DROP"], check=False, capture_output=True)
                self._exec_list(["sudo", "ip6tables", "-A", "ZT_QUARANTINE", "-j", "DROP"], check=False, capture_output=True)
                # ensure ip6tables FORWARD jumps to ZT_SEGMENTS equivalent
                self._exec_list(["sudo", "ip6tables", "-N", "ZT_SEGMENTS"], check=False, capture_output=True)
                if not self._check_cmd("sudo ip6tables -C FORWARD -j ZT_SEGMENTS"):
                    self._exec_list(["sudo", "ip6tables", "-I", "FORWARD", "-j", "ZT_SEGMENTS"], check=False, capture_output=True)
            except Exception:
                pass
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
            self._exec_list(["sudo", "iptables", "-F", "ZT_SEGMENTS"], check=False, capture_output=True)
            devices = database.list_devices()
            # group by segment
            seg_map = {}
            for d in devices:
                seg = d.get("segment") or ""
                ip = d.get("ip")
                if not ip:
                    continue
                seg_map.setdefault(seg, []).append(ip)

            # For each non-empty segment, prefer interface-based allow if iface configured,
            # otherwise fall back to per-IP accept rules.
            for seg, ips in seg_map.items():
                if not seg:
                    continue
                iface = self.segments.get(seg)
                if iface:
                    # Allow all forwarding where both ingress and egress are the segment iface
                    try:
                        self._exec_list(["sudo", "iptables", "-A", "ZT_SEGMENTS", "-i", iface, "-o", iface, "-j", "ACCEPT"], check=False, capture_output=True)
                    except Exception:
                        pass
                    # also permit intra-segment host pairs as a fallback
                    for src in ips:
                        for dst in ips:
                            if src == dst:
                                continue
                            try:
                                self._exec_list(["sudo", "iptables", "-A", "ZT_SEGMENTS", "-s", src, "-d", dst, "-j", "ACCEPT"], check=False, capture_output=True)
                            except Exception:
                                pass
                    continue
                # fallback: insert per-IP accept rules
                for src in ips:
                    for dst in ips:
                        if src == dst:
                            continue
                        # insert rule to accept forwarding between src->dst
                        try:
                            self._exec_list(["sudo", "iptables", "-A", "ZT_SEGMENTS", "-s", src, "-d", dst, "-j", "ACCEPT"], check=False, capture_output=True)
                        except Exception:
                            pass
            return True
        except Exception:
            return False

    def build_segment_policy_commands(self, policies_path: Optional[str] = None) -> list:
        """Construct the list of iptables commands that would be applied for segment policies.

        This returns command strings and does NOT execute anything. If `policies_path` is
        provided, it will load policies from that path first (temporary preview).
        """
        # optionally load alternate policies for preview only
        if policies_path:
            try:
                self.load_policies(policies_path)
            except Exception:
                pass

        cmds = []
        try:
            devices = database.list_devices()
            seg_map = {}
            for d in devices:
                seg = d.get("segment") or ""
                ip = d.get("ip")
                if not ip:
                    continue
                seg_map.setdefault(seg, []).append(ip)

            for seg, ips in seg_map.items():
                if not seg:
                    continue
                iface = self.segments.get(seg)
                if iface:
                    cmds.append(f"iptables -A ZT_SEGMENTS -i {shlex.quote(iface)} -o {shlex.quote(iface)} -j ACCEPT")
                    for src in ips:
                        for dst in ips:
                            if src == dst:
                                continue
                            cmds.append(f"iptables -A ZT_SEGMENTS -s {shlex.quote(src)} -d {shlex.quote(dst)} -j ACCEPT")
                    continue
                for src in ips:
                    for dst in ips:
                        if src == dst:
                            continue
                        cmds.append(f"iptables -A ZT_SEGMENTS -s {shlex.quote(src)} -d {shlex.quote(dst)} -j ACCEPT")
        except Exception:
            pass

        return cmds

    def _iface_for_segment(self, segment: Optional[str]) -> str:
        if segment and segment in self.segments:
            return self.segments[segment]
        return self.lan

    def load_policies(self, policies_path: Optional[str] = None) -> None:
        """Load policies from `policies.json` and populate internal mappings.

        Expected format: { "segments": [{"name":"iot","cidr":"...","vlan_id":100,"iface":"eth0.100"}, ...] }
        This will set `self.policy_defs[name] = {...}` and, if `iface` present, `self.segments[name] = iface`.
        """
        # Resolve default path relative to this file
        if not policies_path:
            policies_path = str(Path(__file__).parent / "policies.json")

        p = Path(policies_path)
        if not p.exists():
            return

        try:
            with p.open() as fh:
                data = json.load(fh)
        except Exception:
            return

        segs = data.get("segments", [])
        for s in segs:
            name = s.get("name")
            if not name:
                continue
            self.policy_defs[name] = s
            iface = s.get("iface")
            if iface:
                # map segment name to the configured interface
                self.segments[name] = iface

    def allow_device(self, ip: str, segment: Optional[str] = None) -> bool:
        """Insert an ACCEPT rule for a verified IP on the appropriate segment interface."""
        iface = self._iface_for_segment(segment)
        candidate_ifaces = [iface]
        if self.lan and self.lan not in candidate_ifaces:
            candidate_ifaces.append(self.lan)
        # remove any quarantine jump for this IP first (both IPv4 and IPv6)
        try:
            self._exec_list(["sudo", "iptables", "-D", "ZT_SEGMENTS", "-s", ip, "-j", "ZT_QUARANTINE"], check=True, capture_output=True)
        except Exception:
            pass
        # IPv6 cleanup
        if ':' in ip:
            try:
                self._exec_list(["sudo", "ip6tables", "-D", "ZT_SEGMENTS", "-s", ip, "-j", "ZT_QUARANTINE"], check=True, capture_output=True)
            except Exception:
                pass

        granted_any = False
        all_ok = True
        for candidate in candidate_ifaces:
            check_cmd = f"sudo iptables -C FORWARD -s {shlex.quote(ip)} -i {shlex.quote(candidate)} -j ACCEPT"
            if self._check_cmd(check_cmd):
                print(f"[SUCCESS] Access already granted to {ip} on {candidate}")
                granted_any = True
                continue

            add_cmd = f"sudo iptables -I FORWARD -s {shlex.quote(ip)} -i {shlex.quote(candidate)} -j ACCEPT"
            if self._run_cmd(add_cmd):
                print(f"[SUCCESS] Access granted to {ip} on {candidate}")
                granted_any = True
            else:
                all_ok = False

        return granted_any and all_ok

    def block_device(self, ip: str, segment: Optional[str] = None) -> bool:
        """Remove a previously-inserted ACCEPT rule, returning device to default DROP policy."""
        iface = self._iface_for_segment(segment)
        candidate_ifaces = [iface]
        if self.lan and self.lan not in candidate_ifaces:
            candidate_ifaces.append(self.lan)
        removed_any = False
        # Attempt to delete matching rules repeatedly until none remain.
        # Use _run_cmd which respects dry-run. In dry-run we avoid infinite loops by breaking after one attempt.
        for candidate in candidate_ifaces:
            del_cmd = f"sudo iptables -D FORWARD -s {shlex.quote(ip)} -i {shlex.quote(candidate)} -j ACCEPT"
            while True:
                ok = self._run_cmd(del_cmd)
                if ok:
                    removed_any = True
                    if self.dry_run:
                        break
                    # continue trying to remove duplicates
                    continue
                break

        if removed_any:
            print(f"[QUARANTINE] Access revoked for {ip} on {candidate_ifaces}")
            # ensure a quarantine rule exists so the IP is actively dropped
            try:
                # insert at top of ZT_SEGMENTS so quarantine is evaluated early
                self._exec_list(["sudo", "iptables", "-I", "ZT_SEGMENTS", "-s", ip, "-j", "ZT_QUARANTINE"], check=False, capture_output=True)
            except Exception:
                pass
            return True

        # No rule found — already blocked by policy
        try:
            # ensure quarantine rule present even if no accept rule existed
            self._exec_list(["sudo", "iptables", "-I", "ZT_SEGMENTS", "-s", ip, "-j", "ZT_QUARANTINE"], check=False, capture_output=True)
        except Exception:
            pass
        print(f"[QUARANTINE] {ip} already blocked on {candidate_ifaces}")
        return True

    def apply_raw_rule(self, rule_cmd: str) -> bool:
        """Apply a raw iptables rule string after sanitizing with shlex.
        Use with caution — prefer the structured helpers above."""
        return self._run_cmd(rule_cmd)

