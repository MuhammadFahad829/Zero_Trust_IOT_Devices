import React from 'react';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { getDisplayName } from '../utils/deviceIdentity';

export default function TopDevices({ devices = [], onVerify = () => {}, onBlock = () => {} }) {
  const top = devices.slice(0, 8);
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Top Devices</h3>
        <span className="text-xs text-gray-400">Live</span>
      </div>
      <div className="space-y-3">
        {top.map((d) => {
          const usagePct = Math.min(((d.trafficMB || 0) / (d.mb_limit || 100)) * 100, 100);
          const isBlocked = d.status === 'Quarantined' || d.status === 'Blocked';
          return (
            <div key={d.ip} className="flex items-center gap-3">
              <div className="w-12 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gray-950 border border-gray-800 flex items-center justify-center text-gray-200 text-xs font-bold">{getDisplayName(d).slice(0,2).toUpperCase()}</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate">
                    <div className="text-sm font-medium truncate">{getDisplayName(d)}</div>
                    <div className="text-xs text-gray-500 font-mono">{d.ip}</div>
                  </div>
                  <div className="text-right min-w-[90px]">
                    <div className={`text-xs font-semibold ${isBlocked ? 'text-red-300' : d.online ? 'text-green-300' : 'text-gray-400'}`}>{isBlocked ? 'Quarantined' : d.online ? 'Online' : 'Offline'}</div>
                    <div className="text-xs text-gray-400">{(d.trafficMbps || 0).toFixed(2)} MB/s</div>
                  </div>
                </div>

                <div className="mt-2 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${usagePct}%`, height: '100%' }} />
                </div>
              </div>

              <div className="flex flex-col gap-2 ml-2">
                <button onClick={() => onVerify(d.ip)} disabled={!d.online} className="inline-flex items-center gap-2 px-3 py-1 rounded bg-green-900/40 text-green-300 text-sm hover:bg-green-900/60 disabled:opacity-40">
                  <CheckCircle size={14} />
                </button>
                <button onClick={() => onBlock(d.ip)} disabled={!d.online} className="inline-flex items-center gap-2 px-3 py-1 rounded bg-red-900/40 text-red-300 text-sm hover:bg-red-900/60 disabled:opacity-40">
                  <ShieldAlert size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {top.length === 0 && <div className="text-xs text-gray-400">No devices yet</div>}
      </div>
    </div>
  );
}
