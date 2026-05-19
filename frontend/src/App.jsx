import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldAlert, ShieldCheck, Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import AuditLogsTable from './components/AuditLogsTable';
import HotspotBanner from './components/HotspotBanner';

const ThreatVault = lazy(() => import('./components/ThreatVault'));
const NetworkTopology = lazy(() => import('./components/NetworkTopology'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
import { containerVariant } from './utils/animations';
import { inferCategory } from './utils/deviceIdentity';

const App = () => {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [totalBandwidth, setTotalBandwidth] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [hotspotActive, setHotspotActive] = useState(true);

  const fetchMode = async () => {
    try {
      const res = await fetch('http://localhost:8000/mode');
      const data = await res.json();
      // backend may return hotspot_active or hotspotActive
      const val = data?.hotspot_active ?? data?.hotspotActive ?? data?.hotspot ?? false;
      setHotspotActive(Boolean(val));
    } catch (err) {
      // keep last known state on error
    }
  };

  useEffect(() => {
    fetchMode();
    const modeInterval = setInterval(fetchMode, 10000);
    const onRefresh = () => fetchMode();
    window.addEventListener('refresh:mode', onRefresh);
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

      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-10">
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

            <div className="flex items-center gap-4 mt-3 md:mt-0">
              <div className="bg-card p-3 rounded-xl border border-gray-800/80 flex items-center gap-3 min-w-[170px]">
                <Activity className="text-accent-blue" size={18} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Live Traffic</span>
                  <span className="text-lg font-bold font-mono">{totalBandwidth.toFixed(2)} MB/s</span>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-gray-800/80 shadow flex items-center gap-3 min-w-[170px]">
                <ShieldCheck className="text-accent-green" size={18} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Allowed</span>
                  <span className="text-lg font-bold">{allowedCount}</span>
                </div>
              </div>

              <div className="bg-card p-4 rounded-xl border border-gray-800/80 shadow flex items-center gap-3 min-w-[170px]">
                <ShieldAlert className="text-accent-red" size={18} />
                <div>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Quarantined</span>
                  <span className="text-lg font-bold">{quarantinedCount}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </header>

        {!hotspotActive && (
          <HotspotBanner onRefresh={fetchMode} />
        )}

        {activeTab === 'dashboard' && (
          <div>
            <motion.div
              variants={containerVariant}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
            >
              {arrangedDevices.slice(0, 6).map((device) => (
                <DeviceCard
                  key={device.ip}
                  device={device}
                  compact
                  onVerify={(ip) => handleStatusChange(ip, 'Allowed')}
                  onBlock={(ip) => handleStatusChange(ip, 'Quarantined')}
                  onLimitChange={handleLimitChange}
                />
              ))}
            </motion.div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('devices')}
                disabled={!hotspotActive}
                title={!hotspotActive ? 'Connect hotspot to view all devices' : undefined}
                className={`px-4 py-2 rounded-lg ${!hotspotActive ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-accent-blue text-white'}`}
              >
                View All Devices
              </button>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          >
            {arrangedDevices.map((device) => (
              <DeviceCard
                key={device.ip}
                device={device}
                onVerify={(ip) => handleStatusChange(ip, 'Allowed')}
                onBlock={(ip) => handleStatusChange(ip, 'Quarantined')}
                onLimitChange={handleLimitChange}
              />
            ))}
          </motion.div>
        )}

        {activeTab === 'threats' && (
          <Suspense fallback={<div>Loading threats...</div>}>
            <ThreatVault devices={arrangedDevices} />
          </Suspense>
        )}
        {activeTab === 'topology' && (
          !hotspotActive ? (
            <div className="p-6">
              <HotspotBanner onRefresh={fetchMode} />
              <div className="text-center text-gray-400">Connect hotspot to enable live network topology.</div>
            </div>
          ) : (
            <Suspense fallback={<div>Loading topology...</div>}>
              <NetworkTopology devices={arrangedDevices} />
            </Suspense>
          )
        )}
        {activeTab === 'logs' && <AuditLogsTable logs={logs} />}
        {activeTab === 'admin' && (
          !hotspotActive ? (
            <div className="p-6">
              <HotspotBanner onRefresh={fetchMode} />
              <div className="text-center text-gray-400">Administration requires an active hotspot connection.</div>
            </div>
          ) : (
            <Suspense fallback={<div>Loading administration...</div>}>
              <AdminPanel hotspotActive={hotspotActive} />
            </Suspense>
          )
        )}
      </main>
    </div>
  );
};

export default App;
