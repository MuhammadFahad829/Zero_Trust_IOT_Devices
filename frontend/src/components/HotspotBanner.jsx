import React from 'react';
import { WifiOff } from 'lucide-react';

const HotspotBanner = ({ onRefresh }) => (
  <div className="card-soft rounded-xl border border-yellow-600/40 bg-yellow-900/10 text-yellow-200 p-2 mb-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <WifiOff className="text-yellow-400" />
        <div>
          <div className="font-semibold text-sm">Hotspot disconnected</div>
          <div className="text-xs text-yellow-200/80">Connect the configured hotspot to enable live device discovery and traffic features.</div>
        </div>
      </div>
      <div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn btn-primary py-2 px-3"
        >
          Check connection
        </button>
      </div>
    </div>
  </div>
);

export default HotspotBanner;
