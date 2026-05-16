import time

import database


def test_mark_all_devices_seen_updates_last_seen(tmp_path, monkeypatch):
    db_path = tmp_path / "zerotrust.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

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
    assert len(rows) == 1
    assert rows[0]["ip"] == "10.0.0.10"
    assert rows[0]["last_seen"] == target_ts


def test_add_or_update_device_auto_assigns_segment(tmp_path, monkeypatch):
    db_path = tmp_path / "zerotrust.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

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
    assert row is not None
    assert row["segment"] == "personal"


def test_add_or_update_device_preserves_manual_segment(tmp_path, monkeypatch):
    db_path = tmp_path / "zerotrust.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)

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
    assert row is not None
    assert row["segment"] == "office"