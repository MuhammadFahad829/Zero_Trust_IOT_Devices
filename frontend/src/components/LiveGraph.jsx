import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function LiveGraph({ data }) {
  const chartData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <div className="w-full h-64 rounded-xl border border-gray-800/60 bg-gray-950/30 p-3">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid rgba(59,130,246,0.35)',
              borderRadius: '0.75rem',
            }}
          />
          <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
