import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Cpu, Smartphone, Monitor, ShieldAlert, CheckCircle, ArrowRight, StopCircle } from 'lucide-react';
import { getVendorMeta, inferCategory, getDisplayName } from '../utils/deviceIdentity';
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

export default function NetworkTopology({ devices = [] }) {
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [hovered, setHovered] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const containerRef = useRef(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const radius = viewportWidth < 640 ? 95 : viewportWidth < 1024 ? 120 : 140;
  const nodeSize = viewportWidth < 640 ? 'w-12 h-12' : 'w-16 h-16';
  const useGrid = devices.length > 12;

  const allowedCount = devices.filter(d => d.status === 'Allowed' || d.status === 'Verified').length;
  const quarantinedCount = devices.filter(d => d.status === 'Blocked' || d.status === 'Quarantined').length;

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
      <div className="bg-blue-950/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Wifi className="text-blue-400" size={20} />
          <div>
            <h3 className="text-lg font-semibold text-blue-300">Network Topology</h3>
            <p className="text-sm text-gray-400">Zero-Trust Gateway architecture - hover devices for details</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Node size = live traffic</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Ring color = segment</span>
          <span className="px-2 py-1 rounded border border-gray-700 bg-gray-900/40">Token = vendor logo code</span>
        </div>
      </div>

      <div ref={containerRef} className="relative h-[360px] sm:h-96 bg-card/40 border border-gray-800/40 rounded-lg p-4 sm:p-6 overflow-hidden">
        {/* Center gateway */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <motion.div animate={{ boxShadow: ['0_0_0_0_rgba(59,130,246,0.35)', '0_0_0_18px_rgba(59,130,246,0)'] }} transition={{ repeat: Infinity, duration: 2 }} className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-xl flex items-center justify-center border border-blue-400">
            <Wifi className="text-white" size={viewportWidth < 640 ? 20 : 28} />
          </motion.div>
          <div className="mt-2 text-xs sm:text-sm text-blue-300 font-semibold">Zero-Trust Gateway</div>
        </div>

        {/* SVG layer for connection lines */}
        {/* Draw connection lines when using circular layout */}
        {!useGrid && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {devices.map((device, idx) => {
              const angle = (idx / devices.length) * 2 * Math.PI - Math.PI / 2;
              const x = radius * Math.cos(angle);
              const y = radius * Math.sin(angle);
              const cx = 50 + (x / (radius * 2)) * 100; // percent
              const cy = 50 + (y / (radius * 2)) * 100; // percent
              const isBlocked = device.status === 'Blocked' || device.status === 'Quarantined';
              const alpha = Math.min(0.2 + (device.trafficMB || 0) / 50, 0.6);
              return (
                <line
                  key={device.ip + '-line'}
                  x1="50%" y1="50%" x2={`${cx}%`} y2={`${cy}%`}
                  stroke={isBlocked ? `rgba(239,68,68,${0.22})` : `rgba(34,197,94,${alpha})`}
                  strokeWidth={1}
                />
              );
            })}
          </svg>
        )}

        {/* Device nodes - circle or grid fallback */}
        {!useGrid && devices.map((device, idx) => {
          const angle = (idx / devices.length) * 2 * Math.PI - Math.PI / 2;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          const left = `calc(50% + ${x}px)`;
          const top = `calc(50% + ${y}px)`;
          const isBlocked = device.status === 'Blocked' || device.status === 'Quarantined';
          const trafficScale = Math.min(1 + Number(device.trafficMbps || 0) * 0.25, 1.8);
          const ring = segmentColor(device.segment);

          return (
            <motion.button
              key={device.ip}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + idx * 0.03 }}
              style={{ left, top }}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              title={`${device.vendor || 'Unknown'} - ${device.ip} - ${device.status}`}
              onMouseEnter={(e) => setHovered({ device, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <div
                className={`${nodeSize} rounded-lg flex items-center justify-center border relative ${isBlocked ? 'bg-red-900/30 border-red-500/40' : 'bg-green-900/20 border-green-500/30'}`}
                style={{ transform: `scale(${trafficScale})`, borderColor: ring }}
              >
                <div className={isBlocked ? 'text-red-400' : 'text-green-300'}>
                  {getDeviceIcon(device.vendor)}
                </div>
                <span
                  className="absolute -bottom-2 px-1.5 py-0.5 rounded text-[9px] text-white"
                  style={{ backgroundColor: getVendorMeta(device.vendor).color }}
                >
                  {getVendorMeta(device.vendor).token}
                </span>
              </div>
              <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs font-mono text-gray-300 text-center max-w-[80px] truncate">{device.ip}</div>
              <div className="text-[10px] text-gray-400 text-center max-w-[90px] truncate">{getDisplayName(device)}</div>
              <div className="w-16 h-1 bg-gray-800 rounded mt-1 overflow-hidden">
                <div
                  className={`h-full ${isBlocked ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(Number(device.trafficMbps || 0) * 50, 100)}%` }}
                />
              </div>
              <div className={`mt-1 text-[10px] px-2 rounded-full ${isBlocked ? 'bg-red-600/80 text-white' : 'bg-green-600/90 text-white'}`}>{isBlocked ? 'Quarantined' : 'Allowed'}</div>
            </motion.button>
          );
        })}

        {useGrid && (
          <div className="absolute inset-4 grid grid-cols-3 sm:grid-cols-4 gap-3 p-2">
            {devices.map((device) => {
              const isBlocked = device.status === 'Blocked' || device.status === 'Quarantined';
              const ring = segmentColor(device.segment);
              return (
                <button
                  key={device.ip}
                  onMouseEnter={(e) => setHovered({ device, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className={`flex flex-col items-center p-2 rounded border ${isBlocked ? 'border-red-600/30 bg-red-900/10' : 'border-green-600/20 bg-green-900/5'}`}
                >
                  <div className="w-12 h-12 rounded-md flex items-center justify-center relative">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center border" style={{ borderColor: ring }}>
                      {getDeviceIcon(device.vendor)}
                    </div>
                    <span
                      className="absolute -bottom-2 px-1.5 py-0.5 rounded text-[9px] text-white"
                      style={{ backgroundColor: getVendorMeta(device.vendor).color }}
                    >
                      {getVendorMeta(device.vendor).token}
                    </span>
                  </div>
                  <div className="text-[10px] mt-1 text-gray-400 truncate max-w-[100px]">{getDisplayName(device)}</div>
                  <div className="text-xs mt-1 text-gray-200 truncate max-w-[100px]">{device.ip}</div>
                  <div className={`mt-1 px-2 text-[10px] rounded-full ${isBlocked ? 'bg-red-600/80 text-white' : 'bg-green-600/90 text-white'}`}>{isBlocked ? 'Quarantined' : 'Allowed'}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover tooltip with device details and quick actions */}
      {hovered && containerRef.current && (() => {
        const rect = containerRef.current.getBoundingClientRect();
        const left = Math.min(Math.max(8, hovered.x - rect.left + 8), rect.width - 220);
        const top = Math.min(Math.max(8, hovered.y - rect.top + 8), rect.height - 120);
        const d = hovered.device;
        return (
          <div style={{ left, top }} className="absolute z-50 pointer-events-auto">
            <div className="w-56 bg-card/95 border border-gray-700 rounded-lg p-3 text-xs shadow-lg">
              <div className="flex items-start gap-3">
                <div className="pt-1">{getDeviceIcon(d.vendor)}</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{getDisplayName(d)}</div>
                  <div className="text-gray-400 text-[11px] truncate">{getVendorMeta(d.vendor).name} • {inferCategory(d.device_type, d.vendor)} • {d.ip}</div>
                  <div className="mt-2 text-[11px] text-gray-300">Traffic: <span className="font-mono">{(d.trafficMbps || 0).toFixed(3)} MB/s</span> • <span className="font-mono">{formatBytes(d.trafficBytes || 0)}</span></div>
                  <div className="mt-1 text-[11px] text-gray-400">Segment: <span className="font-mono">{d.segment || 'default'}</span></div>
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

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-green-950/10 border border-green-500/20 rounded p-3 flex items-center justify-between">
          <div>
            <p className="text-green-300 font-semibold text-lg">{allowedCount}</p>
            <p className="text-xs text-gray-400">Allowed</p>
          </div>
          <div className="text-green-400"><CheckCircle /></div>
        </div>
        <div className="bg-red-950/10 border border-red-500/20 rounded p-3 flex items-center justify-between">
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
