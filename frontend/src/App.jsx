import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldAlert, ShieldCheck, Menu, Filter, Layers, CheckCircle, ArrowUpRight } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import AuditLogsTable from './components/AuditLogsTable';
import HotspotBanner from './components/HotspotBanner';
import TopDevices from './components/TopDevices';
import Segmentation from './components/Segmentation';

const ThreatVault = lazy(() => import('./components/ThreatVault'));
const NetworkTopology = lazy(() => import('./components/NetworkTopology'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
import { containerVariant } from './utils/animations';
import { inferCategory, getDisplayName } from './utils/deviceIdentity';

const App = () => {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [totalBandwidth, setTotalBandwidth] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [hotspotActive, setHotspotActive] = useState(true);
  const [devMode, setDevMode] = useState(() => {
    try {
      return localStorage.getItem('devHotspot') === '1';
    } catch (e) {
      return false;
    }
  });
  const [selectedDevices, setSelectedDevices] = useState(new Set());
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [bulkSegment, setBulkSegment] = useState('');
  const [availableSegments, setAvailableSegments] = useState([]);
  const [viewMode, setViewMode] = useState('professional');

  const fetchMode = async () => {
    try {
      const res = await fetch('http://localhost:8000/mode');
      const data = await res.json();
      // backend may return hotspot_active or hotspotActive
      const val = data?.hotspot_active ?? data?.hotspotActive ?? data?.hotspot ?? false;
      // allow devMode to override the backend mode for local testing
      setHotspotActive(Boolean(val) || devMode);
    } catch (err) {
      // keep last known state on error
    }
  };

  // persist dev mode and ensure hotspotActive reflects it immediately
  useEffect(() => {
    try {
      if (devMode) {
        localStorage.setItem('devHotspot', '1');
      } else {
        localStorage.removeItem('devHotspot');
      }
    } catch (e) {
      // ignore storage errors
    }
    if (devMode) setHotspotActive(true);
  }, [devMode]);

  useEffect(() => {
    fetchMode();
    const modeInterval = setInterval(fetchMode, 10000);
    const onRefresh = () => fetchMode();
    window.addEventListener('refresh:mode', onRefresh);
    const onNavigateDevices = () => {
      setActiveTab('devices');
      setMobileSidebarOpen(false);
    };
    window.addEventListener('navigate:devices', onNavigateDevices);
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'NEW_DEVICE' && msg.data?.ip) {
        setDevices((prev) => {
          if (prev.some((d) => d.ip === msg.data.ip)) return prev;
          return [
            ...prev,
            {
              ...msg.data,
              status: msg.data.status || 'Blocked',
              trafficMB: 0,
              trafficBytes: 0,
              trafficHistory: [],
              trafficMbps: 0,
              alert: false,
            },
          ];
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
      }
    };

    fetchDevices();
    const devInterval = setInterval(fetchDevices, 3000);
    return () => {
      ws.close();
      clearInterval(devInterval);
      clearInterval(modeInterval);
      window.removeEventListener('refresh:mode', onRefresh);
      window.removeEventListener('navigate:devices', onNavigateDevices);
    };
  }, []);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const res = await fetch('http://localhost:8000/traffic');
        const data = await res.json();
        if (data?.mbps !== undefined) {
          setTotalBandwidth(Number(data.mbps) || 0);
        }
      } catch (err) {
        // ignore noisy fallback errors if websocket is already active
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
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    const onProv = () => fetchLogs();
    window.addEventListener('provision:complete', onProv);

    return () => {
      clearInterval(interval);
      window.removeEventListener('provision:complete', onProv);
    };
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

  const handleBulkSegment = async (segment) => {
    if (selectedDevices.size === 0) return;
    
    try {
      for (const ip of selectedDevices) {
        const normalized = segment.trim() || 'unassigned';
        await fetch(`http://localhost:8000/segment/${ip}/${encodeURIComponent(normalized)}`, { method: 'POST' });
      }
      // Update local devices state
      setDevices((prev) =>
        prev.map((d) =>
          selectedDevices.has(d.ip) ? { ...d, segment: segment.trim() || '' } : d
        )
      );
      setSelectedDevices(new Set());
      setBulkSegment('');
    } catch (err) {
      console.error('Failed to apply segment:', err);
    }
  };

  const handleBulkLimit = async (mbLimit) => {
    if (selectedDevices.size === 0) return;
    try {
      for (const ip of selectedDevices) {
        await fetch(`http://localhost:8000/limit/${ip}/${Number(mbLimit)}`, { method: 'POST' });
      }
      setDevices((prev) => prev.map((d) => (selectedDevices.has(d.ip) ? { ...d, mb_limit: Number(mbLimit) } : d)));
      setSelectedDevices(new Set());
    } catch (err) {
      console.error('Failed to apply bulk limit:', err);
    }
  };

  // Apply a limit to a specific list of IPs (used by Segmentation for per-segment limits)
  const handleLimitForIps = async (ips = [], mbLimit) => {
    if (!Array.isArray(ips) || ips.length === 0) return;
    try {
      for (const ip of ips) {
        await fetch(`http://localhost:8000/limit/${ip}/${Number(mbLimit)}`, { method: 'POST' });
      }
      const ipSet = new Set(ips);
      setDevices((prev) => prev.map((d) => (ipSet.has(d.ip) ? { ...d, mb_limit: Number(mbLimit) } : d)));
    } catch (err) {
      console.error('Failed to apply limit for IPs:', err);
    }
  };

  // Extract unique segments from devices
  useEffect(() => {
    const segments = [...new Set(devices.filter((d) => d.segment).map((d) => d.segment))].sort();
    setAvailableSegments(segments);
  }, [devices]);

  const arrangedDevices = useMemo(() => {
    const now = Date.now() / 1000;
    const list = devices.map((d) => {
      const lastSeen = Number(d.last_seen || 0);
      const ageSec = lastSeen > 0 ? now - lastSeen : Number.POSITIVE_INFINITY;
      const online = ageSec <= 45;
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
  }, [devices]);

  const onlineCount = useMemo(
    () => arrangedDevices.filter((d) => d.online).length,
    [arrangedDevices],
  );

  const filteredDevices = useMemo(() => {
    if (segmentFilter === 'all') return arrangedDevices;
    if (segmentFilter === 'unassigned') return arrangedDevices.filter((d) => !d.segment || d.segment === '');
    return arrangedDevices.filter((d) => d.segment === segmentFilter);
  }, [arrangedDevices, segmentFilter]);

  return (
    <div className="flex h-screen bg-background text-gray-100 antialiased overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        threatCount={quarantinedCount}
        deviceCount={devices.length}
        hotspotActive={hotspotActive}
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

      <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 main-content">
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6 md:mb-10">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full flex flex-col md:flex-row md:items-center md:gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-gray-700 text-sm"
              >
                <Menu size={16} />
                Menu
              </button>

              <button
                type="button"
                onClick={() => hotspotActive && setActiveTab('devices')}
                disabled={!hotspotActive}
                title={hotspotActive ? 'View all devices' : 'Connect hotspot to view all devices'}
                className={`btn btn-ghost px-4 py-2 text-sm ${!hotspotActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                View all devices
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3 md:mt-0">
              <div className="bg-card p-4 rounded-xl border border-gray-800/80 flex items-center gap-4 min-w-[160px] sm:min-w-[200px] flex-1 sm:flex-initial">
                <Activity className="text-accent-blue" size={20} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Live Traffic</span>
                  <span className="text-2xl font-bold font-mono">{totalBandwidth.toFixed(2)} MB/s</span>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-gray-800/80 shadow flex items-center gap-4 min-w-[160px] sm:min-w-[200px] flex-1 sm:flex-initial">
                <ShieldCheck className="text-accent-green" size={20} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Allowed</span>
                  <span className="text-2xl font-bold">{allowedCount}</span>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-gray-800/80 shadow flex items-center gap-4 min-w-[160px] sm:min-w-[200px] flex-1 sm:flex-initial">
                <ShieldAlert className="text-accent-red" size={20} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Quarantined</span>
                  <span className="text-2xl font-bold">{quarantinedCount}</span>
                </div>
              </div>

              {/* Dev hotspot toggle removed from UI */}
            </div>
          </motion.div>
        </header>

        {!hotspotActive && (
          <HotspotBanner onRefresh={fetchMode} />
        )}

        {activeTab === 'dashboard' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Security Dashboard</h1>
              <p className="text-gray-400">Real-time monitoring of connected IoT devices and threat status</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card p-4 rounded-2xl border border-gray-800/60">
                    <div className="text-xs text-gray-400 uppercase">Live Traffic</div>
                    <div className="text-2xl font-bold font-mono mt-1">{totalBandwidth.toFixed(2)} MB/s</div>
                  </div>
                  <div className="bg-card p-4 rounded-2xl border border-gray-800/60">
                    <div className="text-xs text-gray-400 uppercase">Allowed</div>
                    <div className="text-2xl font-bold mt-1 text-green-300">{allowedCount}</div>
                  </div>
                  <div className="bg-card p-4 rounded-2xl border border-gray-800/60">
                    <div className="text-xs text-gray-400 uppercase">Quarantined</div>
                    <div className="text-2xl font-bold mt-1 text-red-300">{quarantinedCount}</div>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-2">Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm text-gray-400 mb-2">Top talkers</h4>
                      {/* compact top devices preview */}
                      <div className="space-y-2">
                        {arrangedDevices.slice(0,4).map((d) => (
                          <div key={d.ip} className="flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="text-sm text-white truncate">{getDisplayName(d)}</div>
                              <div className="text-xs text-gray-400 font-mono truncate">{d.ip}</div>
                            </div>
                            <div className="text-sm text-gray-300">{(d.trafficMB||0).toFixed(1)} MB</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm text-gray-400 mb-2">Activity</h4>
                      <div className="text-xs text-gray-400">Recent enforcement and network events appear here.</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="space-y-4">
                  {/* Top devices list */}
                  <React.Suspense fallback={<div className="p-4 bg-gray-900/20 rounded-lg">Loading...</div>}>
                    <TopDevices devices={arrangedDevices} onVerify={(ip)=>handleStatusChange(ip,'Allowed')} onBlock={(ip)=>handleStatusChange(ip,'Quarantined')} />
                  </React.Suspense>

                  {/* Quick link to all devices */}
                  <div className="mt-2">
                        <button onClick={()=> setActiveTab('devices')} className="w-full px-4 py-2 rounded-lg bg-accent-blue text-white inline-flex items-center justify-center gap-2">
                          Manage All Devices <ArrowUpRight size={16} />
                        </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div>
            <div className="mb-8 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-4xl font-bold text-white mb-2">All Connected Devices</h1>
                <p className="text-gray-400">View and manage all {devices.length} devices across your network</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="px-4 py-2 rounded-xl bg-gray-900/40 border border-gray-800 text-sm text-gray-300 inline-flex items-center gap-2">
                  <span className="text-gray-500">Online</span>
                  <span className="font-semibold text-white">{onlineCount}</span>
                </div>
                <div className="px-4 py-2 rounded-xl bg-gray-900/40 border border-gray-800 text-sm text-gray-300 inline-flex items-center gap-2">
                  <span className="text-gray-500">Selected</span>
                  <span className="font-semibold text-white">{selectedDevices.size}</span>
                </div>
                <div className="px-4 py-2 rounded-xl bg-gray-900/40 border border-gray-800 text-sm text-gray-300 inline-flex items-center gap-2">
                  <span className="text-gray-500">Segments</span>
                  <span className="font-semibold text-white">{availableSegments.length}</span>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-gray-800 bg-gray-900/35 p-3 md:p-4 shadow-lg shadow-black/10">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 items-end">
                <div className="xl:col-span-3">
                  <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-gray-500">
                    <Filter size={12} /> Segment filter
                  </label>
                  <select
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-gray-100 text-sm"
                  >
                    <option value="all">All Devices ({arrangedDevices.length})</option>
                    <option value="unassigned">Unassigned ({arrangedDevices.filter((d) => !d.segment).length})</option>
                    {availableSegments.map((seg) => (
                      <option key={seg} value={seg}>
                        {seg} ({arrangedDevices.filter((d) => d.segment === seg).length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="xl:col-span-3">
                  <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-gray-500">
                    <Layers size={12} /> Assign segment
                  </label>
                  <input
                    type="text"
                    value={bulkSegment}
                    onChange={(e) => setBulkSegment(e.target.value)}
                    placeholder="e.g., iot, work, home"
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-gray-100 text-sm"
                  />
                </div>

                <div className="xl:col-span-3">
                  <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-gray-500">
                    Selected devices
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedDevices(new Set(filteredDevices.map((d) => d.ip)))}
                      className="flex-1 px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/50 text-blue-200 text-sm hover:bg-blue-500/30 inline-flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} /> Select All
                    </button>
                    <button
                      onClick={() => setSelectedDevices(new Set())}
                      className="flex-1 px-3 py-3 rounded-xl bg-gray-700/40 border border-gray-600 text-gray-300 text-sm hover:bg-gray-700/60"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="xl:col-span-3 flex gap-2">
                  <button
                    onClick={() => handleBulkSegment(bulkSegment)}
                    disabled={selectedDevices.size === 0 || !bulkSegment.trim()}
                    className="flex-1 px-4 py-2 rounded-xl bg-accent-blue text-white font-medium text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    Apply to {selectedDevices.size}
                  </button>
                  <button
                    onClick={() => setViewMode(viewMode === 'professional' ? 'compact' : 'professional')}
                    className="px-4 py-2 rounded-xl bg-gray-800 text-gray-200 font-medium text-sm hover:bg-gray-700"
                  >
                    {viewMode === 'professional' ? 'Compact' : 'Professional'}
                  </button>
                </div>
              </div>

              {selectedDevices.size > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-2">Quick assign:</p>
                  <div className="flex flex-wrap gap-2">
                    {['iot', 'home', 'work', 'guest', 'camera', 'network', 'personal'].map((seg) => (
                      <button
                        key={seg}
                        onClick={() => handleBulkSegment(seg)}
                        className="px-3 py-2 rounded-full border border-gray-600 bg-gray-950/50 text-gray-300 text-xs hover:border-accent-blue hover:text-accent-blue"
                      >
                        {seg}
                      </button>
                    ))}
                    <button
                      onClick={() => handleBulkSegment('')}
                      className="px-3 py-2 rounded-full border border-gray-600 bg-gray-950/50 text-gray-500 text-xs hover:border-red-500 hover:text-red-400"
                    >
                      clear all
                    </button>
                  </div>
                </div>
              )}
            </div>

                <div className="space-y-3">
              {viewMode === 'professional' ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/25 overflow-hidden">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1080px]">
                      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900/35 text-[11px] uppercase tracking-[0.22em] text-gray-500 sticky top-0 z-10 border-b border-gray-800/60">
                        <div className="col-span-1 text-center">Sel</div>
                        <div className="col-span-2">Device</div>
                        <div className="col-span-1 text-center">Status</div>
                        <div className="col-span-1 text-center">Segment</div>
                        <div className="col-span-1 text-center">Traffic</div>
                        <div className="col-span-1 text-center">Limit</div>
                        <div className="col-span-2 text-center">Usage</div>
                        <div className="col-span-2 text-right">Actions</div>
                      </div>

                      <div className="divide-y divide-gray-800/60">
                        {filteredDevices.map((device) => {
                          const isBlocked = device.status === 'Quarantined' || device.status === 'Blocked';
                          const usagePct = Math.min(((device.trafficMB || 0) / (device.mb_limit || 100)) * 100, 100);
                          return (
                            <div
                              key={device.ip}
                              className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors ${isBlocked ? 'bg-red-950/10' : 'bg-transparent'} ${selectedDevices.has(device.ip) ? 'ring-1 ring-blue-500/50 bg-blue-500/5' : ''}`}
                            >
                              <div className="col-span-1 flex justify-center">
                                <button
                                  onClick={() => {
                                    const next = new Set(selectedDevices);
                                    if (next.has(device.ip)) next.delete(device.ip);
                                    else next.add(device.ip);
                                    setSelectedDevices(next);
                                  }}
                                  aria-pressed={selectedDevices.has(device.ip)}
                                  aria-label={`${selectedDevices.has(device.ip) ? 'Deselect' : 'Select'} ${device.ip}`}
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedDevices.has(device.ip) ? 'border-blue-400 bg-blue-500/20 text-blue-100' : 'border-gray-700 bg-gray-950/60 text-gray-400 hover:border-gray-500'}`}
                                >
                                  {selectedDevices.has(device.ip) ? '✓' : ''}
                                </button>
                              </div>

                              <div className="col-span-2 flex items-center gap-3 min-w-0">
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-gray-950 border border-gray-800 flex items-center justify-center text-gray-200 text-xs font-bold">
                                    {getDisplayName(device).slice(0, 2).toUpperCase()}
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-white truncate" title={getDisplayName(device)}>
                                    {getDisplayName(device)}
                                  </div>
                                  <div className="text-xs text-gray-500 font-mono truncate">{device.ip}</div>
                                </div>
                              </div>

                              <div className="col-span-1 text-center">
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${isBlocked ? 'bg-red-900/40 text-red-300' : device.online ? 'bg-green-900/40 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                                  {isBlocked ? 'Quarantined' : device.online ? 'Online' : 'Offline'}
                                </span>
                              </div>

                              <div className="col-span-1 text-center text-sm text-gray-300">
                                {device.segment || '—'}
                              </div>

                              <div className="col-span-1 text-center text-sm text-gray-300 font-mono">
                                {(device.trafficMbps || 0).toFixed(2)} MB/s
                              </div>

                              <div className="col-span-1 text-center text-sm text-gray-300 font-mono">
                                {device.mb_limit || 100}
                              </div>

                              <div className="col-span-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                                      style={{ width: `${usagePct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-400 w-12 text-right">{usagePct.toFixed(0)}%</span>
                                </div>
                              </div>

                              <div className="col-span-2 flex justify-end gap-2">
                                <button
                                  onClick={() => handleStatusChange(device.ip, 'Allowed')}
                                  disabled={!device.online}
                                  title={!device.online ? 'Device offline' : 'Allow device'}
                                  className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-green-900/30 text-green-300 hover:bg-green-900/50 disabled:opacity-30"
                                >
                                  <CheckCircle size={14} /> Allow
                                </button>
                                <button
                                  onClick={() => handleStatusChange(device.ip, 'Quarantined')}
                                  disabled={!device.online}
                                  title={!device.online ? 'Device offline' : 'Block device'}
                                  className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-red-900/30 text-red-300 hover:bg-red-900/50 disabled:opacity-30"
                                >
                                  <ShieldAlert size={14} /> Block
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <motion.div
                  variants={containerVariant}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                >
                  {filteredDevices.map((device) => (
                    <div key={device.ip} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(selectedDevices);
                          if (next.has(device.ip)) next.delete(device.ip);
                          else next.add(device.ip);
                          setSelectedDevices(next);
                        }}
                        aria-pressed={selectedDevices.has(device.ip)}
                        aria-label={`${selectedDevices.has(device.ip) ? 'Deselect' : 'Select'} ${device.ip}`}
                        className={`absolute top-3 right-3 z-10 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all shadow-sm backdrop-blur ${
                          selectedDevices.has(device.ip)
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40'
                            : 'border-gray-700/70 bg-gray-950/70 text-gray-300 hover:border-blue-400/40 hover:text-blue-100'
                        }`}
                      >
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                            selectedDevices.has(device.ip)
                              ? 'border-blue-300 bg-blue-500 text-white'
                              : 'border-gray-500 bg-transparent text-transparent'
                          }`}
                        >
                          {selectedDevices.has(device.ip) ? '✓' : ''}
                        </span>
                        {selectedDevices.has(device.ip) ? 'Selected' : 'Select'}
                      </button>
                      <DeviceCard
                        key={device.ip}
                        device={device}
                        compact
                        onVerify={(ip) => handleStatusChange(ip, 'Allowed')}
                        onBlock={(ip) => handleStatusChange(ip, 'Quarantined')}
                        onLimitChange={handleLimitChange}
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            {filteredDevices.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400">No devices found with segment: {segmentFilter}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'threats' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Threat Vault</h1>
              <p className="text-gray-400">Anomaly detection and security alerts for quarantined devices</p>
            </div>
            <Suspense fallback={<div className="text-center py-8">Loading threats...</div>}>
              <ThreatVault devices={arrangedDevices} />
            </Suspense>
          </div>
        )}
        {activeTab === 'topology' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Network Topology</h1>
              <p className="text-gray-400">Visualize device connections and network segments</p>
            </div>
            {!hotspotActive ? (
              <div className="p-6">
                <HotspotBanner onRefresh={fetchMode} />
                <div className="text-center text-gray-400 mt-4">Connect hotspot to enable live network topology.</div>
              </div>
            ) : (
              <Suspense fallback={<div className="text-center py-8">Loading topology...</div>}>
                <NetworkTopology devices={arrangedDevices} />
              </Suspense>
            )}
          </div>
        )}
        {activeTab === 'logs' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Audit Logs</h1>
              <p className="text-gray-400">Complete record of device activity and enforcement actions</p>
            </div>
            <AuditLogsTable logs={logs} />
          </div>
        )}
        {activeTab === 'segmentation' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Segmentation</h1>
              <p className="text-gray-400">Group devices, review segment coverage, and apply bulk changes</p>
            </div>
            <Segmentation
              devices={arrangedDevices}
              availableSegments={availableSegments}
              selectedDevices={selectedDevices}
              setSelectedDevices={setSelectedDevices}
              handleBulkLimit={handleBulkLimit}
              handleBulkSegment={handleBulkSegment}
              handleLimitForIps={handleLimitForIps}
            />
          </div>
        )}
        {activeTab === 'admin' && (
          <div>
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">Administration</h1>
              <p className="text-gray-400">Configure VLAN segments, policies, and security tokens</p>
            </div>
            {!hotspotActive ? (
              <div className="p-6">
                <HotspotBanner onRefresh={fetchMode} />
                <div className="text-center text-gray-400 mt-4">Administration requires an active hotspot connection.</div>
              </div>
            ) : (
              <Suspense fallback={<div className="text-center py-8">Loading administration...</div>}>
                <AdminPanel hotspotActive={hotspotActive} />
              </Suspense>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
