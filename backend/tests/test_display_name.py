from backend import identity


def test_explicit_label_preferred():
    row = {'display_name': 'Kitchen Camera', 'mac': 'aa:bb:cc:dd:ee:01'}
    assert identity.compute_display_name(row) == 'Kitchen Camera'


def test_vendor_and_device_type_with_mac_suffix():
    row = {'vendor': 'Samsung', 'device_type': 'TV', 'mac': 'aa:bb:cc:dd:ee:01'}
    assert identity.compute_display_name(row) == 'Samsung TV 01'


def test_private_vendor_uses_device_type_and_ip_suffix():
    row = {'vendor': 'Private', 'device_type': 'Camera', 'ip': '10.0.0.5'}
    assert identity.compute_display_name(row) == 'Camera 5'


def test_fallback_unknown_device_with_ip_tail():
    row = {'ip': '10.0.0.55'}
    assert identity.compute_display_name(row) == 'Unknown Device 55'
