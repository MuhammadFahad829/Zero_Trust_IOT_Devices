import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { getDisplayName, getVendorMeta, inferCategory, getCategoryMeta } from '../utils/deviceIdentity';
import { formatBytes } from '../utils/format';

export default function ThreatVault({ devices }) {
  const quarantinedDevices = [...devices]
    .filter((d) => d.status === 'Blocked' || d.status === 'Quarantined')
    .sort((a, b) => Number(b.trafficBytes || 0) - Number(a.trafficBytes || 0));

  const totalBytes = quarantinedDevices.reduce((sum, d) => sum + Number(d.trafficBytes || 0), 0);

  const handleRelease = async (ip) => {
    try {
      await fetch(`http://localhost:8000/allow/${ip}`, { method: 'POST' });
      console.log(`Released device: ${ip}`);
    } catch (err) {
      console.error('Failed to release device:', err);
    }
  };

  const handleIsolate = async (ip) => {
    try {
      await fetch(`http://localhost:8000/block/${ip}`, { method: 'POST' });
      console.log(`Kept isolated: ${ip}`);
    } catch (err) {
      console.error('Failed to isolate device:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="card-soft border border-red-500/25 bg-red-950/15 p-4 md:p-5 shadow-[0_18px_50px_rgba(127,29,29,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/20 text-red-300">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-red-300/70 mb-1">Security view</p>
              <h3 className="text-2xl font-bold text-red-200">Threat Vault</h3>
              <p className="text-sm text-gray-400">Quarantined devices, held traffic, and enforcement actions in one place.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-300">
            <span className="px-3 py-1 rounded-full border border-red-500/20 bg-red-950/25">{quarantinedDevices.length} quarantined</span>
            <span className="px-3 py-1 rounded-full border border-red-500/20 bg-red-950/25">{formatBytes(totalBytes)} held</span>
            <span className="px-3 py-1 rounded-full border border-gray-700 bg-gray-900/40">Policy enforced</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl border border-red-500/20 bg-red-950/15 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Quarantined</div>
            <div className="mt-1 text-2xl font-bold text-red-200">{quarantinedDevices.length}</div>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-950/15 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Traffic held</div>
            <div className="mt-1 text-2xl font-bold text-red-200 font-mono">{formatBytes(totalBytes)}</div>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-950/15 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Policy state</div>
            <div className="mt-1 text-2xl font-bold text-red-200">Enforced</div>
          </div>
        </div>
      </div>

      {quarantinedDevices.length === 0 ? (
        <div className="card-soft text-center py-12 text-gray-400 border border-green-700/30 bg-green-950/10 rounded-2xl">
          <p className="font-medium text-green-300">No active threats detected</p>
          <p className="text-sm mt-1">All monitored devices are currently operating within policy.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quarantinedDevices.map((device, idx) => (
            <motion.div
              key={device.ip}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="card-soft border border-red-500/35 bg-red-950/10 p-4 rounded-2xl shadow-[0_0_18px_rgba(239,68,68,0.08)] crimson-glow pulse-red"
            >
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h4 className="text-lg font-semibold text-red-300">{getDisplayName(device)}</h4>
                  <p className="text-sm text-gray-400">{getVendorMeta(device.vendor).name} • {inferCategory(device.device_type, device.vendor)}</p>
                  <p className="text-sm text-gray-500 font-mono mt-1">{device.ip}</p>
                </div>
                <span className="px-3 py-1 bg-red-500 text-white text-xs rounded-full">Quarantined</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="card-soft p-2">
                  <p className="text-gray-500 mb-1">MAC Address</p>
                  <p className="text-sm font-mono text-gray-300">{device.mac}</p>
                </div>
                <div className="card-soft p-2">
                  <p className="text-gray-500 mb-1">Usage</p>
                  <p className="text-sm font-mono text-gray-300">{formatBytes(device.trafficBytes || 0)}</p>
                </div>
                <div className="card-soft p-2 col-span-2">
                  <p className="text-gray-500 mb-1">Traffic rate</p>
                  <p className="text-sm font-mono text-gray-300">{Number(device.trafficMbps || 0).toFixed(3)} MB/s</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleRelease(device.ip)}
                  className="btn btn-success flex-1 py-2"
                >
                  <RotateCcw size={16} />
                  Release
                </button>
                <button
                  onClick={() => handleIsolate(device.ip)}
                  className="btn btn-ghost flex-1 py-2"
                >
                  <Trash2 size={16} />
                  Force Keep Isolated
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
