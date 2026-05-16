import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function OnlineToast() {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 max-w-xl w-[92%]">
      <div className="flex items-center gap-3 card-soft border border-green-500/30 bg-green-950/90 px-4 py-3 shadow-2xl">
        <div className="p-2 rounded-full bg-green-500/15 text-green-300">
          <CheckCircle2 size={18} />
        </div>
        <div className="flex-1 text-sm">
          <div className="font-semibold text-green-100">Backend Back Online</div>
          <div className="text-[12px] text-green-100/75">Live device, traffic, and logs data are being refreshed again.</div>
        </div>
      </div>
    </div>
  );
}
