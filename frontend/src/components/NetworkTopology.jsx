import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Cpu, Smartphone, Monitor, ShieldAlert, CheckCircle, ArrowRight, StopCircle, Radio } from 'lucide-react';
import { getVendorMeta, inferCategory, getDisplayName, getCategoryMeta } from '../utils/deviceIdentity';
import { formatBytes } from '../utils/format';

const getDeviceIcon = (vendor, deviceType) => {
  if (deviceType) {
    const dt = deviceType.toLowerCase();
    if (dt.includes('camera') || dt.includes('ipcamera')) return <Monitor size={20} />;
    if (dt.includes('phone') || dt.includes('mobile')) return <Smartphone size={20} />;
    if (dt.includes('laptop') || dt.includes('desktop') || dt.includes('pc')) return <Monitor size={20} />;
    if (dt.includes('router') || dt.includes('gateway')) return <Cpu size={20} />;
  }
  if (!vendor) return <Cpu size={20} />;
  const v = vendor.toLowerCase();
  if (v.includes('phone') || v.includes('mobile')) return <Smartphone size={20} />;
  if (v.includes('laptop') || v.includes('desktop')) return <Monitor size={20} />;
  return <Cpu size={20} />;
};

export default function NetworkTopology({ devices = [], mode = 'replay' }) {
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [hovered, setHovered] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const modeLabel = mode === 'physical' ? 'Physical Live Mode' : 'Live Replay Mode';
  const modeTone = mode === 'physical' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-950/20' : 'text-cyan-300 border-cyan-500/30 bg-cyan-950/20';

  const allowedCount = devices.filter((d) => d.status === 'Allowed' || d.status === 'Verified').length;
  const quarantinedCount = devices.filter((d) => d.status === 'Blocked' || d.status === 'Quarantined').length;
  const segmentedCount = devices.filter((d) => Boolean(d.segment)).length;
  const unassignedCount = devices.length - segmentedCount;

  const filteredDevices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return devices;

    return devices.filter((device) => {
      const fields = [
        device.ip,
        device.mac,
        device.vendor,
        device.device_type,
        device.segment,
        getDisplayName(device),
        device.status,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return fields.some((value) => value.includes(term));
    });
  }, [devices, searchTerm]);

  const orderedDevices = useMemo(() => {
    return [...filteredDevices].sort((a, b) => {
      const segmentA = String(a.segment || 'default');
      const segmentB = String(b.segment || 'default');
      if (segmentA !== segmentB) return segmentA.localeCompare(segmentB);

      const aBlocked = a.status === 'Blocked' || a.status === 'Quarantined';
      const bBlocked = b.status === 'Blocked' || b.status === 'Quarantined';
      if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

      const aOnline = Number(a.online) ? 1 : 0;
      const bOnline = Number(b.online) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;

      const aTraffic = Number(a.trafficMbps || 0);
      const bTraffic = Number(b.trafficMbps || 0);
      if (aTraffic !== bTraffic) return bTraffic - aTraffic;
      const aName = getDisplayName(a);
      const bName = getDisplayName(b);
      return aName.localeCompare(bName);
    });
  }, [filteredDevices]);

  const segmentGroups = useMemo(() => {
    const map = new Map();

    orderedDevices.forEach((device) => {
      const key = device.segment ? String(device.segment) : '';
      const label = device.segment ? String(device.segment) : 'Unassigned';
      if (!map.has(key)) {
        map.set(key, { key, label, devices: [] });
      }
      map.get(key).devices.push(device);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.key === '' && b.key !== '') return 1;
      if (a.key !== '' && b.key === '') return -1;
      return a.label.localeCompare(b.label);
    });
  }, [orderedDevices]);

  const visibleSegmentGroups = useMemo(() => {
    if (!searchTerm.trim()) return segmentGroups;
    return segmentGroups.filter((group) => group.devices.length > 0);
  }, [segmentGroups, searchTerm]);

  const clusterStyleFor = (index, total) => {
    const presets = [
      { top: '10%', left: '6%', width: '28%' },
      { top: '10%', right: '6%', width: '28%' },
      { bottom: '10%', left: '6%', width: '28%' },
      { bottom: '10%', right: '6%', width: '28%' },
      { top: '38%', left: '3%', width: '24%' },
      { top: '38%', right: '3%', width: '24%' },
      { bottom: '38%', left: '3%', width: '24%' },
      { bottom: '38%', right: '3%', width: '24%' },
    ];

    const preset = presets[index] || {
      top: `${12 + ((index * 11) % 62)}%`,
      left: `${6 + ((index * 17) % 20)}%`,
      width: total > 4 ? '24%' : '30%',
    };

    return preset;
  };

  const segmentPalette = useMemo(
    () => ['#22c55e', '#3b82f6', '#eab308', '#a855f7', '#f97316', '#06b6d4'],
    [],
  );

  const segmentColor = (segment) => {
    if (!segment) return '#22c55e';
    const idx = Math.abs(String(segment).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % segmentPalette.length;
    return segmentPalette[idx];
  };

  const doAction = async (ip, action) => {
    try {
      setActionLoading((s) => ({ ...s, [ip]: action }));
      const endpoint = action === 'allow' ? `/allow/${ip}` : `/block/${ip}`;
      await fetch(`http://localhost:8000${endpoint}`, { method: 'POST' });
    } catch (err) {
      console.error('Action failed', err);
    } finally {
      setTimeout(() => setActionLoading((s) => ({ ...s, [ip]: undefined })), 900);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="card-soft border border-blue-500/20 bg-blue-950/10 p-5 space-y-4 shadow-[0_18px_50px_rgba(15,23,42,0.25)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <Wifi className="text-blue-400" size={20} />
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-blue-300/70 mb-1">Network view</p>
              <h3 className="text-lg font-semibold text-blue-300">Network Topology</h3>
              <p className="text-sm text-gray-400">Hover devices for details and quick actions</p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-medium ${modeTone}`}>
              <Radio size={12} />
              {modeLabel}
            </span>
            <div className="flex flex-wrap gap-2 text-[11px] text-gray-300 justify-start md:justify-end">
            <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/40">Allowed: {allowedCount}</span>
            <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/40">Quarantined: {quarantinedCount}</span>
            <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/40">Devices: {devices.length}</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search IP, vendor, segment, status..."
              className="w-full rounded-xl border border-gray-800/80 bg-gray-950/60 px-4 py-2.5 pr-10 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">⌕</div>
          </div>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="btn btn-ghost h-full px-4 py-2.5 text-sm"
            disabled={!searchTerm}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Node size = live traffic</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Ring color = segment</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Vendor token = icon code</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Nodes sorted by segment and status</span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
        <div className="card-soft border border-emerald-500/20 bg-emerald-950/10 p-3.5 flex items-center justify-between rounded-2xl">
          <div>
            <p className="text-emerald-300 font-semibold text-lg">{devices.filter((d) => d.status === 'Allowed' || d.status === 'Verified').length}</p>
            <p className="text-xs text-gray-400">Active</p>
          </div>
          <div className="text-emerald-400"><CheckCircle /></div>
        </div>
        <div className="card-soft border border-red-500/20 bg-red-950/10 p-3.5 flex items-center justify-between rounded-2xl">
          <div>
            <p className="text-red-300 font-semibold text-lg">{quarantinedCount}</p>
            <p className="text-xs text-gray-400">Quarantined</p>
          </div>
          <div className="text-red-400"><ShieldAlert /></div>
        </div>
        <div className="card-soft border border-blue-500/20 bg-blue-950/10 p-3.5 flex items-center justify-between rounded-2xl">
          <div>
            <p className="text-blue-300 font-semibold text-lg">{segmentedCount}</p>
            <p className="text-xs text-gray-400">Segmented</p>
          </div>
          <div className="text-blue-400"><Radio size={18} /></div>
        </div>
        <div className="card-soft border border-gray-500/20 bg-gray-950/10 p-3.5 flex items-center justify-between rounded-2xl">
          <div>
            <p className="text-gray-200 font-semibold text-lg">{unassignedCount}</p>
            <p className="text-xs text-gray-400">Unassigned</p>
          </div>
          <div className="text-gray-400"><Cpu size={18} /></div>
        </div>
      </div>

      <div className="card-soft border border-gray-800/60 bg-gray-950/40 p-4 rounded-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Device classes</p>
            <h4 className="text-sm font-semibold text-gray-100">Personal, private, other, and core device types</h4>
          </div>
          <div className="text-[11px] text-gray-400">Colors reflect device class, nodes reflect segment groups</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Personal', 'Private', 'Other', 'Mobile', 'Computer', 'Camera', 'Network', 'IoT'].map((label) => {
            const meta = getCategoryMeta(label, label);
            return (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]"
                style={{ borderColor: meta.border, backgroundColor: meta.bg, color: meta.color }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                {label}
              </span>
            );
          })}
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-[420px] card-soft p-4 sm:p-6 overflow-hidden border border-gray-800/60">
        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <motion.div
            animate={{ boxShadow: ['0_0_0_0_rgba(59,130,246,0.35)', '0_0_0_18px_rgba(59,130,246,0)'] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-2xl flex items-center justify-center border border-blue-400 shadow-[0_15px_40px_rgba(59,130,246,0.22)]"
          >
            <Wifi className="text-white" size={viewportWidth < 640 ? 20 : 28} />
          </motion.div>
          <div className="mt-3 text-xs sm:text-sm text-blue-300 font-semibold">Zero-Trust Gateway</div>
          <div className="mt-1 text-[10px] text-gray-400 uppercase tracking-[0.28em]">{modeLabel}</div>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-1/2 top-1/2 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          <div className="absolute left-1/2 inset-y-0 w-px bg-gradient-to-b from-transparent via-blue-500/20 to-transparent" />
        </div>

        {visibleSegmentGroups.map((group, index) => {
          const segmented = group.key !== '';
          const chipColor = segmented ? segmentColor(group.key) : '#64748b';
          const style = clusterStyleFor(index, visibleSegmentGroups.length);
          return (
            <motion.div
              key={group.key || 'unassigned'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.04 }}
              className="absolute rounded-2xl border bg-gray-950/55 backdrop-blur-md shadow-[0_12px_34px_rgba(15,23,42,0.28)] overflow-hidden"
              style={{ ...style, borderColor: `${chipColor}55` }}
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5" style={{ background: `${chipColor}12` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chipColor, boxShadow: `0 0 0 3px ${chipColor}20` }} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">{segmented ? 'Segment' : 'Fallback bucket'}</div>
                    <div className="text-sm font-semibold text-gray-100 truncate">{group.label}</div>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/40 text-[11px] text-gray-300 whitespace-nowrap">
                  {group.devices.length}
                </span>
              </div>

              <div className="p-3">
                <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                  {group.devices.map((device) => {
                    const isBlocked = device.status === 'Blocked' || device.status === 'Quarantined';
                    const displayName = getDisplayName(device);
                    const vendorMeta = getVendorMeta(device.vendor);
                    const categoryMeta = getCategoryMeta(device.device_type, device.vendor);
                    return (
                      <button
                        key={device.ip}
                        onMouseEnter={(e) => setHovered({ device, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className={`flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-all duration-200 ${isBlocked ? 'border-red-600/30 bg-red-950/20 hover:border-red-500/50' : 'border-emerald-600/20 bg-emerald-950/10 hover:border-emerald-500/40'}`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-gray-950/70" style={{ borderColor: categoryMeta.border, boxShadow: `0 0 0 1px ${categoryMeta.color}20` }}>
                          <div className={isBlocked ? 'text-red-400' : ''} style={!isBlocked ? { color: categoryMeta.color } : undefined}>{getDeviceIcon(device.vendor, device.device_type)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="truncate text-xs font-semibold text-gray-100">{displayName}</div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${isBlocked ? 'bg-red-600/80 text-white' : 'bg-green-600/90 text-white'}`}>{isBlocked ? 'Quarantined' : 'Allowed'}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-400 font-mono">{device.ip}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-gray-400">
                          <span className="rounded-full border border-gray-700 bg-gray-900/40 px-2 py-0.5 text-gray-300">{vendorMeta.token}</span>
                          <span className="font-mono text-gray-500">{(Number(device.trafficMbps || 0)).toFixed(2)} MB/s</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Hover tooltip with device details and quick actions */}
      {hovered && containerRef.current && (() => {
        const rect = containerRef.current.getBoundingClientRect();
        const left = Math.min(Math.max(8, hovered.x - rect.left + 8), rect.width - 220);
        const top = Math.min(Math.max(8, hovered.y - rect.top + 8), rect.height - 120);
        const d = hovered.device;
        return (
          <div style={{ left, top }} className="absolute z-50 pointer-events-auto">
            <div className="w-56 card-soft p-3 text-xs shadow">
              <div className="flex items-start gap-3">
                <div className="pt-1">{getDeviceIcon(d.vendor)}</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{getDisplayName(d)}</div>
                  <div className="text-gray-400 text-[11px] truncate">{getVendorMeta(d.vendor).name} • {inferCategory(d.device_type, d.vendor)} • {d.ip}</div>
                  <div className="mt-2 text-[11px] text-gray-300">Traffic: <span className="font-mono">{(d.trafficMbps || 0).toFixed(3)} MB/s</span> • <span className="font-mono">{formatBytes(d.trafficBytes || 0)}</span></div>
                  <div className="mt-1 text-[11px] text-gray-400">Segment: <span className="font-mono">{d.segment || 'Unassigned'}</span></div>
                  <div className="mt-1 text-[11px] text-gray-500">Status: <span className="font-semibold">{d.status}</span></div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => doAction(d.ip, 'allow')}
                  disabled={actionLoading[d.ip]}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1 rounded bg-green-600/90 text-white text-[13px]"
                >
                  <ArrowRight size={14} /> Allow
                </button>
                <button
                  onClick={() => doAction(d.ip, 'block')}
                  disabled={actionLoading[d.ip]}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1 rounded bg-red-600/90 text-white text-[13px]"
                >
                  <StopCircle size={14} /> Quarantine
                </button>
              </div>
            </div>
          </div>
        );
      })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
        <div className="card-soft border border-green-500/20 bg-green-950/10 p-3 flex items-center justify-between">
          <div>
            <p className="text-green-300 font-semibold text-lg">{allowedCount}</p>
            <p className="text-xs text-gray-400">Allowed</p>
          </div>
          <div className="text-green-400"><CheckCircle /></div>
        </div>
        <div className="card-soft border border-red-500/20 bg-red-950/10 p-3 flex items-center justify-between">
          <div>
            <p className="text-red-300 font-semibold text-lg">{quarantinedCount}</p>
            <p className="text-xs text-gray-400">Quarantined</p>
          </div>
          <div className="text-red-400"><ShieldAlert /></div>
        </div>
      </div>
    </motion.div>
  );
}
