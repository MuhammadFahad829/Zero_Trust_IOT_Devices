import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

export default function ThreatVault({ devices }) {
  const quarantinedDevices = devices.filter(d => d.status === 'Blocked' || d.status === 'Quarantined');

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
      <div className="glass bg-red-950/20 border border-red-500/30 rounded-lg p-6 mb-2">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-red-400">Threat Vault</h3>
            <p className="text-sm text-gray-400">
              {quarantinedDevices.length} device{quarantinedDevices.length !== 1 ? 's' : ''} in quarantine
            </p>
          </div>
        </div>
      </div>

      {quarantinedDevices.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border border-green-700/30 bg-green-950/10 rounded-lg">
          <p className="font-medium text-green-300">No active threats detected</p>
          <p className="text-sm mt-1">All monitored devices are currently operating within policy.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quarantinedDevices.map((device, idx) => (
            <motion.div
              key={device.ip}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`bg-red-950/10 border border-red-500/40 rounded-lg p-6 shadow-[0_0_20px_rgba(239,68,68,0.1)] crimson-glow pulse-red`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-semibold text-red-400">{device.vendor || 'Unknown Device'}</h4>
                  <p className="text-sm text-gray-400 font-mono">{device.ip}</p>
                </div>
                <span className="px-3 py-1 bg-red-500 text-white text-xs rounded-full">Quarantined</span>
              </div>

              <div className="bg-gray-900/50 rounded p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">MAC Address</p>
                <p className="text-sm font-mono text-gray-300">{device.mac}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleRelease(device.ip)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition"
                >
                  <RotateCcw size={16} />
                  Release
                </button>
                <button
                  onClick={() => handleIsolate(device.ip)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-red-900 rounded-lg text-sm font-medium transition"
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
