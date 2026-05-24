import json
import tempfile
import time
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from backend import database
from backend.enforcement import EnforcementEngine
from backend.monitor import TrafficMonitor


class BackendTestSuite(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.db_path = Path(self._tmpdir.name) / "zerotrust.db"

    def test_database_mark_all_devices_seen_updates_last_seen(self):
        original = database.DB_PATH
        database.DB_PATH = self.db_path
        try:
            if self.db_path.exists():
                self.db_path.unlink()
            database.init_db()
            database.add_or_update_device(
                ip="10.0.0.10",
                mac="aa:bb:cc:dd:ee:ff",
                last_seen=1.0,
                vendor="Vendor",
                device_type="Computer",
                status="Blocked",
            )

            target_ts = time.time()
            database.mark_all_devices_seen(target_ts)

            rows = database.list_devices()
            row = next((item for item in rows if item["ip"] == "10.0.0.10"), None)
            self.assertIsNotNone(row)
            self.assertEqual(row["last_seen"], target_ts)
        finally:
            database.DB_PATH = original

    def test_database_auto_assigns_segment(self):
        original = database.DB_PATH
        database.DB_PATH = self.db_path
        try:
            database.init_db()
            database.add_or_update_device(
                ip="10.0.0.20",
                mac="11:22:33:44:55:66",
                last_seen=2.0,
                vendor="Apple",
                device_type="Mobile",
                status="Blocked",
            )

            row = database.get_device("10.0.0.20")
            self.assertIsNotNone(row)
            self.assertEqual(row["segment"], "personal")
        finally:
            database.DB_PATH = original

    def test_database_preserves_manual_segment(self):
        original = database.DB_PATH
        database.DB_PATH = self.db_path
        try:
            database.init_db()
            database.add_or_update_device(
                ip="10.0.0.30",
                mac="aa:aa:aa:aa:aa:aa",
                last_seen=3.0,
                vendor="HP",
                device_type="Computer",
                status="Blocked",
                segment="office",
            )
            database.add_or_update_device(
                ip="10.0.0.30",
                mac="aa:aa:aa:aa:aa:aa",
                last_seen=4.0,
                vendor="HP",
                device_type="Computer",
                status="Allowed",
                segment="",
            )

            row = database.get_device("10.0.0.30")
            self.assertIsNotNone(row)
            self.assertEqual(row["segment"], "office")
        finally:
            database.DB_PATH = original

    def test_load_policies_with_iface(self):
        data = {
            "segments": [
                {"name": "testseg", "cidr": "10.0.0.0/24", "vlan_id": 300, "iface": "eth0.300"}
            ]
        }
        p = Path(self._tmpdir.name) / "policies.json"
        p.write_text(json.dumps(data))

        eng = EnforcementEngine()
        self.assertNotIn("testseg", eng.policy_defs)

        eng.load_policies(str(p))
        self.assertIn("testseg", eng.policy_defs)
        self.assertEqual(eng.policy_defs["testseg"]["vlan_id"], 300)
        self.assertEqual(eng.segments.get("testseg"), "eth0.300")
        self.assertEqual(eng._iface_for_segment("testseg"), "eth0.300")

    def test_load_policies_missing_file(self):
        missing = Path(self._tmpdir.name) / "does_not_exist.json"
        eng = EnforcementEngine()
        before = dict(eng.policy_defs)
        eng.load_policies(str(missing))
        self.assertEqual(eng.policy_defs, before)

    def test_apply_segment_policies_prefers_iface_rules(self):
        devices = [
            {"ip": "10.0.0.10", "segment": "iot"},
            {"ip": "10.0.0.11", "segment": "iot"},
            {"ip": "10.0.1.20", "segment": "guest"},
        ]
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs))
            return Mock(returncode=0, stdout="", stderr=b"")

        with patch("backend.enforcement.database.list_devices", return_value=devices), patch(
            "backend.enforcement.subprocess.run", side_effect=fake_run
        ), patch.object(EnforcementEngine, "load_policies", lambda self, policies_path=None: None):
            eng = EnforcementEngine()
            eng.segments = {"iot": "eth0.100"}

            self.assertTrue(eng.apply_segment_policies())

        command_strings = [" ".join(arg_list) for arg_list, _ in calls]
        self.assertTrue(any("-F ZT_SEGMENTS" in cmd for cmd in command_strings))
        self.assertTrue(any("-i eth0.100 -o eth0.100 -j ACCEPT" in cmd for cmd in command_strings))
        self.assertTrue(any("-s 10.0.0.10 -d 10.0.0.11 -j ACCEPT" in cmd for cmd in command_strings))
        self.assertTrue(any("-s 10.0.0.11 -d 10.0.0.10 -j ACCEPT" in cmd for cmd in command_strings))
        self.assertFalse(any("10.0.1.20" in cmd and "ACCEPT" in cmd and "-i eth0.100" in cmd for cmd in command_strings))

    def test_apply_segment_policies_falls_back_to_ip_pairs(self):
        devices = [{"ip": "10.0.2.10", "segment": "guest"}, {"ip": "10.0.2.11", "segment": "guest"}]
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs))
            return Mock(returncode=0, stdout="", stderr=b"")

        with patch("backend.enforcement.database.list_devices", return_value=devices), patch(
            "backend.enforcement.subprocess.run", side_effect=fake_run
        ), patch.object(EnforcementEngine, "load_policies", lambda self, policies_path=None: None):
            eng = EnforcementEngine()
            eng.segments = {}

            self.assertTrue(eng.apply_segment_policies())

        command_strings = [" ".join(arg_list) for arg_list, _ in calls]
        self.assertTrue(any("-F ZT_SEGMENTS" in cmd for cmd in command_strings))
        self.assertTrue(any("-s 10.0.2.10 -d 10.0.2.11 -j ACCEPT" in cmd for cmd in command_strings))
        self.assertTrue(any("-s 10.0.2.11 -d 10.0.2.10 -j ACCEPT" in cmd for cmd in command_strings))
        self.assertFalse(any("-i " in cmd and "10.0.2.10" in cmd for cmd in command_strings))

    def test_inject_sample_updates_device_snapshot(self):
        monitor = TrafficMonitor()

        now = time.time()
        monitor.inject_sample("10.0.0.10", 2048, timestamp=now)
        monitor.inject_sample("10.0.0.10", 4096, timestamp=now + 0.1)

        snapshot = monitor.get_device_snapshot("10.0.0.10")

        self.assertEqual(snapshot["total_bytes"], 6144)
        self.assertGreater(snapshot["total_mb"], 0)
        self.assertGreater(snapshot["mbps"], 0)
        self.assertGreaterEqual(len(snapshot["history"]), 1)
