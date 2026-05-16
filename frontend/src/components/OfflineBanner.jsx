import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function OfflineBanner({ onRetry }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-4 z-50 max-w-3xl w-[95%]">
      <div className="flex items-center gap-3 bg-yellow-900/95 border border-yellow-700/60 text-yellow-50 rounded-lg px-4 py-3 shadow-lg">
        <AlertCircle size={20} className="text-yellow-300" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">Backend Offline</div>
          <div className="text-[12px] text-yellow-100/80">Unable to reach the backend API. Some data may be stale or unavailable.</div>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-yellow-800/70 hover:bg-yellow-800/90 text-yellow-50 text-sm"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    </div>
  );
}
