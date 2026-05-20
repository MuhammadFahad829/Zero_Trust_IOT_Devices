import React, { useState } from 'react';

export default function SegmentLimitControl({ devices = [], handleLimitForIps }) {
  const [limit, setLimit] = useState('');
  const applying = false;

  const apply = async () => {
    if (!limit || !devices || devices.length === 0) return;
    const ips = devices.map((d) => d.ip).filter(Boolean);
    await handleLimitForIps(ips, Number(limit));
    setLimit('');
  };

  return (
    <div>
      <input
        type="number"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="e.g., 500"
        className="w-full px-3 py-3 rounded-xl bg-gray-950 border border-gray-700 text-gray-100 text-sm mb-2"
      />
      <button
        onClick={apply}
        disabled={devices.length === 0 || !limit}
        className="w-full px-3 py-3 rounded-xl bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Apply to segment ({devices.length} devices)
      </button>
    </div>
  );
}
