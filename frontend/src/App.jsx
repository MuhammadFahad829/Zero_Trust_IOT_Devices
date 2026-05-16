import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldAlert, ShieldCheck, Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import AuditLogsTable from './components/AuditLogsTable';
import ThreatVault from './components/ThreatVault';
import NetworkTopology from './components/NetworkTopology';
import AdminPanel from './components/AdminPanel';
import OfflineBanner from './components/OfflineBanner';
import OnlineToast from './components/OnlineToast';
import { containerVariant } from './utils/animations';
import { inferCategory, getDisplayName, getCategoryMeta } from './utils/deviceIdentity';

const App = () => {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [totalBandwidth, setTotalBandwidth] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [backendFailedCount, setBackendFailedCount] = useState(0);
  const [backendOnline, setBackendOnline] = useState(true);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState('replay');
  const [hotspotActive, setHotspotActive] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceSegmentFilter, setDeviceSegmentFilter] = useState('all');
  const previousBackendOnline = useRef(true);

  const markSuccess = useCallback(() => {
    setBackendFailedCount(0);
    setBackendOnline(true);
  }, []);

  const markFailure = useCallback(() => {
    setBackendFailedCount((c) => {
      const next = c + 1;
      if (next >= 3) setBackendOnline(false);
      return next;
    });
  }, []);

  useEffect(() => {
    const becameOnline = previousBackendOnline.current === false && backendOnline === true;
    if (becameOnline && backendFailedCount > 0) {
      setShowOnlineToast(true);
      const timer = setTimeout(() => setShowOnlineToast(false), 3200);
      previousBackendOnline.current = backendOnline;
      return () => clearTimeout(timer);
    }

    previousBackendOnline.current = backendOnline;
  }, [backendOnline, backendFailedCount]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'NEW_DEVICE' && msg.data?.ip) {
        setDevices((prev) => {
          const incoming = {
            ...msg.data,
            status: msg.data.status || 'Blocked',
            trafficMB: msg.data.trafficMB ?? 0,
            trafficBytes: msg.data.trafficBytes ?? 0,
            trafficHistory: msg.data.trafficHistory ?? [],
            trafficMbps: msg.data.trafficMbps ?? 0,
            alert: false,
          };

          const existingIndex = prev.findIndex((d) => d.ip === msg.data.ip);
          if (existingIndex === -1) {
            return [...prev, incoming];
          }

          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            ...incoming,
            online: typeof incoming.online === 'boolean' ? incoming.online : next[existingIndex].online,
          };
          return next;
        });
      }

      if (msg.event === 'DEVICES_TRAFFIC' && msg.data) {
        // msg.data: { ip: { mbps, total_mb, total_bytes, history } }
        setDevices((prev) =>
          prev.map((d) => {
            const snap = msg.data[d.ip];
            if (!snap) return d;
            return {
              ...d,
              trafficMB: snap.total_mb ?? d.trafficMB,
              trafficBytes: snap.total_bytes ?? d.trafficBytes,
              trafficHistory: snap.history ?? d.trafficHistory,
              trafficMbps: snap.mbps ?? d.trafficMbps,
            };
          }),
        );
      }

      if ((msg.event === 'STATUS_UPDATE' || msg.event === 'ANOMALY_ALERT') && msg.ip) {
        setDevices((prev) =>
          prev.map((d) => {
            if (d.ip !== msg.ip) return d;
            const newStatus = msg.status || d.status || 'Blocked';
            const becameQuarantined = newStatus === 'Quarantined' && d.status !== 'Quarantined';
            const updated = { ...d, status: newStatus };
            if (becameQuarantined) {
              updated.alert = true;
              // clear alert after animation
              setTimeout(() => {
                setDevices((cur) => cur.map((dd) => (dd.ip === msg.ip ? { ...dd, alert: false } : dd)));
              }, 1800);
            }
            return updated;
          }),
        );
      }

      if (msg.event === 'LIMIT_UPDATE' && msg.ip) {
        setDevices((prev) => prev.map((d) => (d.ip === msg.ip ? { ...d, mb_limit: msg.mb_limit } : d)));
      }

      if (msg.event === 'SEGMENT_UPDATE' && msg.ip) {
        setDevices((prev) => prev.map((d) => (d.ip === msg.ip ? { ...d, segment: msg.segment } : d)));
      }

      if (msg.event === 'TRAFFIC_UPDATE' && msg.data?.mbps !== undefined) {
        setTotalBandwidth(Number(msg.data.mbps) || 0);
      }
    };

    const fetchDevices = async () => {
      try {
        const res = await fetch('http://localhost:8000/devices');
        const data = await res.json();
        markSuccess();
        const deviceList = Array.isArray(data.devices) ? data.devices : [];
        setDevices((prev) => {
          const byIp = new Map(prev.map((p) => [p.ip, p]));
          deviceList.forEach((d) => {
            const existing = byIp.get(d.ip) || {};
            // Preserve status coming from websocket (live updates), otherwise use backend status
            const status = existing.status || d.status || 'Blocked';
            byIp.set(d.ip, {
              ...existing,
              ...d,
              status,
              online: typeof d.online === 'boolean' ? d.online : existing.online,
              score: d.score || existing.score || 100,
              // normalize traffic keys
              trafficMB: d.trafficMB ?? d.total_mb ?? existing.trafficMB,
              trafficBytes: d.trafficBytes ?? d.total_bytes ?? existing.trafficBytes,
              trafficHistory: d.trafficHistory ?? existing.trafficHistory,
              mb_limit: d.mb_limit ?? existing.mb_limit ?? 100,
              segment: d.segment ?? existing.segment ?? '',
            });
          });
          return Array.from(byIp.values());
        });
      } catch (err) {
        console.error('Failed to fetch devices:', err);
        markFailure();
      }
    };

    fetchDevices();
    const devInterval = setInterval(fetchDevices, 3000);
    return () => {
      ws.close();
      clearInterval(devInterval);
    };
  }, []);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const res = await fetch('http://localhost:8000/traffic');
        const data = await res.json();
        if (data?.mbps !== undefined) {
          markSuccess();
          setTotalBandwidth(Number(data.mbps) || 0);
        }
      } catch (err) {
        // ignore noisy fallback errors if websocket is already active
        markFailure();
      }
    };

    fetchTraffic();
    const interval = setInterval(fetchTraffic, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('http://localhost:8000/logs');
        const data = await res.json();
        markSuccess();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
        markFailure();
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    const onProv = () => fetchLogs();
    const onRetry = () => {
      // force immediate refetch
      fetchDevices();
      fetchTraffic();
      fetchLogs();
      setBackendFailedCount(0);
      setBackendOnline(true);
    };

    window.addEventListener('retry:backend', onRetry);
    window.addEventListener('provision:complete', onProv);

    return () => {
      clearInterval(interval);
      window.removeEventListener('provision:complete', onProv);
      window.removeEventListener('retry:backend', onRetry);
    };
  }, []);

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const res = await fetch('http://localhost:8000/mode');
        const data = await res.json();
        if (data?.mode) {
          setRuntimeMode(data.mode);
        }
        setHotspotActive(Boolean(data?.hotspot_active));
      } catch (err) {
        // leave default replay mode if backend is unavailable
      }
    };

    fetchMode();
    const interval = setInterval(fetchMode, 10000);
    return () => clearInterval(interval);
  }, []);

  const quarantinedCount = useMemo(
    () => devices.filter((d) => d.status === 'Blocked' || d.status === 'Quarantined').length,
    [devices],
  );

  const allowedCount = useMemo(
    () => devices.filter((d) => d.status === 'Allowed' || d.status === 'Verified').length,
    [devices],
  );

  const handleStatusChange = (ip, status) => {
    setDevices((prev) => prev.map((d) => (d.ip === ip ? { ...d, status } : d)));
  };

  const handleLimitChange = (ip, mbLimit) => {
    setDevices((prev) => prev.map((d) => (d.ip === ip ? { ...d, mb_limit: mbLimit } : d)));
  };

  const assignedCount = useMemo(() => devices.filter((d) => String(d.segment || '').trim()).length, [devices]);
  const unassignedCount = useMemo(() => devices.length - assignedCount, [devices, assignedCount]);

  const arrangedDevices = useMemo(() => {
    const now = Date.now() / 1000;
    const list = devices.map((d) => {
      const lastSeen = Number(d.last_seen || 0);
      const ageSec = lastSeen > 0 ? now - lastSeen : Number.POSITIVE_INFINITY;
      const backendOnline = typeof d.online === 'boolean' ? d.online : null;
      const online = hotspotActive ? (backendOnline ?? ageSec <= 45) : false;
      const blocked = d.status === 'Blocked' || d.status === 'Quarantined';
      const category = inferCategory(d.device_type, d.vendor);
      return { ...d, online, ageSec, blocked, category };
    });

    return list.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
      if (a.category !== b.category) return String(a.category).localeCompare(String(b.category));
      const ta = Number(a.trafficBytes || 0);
      const tb = Number(b.trafficBytes || 0);
      if (ta !== tb) return tb - ta;
      const la = Number(a.last_seen || 0);
      const lb = Number(b.last_seen || 0);
      if (la !== lb) return lb - la;
      return String(a.ip || '').localeCompare(String(b.ip || ''));
    });
  }, [devices, hotspotActive]);

  const dashboardDevices = useMemo(() => arrangedDevices.slice(0, 6), [arrangedDevices]);

  const visibleDevices = useMemo(() => {
    const term = deviceSearch.trim().toLowerCase();
    const segmentFilter = String(deviceSegmentFilter || 'all').toLowerCase();

    return arrangedDevices.filter((device) => {
      const deviceSegment = String(device.segment || '').trim().toLowerCase();
      const deviceCategory = String(device.category || inferCategory(device.device_type, device.vendor) || '').toLowerCase();

      const matchesSearch = !term || [
        device.ip,
        device.mac,
        device.vendor,
        device.device_type,
        device.segment,
        device.status,
        device.category,
        getDisplayName(device),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .some((value) => value.includes(term));

      const matchesSegment =
        segmentFilter === 'all' ||
        (segmentFilter === 'assigned' && Boolean(deviceSegment)) ||
        (segmentFilter === 'unassigned' && !deviceSegment) ||
        deviceSegment === segmentFilter ||
        deviceCategory === segmentFilter;

      return matchesSearch && matchesSegment;
    });
  }, [arrangedDevices, deviceSearch, deviceSegmentFilter]);

  const segmentSummary = useMemo(() => {
    const groups = new Map();
    arrangedDevices.forEach((device) => {
      const key = device.segment ? String(device.segment) : 'Unassigned';
      if (!groups.has(key)) {
        groups.set(key, { name: key, count: 0, active: 0, blocked: 0 });
      }
      const group = groups.get(key);
      group.count += 1;
      if (device.status === 'Allowed' || device.status === 'Verified') group.active += 1;
      if (device.status === 'Blocked' || device.status === 'Quarantined') group.blocked += 1;
    });

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [arrangedDevices]);

  const categorySummary = useMemo(() => {
    const groups = new Map();
    arrangedDevices.forEach((device) => {
      const key = device.category || inferCategory(device.device_type, device.vendor) || 'Other';
      if (!groups.has(key)) {
        groups.set(key, { name: key, count: 0, active: 0, blocked: 0 });
      }
      const group = groups.get(key);
      group.count += 1;
      if (device.status === 'Allowed' || device.status === 'Verified') group.active += 1;
      if (device.status === 'Blocked' || device.status === 'Quarantined') group.blocked += 1;
    });
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [arrangedDevices]);

  const deviceSegmentFilters = useMemo(
    () => [
      { key: 'all', label: 'All' },
      { key: 'assigned', label: 'Assigned' },
      { key: 'unassigned', label: 'Unassigned' },
      { key: 'personal', label: 'Personal' },
      { key: 'private', label: 'Private' },
      { key: 'work', label: 'Work' },
      { key: 'office', label: 'Office' },
      { key: 'iot', label: 'IoT' },
      { key: 'network', label: 'Network' },
      { key: 'camera', label: 'Camera' },
      { key: 'other', label: 'Other' },
    ],
    [],
  );

  const segmentColor = (name) => {
    const palette = ['#22c55e', '#3b82f6', '#eab308', '#a855f7', '#f97316', '#06b6d4'];
    const input = String(name || 'Unassigned');
    const idx = Math.abs(input.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % palette.length;
    return palette[idx];
  };

  return (
    <div className="flex h-screen bg-background text-gray-100 antialiased overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        threatCount={quarantinedCount}
        deviceCount={devices.length}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
        />
      )}

      <main className="flex-1 min-w-0 overflow-y-auto p-6 md:p-10">
        {!backendOnline && <OfflineBanner onRetry={() => window.dispatchEvent(new Event('retry:backend'))} />}
        {showOnlineToast && <OnlineToast />}
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 mb-10">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-gray-700 text-sm"
            >
              <Menu size={16} />
              Menu
            </button>
            <p className="text-[11px] uppercase tracking-[0.35em] text-accent-green/80 mb-3">Zero-Trust IoT Gateway</p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[0.95] text-white">
              Autonomous Security Console
            </h1>
            <p className="text-gray-400 mt-3 max-w-xl">
              Real-time device governance, network segmentation, and policy enforcement across the IoT perimeter.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="grid w-full max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <div className="bg-card p-3 rounded-xl border border-gray-800/80 shadow-xl flex items-center gap-3 min-w-0">
              <Activity className="text-accent-blue" size={18} />
              <div className="min-w-0">
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Live Traffic</span>
                <span className="block text-base font-bold font-mono truncate">{totalBandwidth.toFixed(2)} MB/s</span>
              </div>
            </div>

            <div className="bg-card p-3 rounded-xl border border-gray-800/80 shadow-xl flex items-center gap-3 min-w-0">
              <ShieldCheck className="text-accent-green" size={18} />
              <div className="min-w-0">
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Allowed</span>
                <span className="block text-base font-bold truncate">{allowedCount}</span>
              </div>
            </div>

            <div className="bg-card p-3 rounded-xl border border-gray-800/80 shadow-xl flex items-center gap-3 min-w-0">
              <ShieldAlert className="text-accent-red" size={18} />
              <div className="min-w-0">
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Quarantined</span>
                <span className="block text-base font-bold truncate">{quarantinedCount}</span>
              </div>
            </div>
          </motion.div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
              <div className="space-y-4">
                <div className="card-soft border border-gray-800/60 bg-gray-950/40 p-5 rounded-2xl">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Device snapshot</p>
                      <h2 className="text-xl font-bold text-gray-100">Top devices</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('devices')}
                      className="btn btn-ghost px-4 py-2 text-sm"
                    >
                      View all devices
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {dashboardDevices.map((device) => (
                      <DeviceCard
                        key={device.ip}
                        device={device}
                        compact
                        onVerify={(ip) => handleStatusChange(ip, 'Allowed')}
                        onBlock={(ip) => handleStatusChange(ip, 'Quarantined')}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="card-soft border border-gray-800/60 bg-gray-950/40 p-5 rounded-2xl">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Device classes</p>
                    <h2 className="text-xl font-bold text-gray-100 mb-4">Personal, private, and other devices</h2>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 mb-4">
                      {categorySummary.map((group) => {
                        const meta = getCategoryMeta(group.name, group.name);
                        return (
                          <div key={group.name} className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-3" style={{ borderColor: meta.border }}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color, boxShadow: `0 0 0 3px ${meta.color}20` }} />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-100 truncate">{group.name}</p>
                                  <p className="text-[11px] text-gray-500">{group.count} devices</p>
                                </div>
                              </div>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-gray-950/50 text-gray-300" style={{ borderColor: meta.border }}>
                                {group.active} active
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Segment summary</p>
                    <h2 className="text-xl font-bold text-gray-100 mb-4">Network segmentation</h2>
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {segmentSummary.map((segment) => (
                      <div key={segment.name} className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-3" style={{ borderColor: `${segmentColor(segment.name)}55` }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: segmentColor(segment.name), boxShadow: `0 0 0 3px ${segmentColor(segment.name)}20` }} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-100 truncate">{segment.name}</p>
                            <p className="text-[11px] text-gray-500">{segment.count} devices</p>
                            </div>
                          </div>
                          <span className="text-[11px] px-2 py-1 rounded-full border bg-gray-950/50 text-gray-300" style={{ borderColor: `${segmentColor(segment.name)}55` }}>
                            {segment.active} active
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className="h-full"
                            style={{ background: `linear-gradient(90deg, ${segmentColor(segment.name)} 0%, rgba(34,197,94,0.95) 100%)` }}
                            style={{ width: `${Math.max(12, (segment.count / Math.max(arrangedDevices.length, 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="card-soft border border-gray-800/60 bg-gray-950/40 p-4 rounded-2xl">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Device management</p>
                  <h2 className="text-xl font-bold text-gray-100">All devices</h2>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative w-full md:w-80">
                    <input
                      type="text"
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="Search devices by IP, vendor, segment..."
                      className="w-full rounded-xl border border-gray-800/80 bg-gray-950/60 px-4 py-2.5 pr-10 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">⌕</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeviceSearch('')}
                    disabled={!deviceSearch}
                    className="btn btn-ghost px-4 py-2.5 text-sm disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {deviceSegmentFilters.map((filter) => {
                  const isActive = deviceSegmentFilter === filter.key;
                  const count =
                    filter.key === 'all'
                      ? arrangedDevices.length
                      : filter.key === 'assigned'
                        ? assignedCount
                        : filter.key === 'unassigned'
                          ? unassignedCount
                          : arrangedDevices.filter((device) => {
                              const segment = String(device.segment || '').trim().toLowerCase();
                              const category = String(device.category || inferCategory(device.device_type, device.vendor) || '').toLowerCase();
                              return segment === filter.key || category === filter.key;
                            }).length;

                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setDeviceSegmentFilter(filter.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-all ${
                        isActive
                          ? 'border-blue-400/60 bg-blue-500/15 text-blue-200'
                          : 'border-gray-700 bg-gray-950/40 text-gray-300 hover:border-gray-500 hover:text-gray-100'
                      }`}
                    >
                      {filter.label}
                      <span className="rounded-full bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-[11px] text-gray-500">
                Showing {visibleDevices.length} device{visibleDevices.length === 1 ? '' : 's'} in {deviceSegmentFilter === 'all' ? 'all groups' : deviceSegmentFilter}.
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-gray-800/70 bg-gray-900/30 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Visible</div>
                  <div className="mt-1 text-lg font-bold text-gray-100">{visibleDevices.length}</div>
                </div>
                <div className="rounded-xl border border-gray-800/70 bg-gray-900/30 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Assigned</div>
                  <div className="mt-1 text-lg font-bold text-gray-100">{assignedCount}</div>
                </div>
                <div className="rounded-xl border border-gray-800/70 bg-gray-900/30 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Unassigned</div>
                  <div className="mt-1 text-lg font-bold text-gray-100">{unassignedCount}</div>
                </div>
              </div>
            </div>

            <motion.div
              variants={containerVariant}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {visibleDevices.map((device) => (
                <DeviceCard
                  key={device.ip}
                  device={device}
                  onVerify={(ip) => handleStatusChange(ip, 'Allowed')}
                  onBlock={(ip) => handleStatusChange(ip, 'Quarantined')}
                  onLimitChange={handleLimitChange}
                />
              ))}
            </motion.div>
          </div>
        )}

        {activeTab === 'threats' && <ThreatVault devices={arrangedDevices} />}
        {activeTab === 'topology' && <NetworkTopology devices={arrangedDevices} mode={runtimeMode} />}
        {activeTab === 'logs' && <AuditLogsTable logs={logs} />}
        {activeTab === 'admin' && <AdminPanel />}
      </main>
    </div>
  );
};

export default App;
