import json
from unittest.mock import Mock

from backend.enforcement import EnforcementEngine


def test_load_policies_with_iface(tmp_path):
    data = {
        "segments": [
            {"name": "testseg", "cidr": "10.0.0.0/24", "vlan_id": 300, "iface": "eth0.300"}
        ]
    }
    p = tmp_path / "policies.json"
    p.write_text(json.dumps(data))

    eng = EnforcementEngine()
    # ensure the test segment is not present before loading
    assert "testseg" not in eng.policy_defs

    eng.load_policies(str(p))
    assert "testseg" in eng.policy_defs
    assert eng.policy_defs["testseg"]["vlan_id"] == 300
    # iface mapping should be populated
    assert eng.segments.get("testseg") == "eth0.300"
    # helper should prefer mapped iface
    assert eng._iface_for_segment("testseg") == "eth0.300"


def test_load_policies_missing_file(tmp_path):
    missing = tmp_path / "does_not_exist.json"
    eng = EnforcementEngine()
    before = dict(eng.policy_defs)
    # loading a non-existent file should be a no-op
    eng.load_policies(str(missing))
    assert eng.policy_defs == before


def test_filter_policy_document_and_build_scaffold(tmp_path, monkeypatch):
    data = {
        "segments": [
            {"name": "iot", "cidr": "10.0.0.0/24", "vlan_id": 100, "iface": "eth0.100", "limit_mbps": 5},
            {"name": "guest", "cidr": "10.0.1.0/24", "vlan_id": 200, "iface": "eth0.200", "limit_mbps": 10},
        ],
        "rules": [{"id": "block_telnet", "match": {"protocol": "tcp", "dport": 23}, "action": "DROP"}],
    }
    p = tmp_path / "policies.json"
    p.write_text(json.dumps(data))

    eng = EnforcementEngine()
    filtered = eng.filter_policy_document(["guest"], str(p))
    assert [segment["name"] for segment in filtered["segments"]] == ["guest"]
    assert filtered["rules"][0]["id"] == "block_telnet"

    monkeypatch.setattr(
        "backend.enforcement.database.list_devices",
        lambda: [
            {"ip": "10.0.1.10", "segment": "guest"},
            {"ip": "10.0.1.11", "segment": "guest"},
            {"ip": "10.0.9.9", "segment": ""},
        ],
    )

    scaffold = eng.build_segment_scaffold(str(p))
    assert scaffold["assigned_segments"] == ["guest"]
    assert scaffold["unassigned_devices"] == ["10.0.9.9"]
    assert scaffold["segments"][0]["name"] == "iot"
    assert scaffold["segments"][0]["vlan_id"] == 100
    assert scaffold["segments"][1]["device_count"] == 2
    assert scaffold["segments"][1]["device_ips"] == ["10.0.1.10", "10.0.1.11"]


def test_apply_segment_policies_prefers_iface_rules(monkeypatch):
    devices = [
        {"ip": "10.0.0.10", "segment": "iot"},
        {"ip": "10.0.0.11", "segment": "iot"},
        {"ip": "10.0.1.20", "segment": "guest"},
    ]
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return Mock(returncode=0, stdout="", stderr=b"")

    monkeypatch.setattr("backend.enforcement.database.list_devices", lambda: devices)
    monkeypatch.setattr("backend.enforcement.subprocess.run", fake_run)
    monkeypatch.setattr(EnforcementEngine, "load_policies", lambda self, policies_path=None: None)

    eng = EnforcementEngine()
    eng.segments = {"iot": "eth0.100"}

    assert eng.apply_segment_policies() is True

    command_strings = [" ".join(arg_list) for arg_list, _ in calls]
    assert any("-F ZT_SEGMENTS" in cmd for cmd in command_strings)
    assert any("-i eth0.100 -o eth0.100 -j ACCEPT" in cmd for cmd in command_strings)
    assert any("-s 10.0.0.10 -d 10.0.0.11 -j ACCEPT" in cmd for cmd in command_strings)
    assert any("-s 10.0.0.11 -d 10.0.0.10 -j ACCEPT" in cmd for cmd in command_strings)
    assert not any("10.0.1.20" in cmd and "ACCEPT" in cmd and "-i eth0.100" in cmd for cmd in command_strings)


def test_apply_segment_policies_falls_back_to_ip_pairs(monkeypatch):
    devices = [{"ip": "10.0.2.10", "segment": "guest"}, {"ip": "10.0.2.11", "segment": "guest"}]
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return Mock(returncode=0, stdout="", stderr=b"")

    monkeypatch.setattr("backend.enforcement.database.list_devices", lambda: devices)
    monkeypatch.setattr("backend.enforcement.subprocess.run", fake_run)
    monkeypatch.setattr(EnforcementEngine, "load_policies", lambda self, policies_path=None: None)

    eng = EnforcementEngine()
    eng.segments = {}

    assert eng.apply_segment_policies() is True

    command_strings = [" ".join(arg_list) for arg_list, _ in calls]
    assert any("-F ZT_SEGMENTS" in cmd for cmd in command_strings)
    assert any("-s 10.0.2.10 -d 10.0.2.11 -j ACCEPT" in cmd for cmd in command_strings)
    assert any("-s 10.0.2.11 -d 10.0.2.10 -j ACCEPT" in cmd for cmd in command_strings)
    assert not any("-i " in cmd and "10.0.2.10" in cmd for cmd in command_strings)
