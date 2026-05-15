import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function TrafficChart({ device }) {
  const trafficData = useMemo(() => {
    const history = Array.isArray(device?.trafficHistory) ? device.trafficHistory : [];

    return history
      .slice(-12)
      .map((entry, index) => ({
        time: entry.time ?? `${index * 5}m`,
        traffic: Number(entry.mbps ?? entry.traffic ?? 0),
        timestamp: entry.timestamp ?? Date.now(),
      }));
  }, [device]);

  const isBlocked = device.status === 'Blocked' || device.status === 'Quarantined';
  const color = isBlocked ? '#ef4444' : '#22c55e';

  if (trafficData.length === 0) {
    return (
      <div className="mt-4 h-32 bg-gray-900/30 rounded-lg p-3 flex items-center justify-center text-xs text-gray-500 border border-dashed border-gray-700">
        Waiting for live traffic samples...
      </div>
    );
  }

  return (
    <div className="mt-4 h-32 bg-gray-900/30 rounded-lg p-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trafficData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id={`color-${device.ip}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107, 114, 128, 0.2)" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              border: `1px solid ${color}`,
              borderRadius: '0.5rem',
            }}
            formatter={(value) => [`${Number(value).toFixed(3)} MB/s`, 'Rate']}
          />
          <Area
            type="monotone"
            dataKey="traffic"
            stroke={color}
            fillOpacity={1}
            fill={`url(#color-${device.ip})`}
            isAnimationActive={true}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
