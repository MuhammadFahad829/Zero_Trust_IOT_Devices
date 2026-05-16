import React, { useEffect, useMemo, useState } from 'react';
import { Monitor, Smartphone, ShieldAlert, CheckCircle, Cpu, Camera, Router, Gauge, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import TrafficChart from './TrafficChart';
import { cardVariant } from '../utils/animations';
import { formatBytes } from '../utils/format';
import { getVendorMeta, inferCategory, getDisplayName, getCategoryMeta } from '../utils/deviceIdentity';

const getCategoryIcon = (category) => {
  switch (category) {
    case 'Mobile':
      return <Smartphone size={18} />;
    case 'Computer':
      return <Monitor size={18} />;
    case 'Camera':
      return <Camera size={18} />;
    case 'Network':
      return <Router size={18} />;
    default:
      return <Cpu size={18} />;
  }
};

export default function DeviceCard({ device, onVerify, onBlock, onLimitChange, compact = false }) {
  const isBlocked = device.status === 'Quarantined' || device.status === 'Blocked';
  const vendor = useMemo(() => getVendorMeta(device.vendor), [device.vendor]);
  const category = useMemo(() => inferCategory(device.device_type, device.vendor), [device.device_type, device.vendor]);
  const categoryMeta = useMemo(() => getCategoryMeta(device.device_type, device.vendor), [device.device_type, device.vendor]);
  const displayName = useMemo(() => getDisplayName(device), [device]);
  const online = Boolean(device.online);
  const [limitInput, setLimitInput] = useState(String(device.mb_limit ?? 100));
  const [savingLimit, setSavingLimit] = useState(false);
  const [segmentInput, setSegmentInput] = useState(device.segment || '');
  const [savingSegment, setSavingSegment] = useState(false);
  const usagePct = useMemo(() => {
    const used = Number(device.trafficMB || 0);
    const lim = Math.max(1, Number(device.mb_limit || 100));
    return Math.min((used / lim) * 100, 100);
  }, [device.trafficMB, device.mb_limit]);

  useEffect(() => {
    setLimitInput(String(device.mb_limit ?? 100));
  }, [device.mb_limit]);

  useEffect(() => {
    setSegmentInput(device.segment || '');
  }, [device.segment]);

  const handleVerify = async () => {
    try {
      await fetch(`http://localhost:8000/allow/${device.ip}`, { method: 'POST' });
      if (onVerify) onVerify(device.ip);
    } catch (err) {
      console.error('Failed to verify device:', err);
    }
  };

  const handleBlock = async () => {
    try {
      await fetch(`http://localhost:8000/block/${device.ip}`, { method: 'POST' });
      if (onBlock) onBlock(device.ip);
    } catch (err) {
      console.error('Failed to block device:', err);
    }
  };

  const handleSetLimit = async () => {
    const parsed = Number(limitInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    try {
      setSavingLimit(true);
      await fetch(`http://localhost:8000/limit/${device.ip}/${parsed}`, { method: 'POST' });
      if (onLimitChange) onLimitChange(device.ip, parsed);
    } catch (err) {
      console.error('Failed to update device limit:', err);
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSetSegment = async (nextSegment) => {
    const value = String(nextSegment ?? segmentInput).trim();
    const normalized = value || 'unassigned';

    try {
      setSavingSegment(true);
      await fetch(`http://localhost:8000/segment/${device.ip}/${encodeURIComponent(normalized)}`, { method: 'POST' });
      if (normalized === 'unassigned') {
        setSegmentInput('');
      } else {
        setSegmentInput(normalized);
      }
    } catch (err) {
      console.error('Failed to update segment:', err);
    } finally {
      setSavingSegment(false);
    }
  };

  const presetSegments = ['personal', 'private', 'work', 'office', 'home', 'other', 'iot', 'network', 'guest', 'camera', 'family', 'security'];
  const suggestedSegments = useMemo(() => {
    if (category === 'Personal') return ['personal', 'family', 'home'];
    if (category === 'Private') return ['private', 'other', 'unassigned'];
    if (category === 'Camera') return ['camera', 'security', 'iot'];
    if (category === 'Mobile') return ['personal', 'work', 'guest'];
    if (category === 'Computer') return ['work', 'office', 'personal'];
    if (category === 'Network') return ['network', 'work', 'office'];
    if (category === 'IoT' || category === 'Smart Appliance') return ['iot', 'other', 'home'];
    return ['other', 'guest', 'work'];
  }, [category]);

  const autoAssignSegment = suggestedSegments[0] || 'other';

  return (
    <motion.div
      layout
      variants={cardVariant}
      initial="hidden"
      animate={device.alert ? 'alert' : 'visible'}
      whileHover={{ scale: compact ? 1.01 : 1.02 }}
      className={`border transition-all duration-300 overflow-hidden relative bg-card/70 backdrop-blur-sm ${compact ? 'p-4 rounded-xl' : 'p-6 rounded-2xl'} ${
        isBlocked
          ? 'border-red-500/50 shadow-[0_10px_40px_rgba(239,68,68,0.08)] crimson-glow'
          : 'border-green-500/30 shadow-[0_10px_40px_rgba(34,197,94,0.06)] neon-green-glow'
      } ${device.alert ? 'pulse-red' : ''}`}
    >
      {isBlocked && (
        <motion.div
          animate={{ x: [0, 4, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.4 }}
          className="absolute inset-0 border-2 border-red-500/20 rounded-2xl pointer-events-none"
        />
      )}

      <div className={`flex justify-between items-start ${compact ? 'mb-3' : 'mb-4'}`}>
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
          className={`${compact ? 'p-2.5 rounded-xl' : 'p-3 rounded-lg'} ${
            isBlocked ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
          }`}
          style={!isBlocked ? { backgroundColor: categoryMeta.bg, color: categoryMeta.color } : undefined}
        >
          {getCategoryIcon(category)}
        </motion.div>
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className={`px-3 py-1 rounded-full ${compact ? 'text-[10px]' : 'text-xs'} font-bold ${
            isBlocked
              ? 'bg-red-500 text-white'
              : 'bg-green-500/20 text-green-400'
          }`}
        >
          {device.status}
        </motion.span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center gap-3">
          <div
            className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-full text-white font-bold text-xs flex items-center justify-center border border-white/10 shadow-md`}
            style={{ backgroundColor: vendor.color, boxShadow: `0 0 0 1px ${categoryMeta.border}` }}
            title={vendor.name}
          >
            {vendor.token}
          </div>
          <div>
            <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold leading-tight`}>{displayName}</h3>
            <p className="text-xs text-gray-400">{vendor.name} • {category}</p>
          </div>
        </div>
        <div className={`mt-2 flex flex-wrap gap-2 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <span className="px-2 py-1 rounded-full border border-gray-700/80 bg-gray-900/40 text-gray-300 font-mono">{device.ip}</span>
          <span className="px-2 py-1 rounded-full border border-gray-700/80 bg-gray-900/40 text-gray-400 font-mono">{device.mac}</span>
          <span className={`px-2 py-1 rounded-full border ${online ? 'border-green-500/30 text-green-300 bg-green-950/20' : 'border-gray-700 text-gray-400 bg-gray-900/40'}`}>
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="px-2 py-1 rounded-full border border-blue-500/20 text-blue-300 bg-blue-950/20">
            {getDisplayName(device)}
          </span>
        </div>
      </motion.div>

      <div className={`grid grid-cols-2 gap-2 text-xs ${compact ? 'mb-2 mt-3' : 'mb-3 mt-0'}`}>
        <div className="bg-gray-900/35 border border-gray-700 rounded-lg p-2">
          <p className="text-gray-400">Live Rate</p>
          <p className="font-mono text-sm text-gray-100">{(device.trafficMbps || 0).toFixed(3)} MB/s</p>
        </div>
        <div className="bg-gray-900/35 border border-gray-700 rounded-lg p-2">
          <p className="text-gray-400">Total Usage</p>
          <p className="font-mono text-sm text-gray-100">{formatBytes(device.trafficBytes || 0)}</p>
        </div>
      </div>

      <div className={`mb-3 flex flex-wrap items-center gap-2 ${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-400`}>
        <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/35">{vendor.name}</span>
        <span className="px-2 py-1 rounded-full border" style={{ borderColor: categoryMeta.border, backgroundColor: categoryMeta.bg, color: categoryMeta.color }}>
          {category}
        </span>
        {device.segment ? (
          <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/35">Segment: {device.segment}</span>
        ) : (
          <span className="px-2 py-1 rounded-full border border-gray-700 bg-gray-900/35 text-gray-500">Unassigned</span>
        )}
      </div>

      {!compact && (
        <div className="mb-3 bg-gray-900/35 border border-gray-700 rounded-lg p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div>
              <div className="text-xs text-gray-300 font-medium">Segment assignment</div>
              <div className="text-[11px] text-gray-500">Quick assign, auto-assign, or clear</div>
            </div>
            <button
              type="button"
              onClick={() => handleSetSegment(autoAssignSegment)}
              disabled={savingSegment}
              className="px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-[11px] text-blue-200 hover:border-blue-400/60 hover:bg-blue-500/15 disabled:opacity-50"
            >
              Auto-assign {autoAssignSegment}
            </button>
          </div>
          <div className="mb-2">
            <div className="text-[11px] text-gray-500 mb-2">Suggested for {category}</div>
            <div className="flex flex-wrap gap-2">
              {suggestedSegments.map((segment) => (
                <button
                  key={`suggested-${segment}`}
                  type="button"
                  onClick={() => handleSetSegment(segment)}
                  disabled={savingSegment}
                  className="px-2 py-1 rounded-full border border-gray-700 bg-gray-950/50 text-[11px] text-gray-200 hover:border-blue-500/40 hover:text-blue-200 disabled:opacity-50"
                >
                  {segment}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {presetSegments.map((segment) => (
              <button
                key={segment}
                type="button"
                onClick={() => handleSetSegment(segment)}
                disabled={savingSegment}
                className="px-2 py-1 rounded-full border border-gray-700 bg-gray-950/50 text-[11px] text-gray-200 hover:border-blue-500/40 hover:text-blue-200 disabled:opacity-50"
              >
                {segment}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleSetSegment('unassigned')}
              disabled={savingSegment}
              className="px-2 py-1 rounded-full border border-gray-700 bg-gray-950/50 text-[11px] text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
            >
              clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={segmentInput}
              onChange={(e) => setSegmentInput(e.target.value)}
              placeholder="custom segment"
              className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-sm"
            />
            <button
              type="button"
              onClick={() => handleSetSegment()}
              disabled={savingSegment}
              className="btn btn-primary text-sm inline-flex items-center gap-1"
            >
              {savingSegment ? 'Saving' : 'Set'}
            </button>
          </div>
        </div>
      )}

      {/* Traffic Chart */}
      {!compact && <TrafficChart device={device} />}

      {!compact ? (
        <div className="mt-3 bg-gray-900/35 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Gauge size={14} />
              Per-device limit (MB)
            </div>
            <span className="text-[11px] text-gray-500">Current: {Number(device.mb_limit || 100).toFixed(0)} MB</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-gray-950 border border-gray-700 text-sm"
              placeholder="e.g. 500"
            />
            <button
              onClick={handleSetLimit}
              disabled={savingLimit}
              className="btn btn-primary text-sm inline-flex items-center gap-1"
            >
              <Save size={14} />
              {savingLimit ? 'Saving' : 'Set'}
            </button>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-gray-400 mb-1">
              <span>Usage vs limit</span>
              <span>{Number(device.trafficMB || 0).toFixed(2)} / {Number(device.mb_limit || 100).toFixed(0)} MB</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleVerify}
            className="flex-1 btn btn-success text-xs font-medium flex items-center justify-center gap-2 py-2"
          >
            <CheckCircle size={14} />
            {isBlocked ? 'Release' : 'Allow'}
          </button>
          <button
            onClick={handleBlock}
            className="flex-1 btn btn-ghost text-xs font-medium flex items-center justify-center gap-2 py-2"
          >
            <ShieldAlert size={14} />
            Block
          </button>
        </div>
      )}

      {!compact && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex gap-2 mt-4"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleVerify}
            className="flex-1 btn btn-success text-sm font-medium flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            {isBlocked ? 'Release' : 'Verify'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleBlock}
            className="flex-1 btn btn-ghost text-sm font-medium flex items-center justify-center gap-2"
          >
            <ShieldAlert size={16} />
            Block
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
