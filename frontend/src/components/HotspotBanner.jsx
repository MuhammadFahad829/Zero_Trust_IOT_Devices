import React from 'react';
import { WifiOff } from 'lucide-react';

const HotspotBanner = ({ onRefresh }) => (
  <div className="card-soft rounded-xl border border-yellow-600/40 bg-yellow-900/10 text-yellow-200 p-3 mb-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <WifiOff className="text-yellow-400" />
        <div>
          <div className="font-semibold">Hotspot disconnected</div>
          <div className="text-sm text-yellow-200/80">Connect the configured hotspot to enable live device discovery and traffic features.</div>
        </div>
      </div>
      <div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn btn-primary px-3 py-2"
        >
          Check connection
        </button>
      </div>
    </div>
  </div>
);

export default HotspotBanner;
