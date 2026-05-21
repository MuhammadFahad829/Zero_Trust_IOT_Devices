export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '0 B';
  let value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (Math.abs(value) >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || value <= -10 ? 0 : 1)} ${units[i]}`;
}

export function formatNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString();
}

export function formatMbps(mbps) {
  const num = Number(mbps) || 0;
  if (Math.abs(num) < 1) return `${num.toFixed(2)} Mbps`;
  if (Math.abs(num) < 10) return `${num.toFixed(1)} Mbps`;
  return `${Math.round(num)} Mbps`;
}
