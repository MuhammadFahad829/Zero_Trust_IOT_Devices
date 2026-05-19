const VENDOR_RULES = [
  { match: /huawei/i, name: 'Huawei', token: 'HW', color: '#b91c1c' },
  { match: /honor/i, name: 'Honor', token: 'HN', color: '#ef4444' },
  { match: /apple/i, name: 'Apple', token: 'AP', color: '#334155' },
  { match: /samsung/i, name: 'Samsung', token: 'SG', color: '#1d4ed8' },
  { match: /xiaomi/i, name: 'Xiaomi', token: 'XM', color: '#ea580c' },
  { match: /xiaomi|redmi|mi /i, name: 'Xiaomi', token: 'XM', color: '#ea580c' },
  { match: /oppo/i, name: 'OPPO', token: 'OP', color: '#15803d' },
  { match: /vivo/i, name: 'vivo', token: 'VV', color: '#0f766e' },
  { match: /realme/i, name: 'realme', token: 'RM', color: '#ca8a04' },
  { match: /intel/i, name: 'Intel', token: 'IN', color: '#075985' },
  { match: /lenovo/i, name: 'Lenovo', token: 'LV', color: '#6d28d9' },
  { match: /dell/i, name: 'Dell', token: 'DL', color: '#2563eb' },
  { match: /hp/i, name: 'HP', token: 'HP', color: '#0369a1' },
  { match: /chongqing fugui/i, name: 'Fugui', token: 'FG', color: '#7c3aed' },
  { match: /tp-link|tplink/i, name: 'TP-Link', token: 'TP', color: '#0ea5a4' },
  { match: /espressif|esp8266|esp32/i, name: 'Espressif', token: 'ES', color: '#ef4444' },
  { match: /broadcom/i, name: 'Broadcom', token: 'BC', color: '#0ea5a4' },
  { match: /google/i, name: 'Google', token: 'GG', color: '#6366f1' },
  { match: /amazon|alexa/i, name: 'Amazon', token: 'AM', color: '#f59e0b' },
  { match: /cisco/i, name: 'Cisco', token: 'CS', color: '#0891b2' },
  { match: /raspberry|raspberry pi/i, name: 'RaspberryPi', token: 'RP', color: '#d946ef' },
  { match: /private|randomized|unknown/i, name: 'Private Device', token: 'PR', color: '#374151' },
  { match: /zte/i, name: 'ZTE', token: 'ZT', color: '#7b2cbf' },
  { match: /motorola/i, name: 'Motorola', token: 'MO', color: '#0ea5a4' },
  { match: /lg/i, name: 'LG', token: 'LG', color: '#fb7185' },
];

function fallbackToken(value) {
  if (!value) return 'DV';
  const words = String(value)
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) return 'DV';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function getVendorMeta(vendor) {
  if (!vendor) {
    return { name: 'Unknown Device', token: 'DV', color: '#4b5563' };
  }

  const rule = VENDOR_RULES.find((r) => r.match.test(vendor));
  if (rule) {
    return { name: rule.name, token: rule.token, color: rule.color };
  }

  return {
    name: vendor,
    token: fallbackToken(vendor),
    color: '#0f766e',
  };
}

export function inferCategory(deviceType, vendor) {
  const text = `${deviceType || ''} ${vendor || ''}`.toLowerCase();

  if (text.includes('personal') || text.includes('personal device')) return 'Personal';
  if (text.includes('private') || text.includes('private device') || text.includes('randomized')) return 'Private';

  if (text.includes('mobile') || text.includes('phone')) return 'Mobile';
  if (text.includes('laptop') || text.includes('desktop') || text.includes('pc')) return 'Computer';
  if (text.includes('camera') || text.includes('ipcamera')) return 'Camera';
  if (text.includes('router') || text.includes('gateway')) return 'Network';
  if (text.includes('tv') || text.includes('speaker') || text.includes('appliance')) return 'Smart Appliance';
  if (text.includes('iot')) return 'IoT';
  return 'Other';
}

export function getCategoryMeta(deviceType, vendor) {
  const category = inferCategory(deviceType, vendor);

  const palette = {
    Personal: { color: '#8b5cf6', border: '#a78bfa', bg: 'rgba(139,92,246,0.16)' },
    Private: { color: '#0f766e', border: '#2dd4bf', bg: 'rgba(15,118,110,0.16)' },
    Other: { color: '#6b7280', border: '#9ca3af', bg: 'rgba(107,114,128,0.14)' },
    Mobile: { color: '#3b82f6', border: '#60a5fa', bg: 'rgba(59,130,246,0.14)' },
    Computer: { color: '#2563eb', border: '#60a5fa', bg: 'rgba(37,99,235,0.14)' },
    Camera: { color: '#ef4444', border: '#f87171', bg: 'rgba(239,68,68,0.14)' },
    Network: { color: '#14b8a6', border: '#2dd4bf', bg: 'rgba(20,184,166,0.14)' },
    'Smart Appliance': { color: '#f59e0b', border: '#fbbf24', bg: 'rgba(245,158,11,0.14)' },
    IoT: { color: '#22c55e', border: '#4ade80', bg: 'rgba(34,197,94,0.14)' },
  };

  return {
    category,
    label: category,
    ...palette[category],
    color: palette[category]?.color || '#0f766e',
    border: palette[category]?.border || '#6b7280',
    bg: palette[category]?.bg || 'rgba(15,118,110,0.14)',
  };
}

export function getDisplayName(device) {
  if (!device) return 'Unknown Device';
  const vendor = getVendorMeta(device.vendor);
  const category = inferCategory(device.device_type, device.vendor);
  const ipTail = String(device.ip || '').split('.').pop() || '';
  const macTail = String(device.mac || '').split(':').pop() || '';

  if (device.vendor && !/private\/randomized mac/i.test(device.vendor)) {
    if (category === 'Other') return vendor.name;
    return `${vendor.name} ${category}`;
  }
  // Provide better fallback names using MAC tail when available.
  if (category === 'Other') return macTail ? `Unknown Device ${macTail}` : ipTail ? `Unknown Device ${ipTail}` : 'Unknown Device';
  return macTail ? `${category} ${macTail}` : ipTail ? `${category} Device ${ipTail}` : `${category} Device`;
}
