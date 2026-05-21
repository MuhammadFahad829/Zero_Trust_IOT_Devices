import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
} from 'recharts';
import { getDisplayName } from '../utils/deviceIdentity';

const DeviceLimitsGraph = ({ devices = [] }) => {
  const chartData = useMemo(() => {
    return devices.map((device) => {
      const usagePercent = Math.min(
        ((device.trafficMB || 0) / (device.mb_limit || 100)) * 100,
        100
      );
      return {
        name: getDisplayName(device).slice(0, 15),
        ip: device.ip,
        limit: device.mb_limit || 100,
        usage: device.trafficMB || 0,
        percent: parseFloat(usagePercent.toFixed(1)),
        status: device.status,
        online: device.online,
      };
    });
  }, [devices]);

  const historyMap = useMemo(() => {
    const m = new Map();
    devices.forEach((d) => {
      const raw = d.trafficHistory || [];
      const normalized = raw.map((p, i) => {
        if (p == null) return { x: i, y: 0 };
        if (typeof p === 'number') return { x: i, y: p };
        return { x: i, y: Number(p.mbps ?? p.value ?? p.mb ?? 0) };
      });
      m.set(d.ip, normalized.slice(-20));
    });
    return m;
  }, [devices]);

  const segmentData = useMemo(() => {
    const map = new Map();
    devices.forEach((d) => {
      const key = d.segment || 'unassigned';
      const prev = map.get(key) || { limit: 0, usage: 0, count: 0 };
      prev.limit += Number(d.mb_limit || 0);
      prev.usage += Number(d.trafficMB || 0);
      prev.count += 1;
      map.set(key, prev);
    });
    return Array.from(map.entries()).map(([segment, vals]) => ({
      segment,
      limit: Number(vals.limit.toFixed ? vals.limit : vals.limit),
      usage: Number(vals.usage.toFixed ? vals.usage : vals.usage),
      count: vals.count,
    }));
  }, [devices]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900/95 border border-gray-700 rounded p-3 shadow-lg">
          <p className="text-white font-semibold text-sm">{data.name}</p>
          <p className="text-gray-300 text-xs">{data.ip}</p>
          <p className="text-green-400 text-xs mt-1">
            Limit: {data.limit} MB
          </p>
          <p className="text-blue-400 text-xs">
            Usage: {data.usage.toFixed(1)} MB
          </p>
          <p className="text-amber-400 text-xs mt-1">
            {data.percent.toFixed(1)}% used
          </p>
          <p className="text-gray-400 text-xs">
            Status: {data.online ? (data.status === 'Quarantined' ? '🔒 Blocked' : '✓ Online') : '⊘ Offline'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white">Device Limits & Usage</h3>
        <p className="text-sm text-gray-400">
          Visual breakdown of each device's bandwidth allocation and current usage
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="card-soft p-2 rounded-xl">
          <div className="text-xs text-gray-400 font-semibold">Total Devices</div>
          <div className="text-2xl font-bold text-white mt-1">{devices.length}</div>
        </div>
        <div className="card-soft p-2 rounded-xl">
          <div className="text-xs text-gray-400 font-semibold">Total Limit</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {(devices.reduce((sum, d) => sum + (d.mb_limit || 100), 0)).toFixed(0)} MB
          </div>
        </div>
        <div className="card-soft p-2 rounded-xl">
          <div className="text-xs text-gray-400 font-semibold">Total Usage</div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {(devices.reduce((sum, d) => sum + (d.trafficMB || 0), 0)).toFixed(1)} MB
          </div>
        </div>
        <div className="card-soft p-2 rounded-xl">
          <div className="text-xs text-gray-400 font-semibold">Avg Usage</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {devices.length > 0
              ? (
                  (devices.reduce((sum, d) => sum + (d.trafficMB || 0), 0) /
                    devices.reduce((sum, d) => sum + (d.mb_limit || 100), 0)) *
                  100
                ).toFixed(1)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* Per-segment aggregate chart */}
      <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-2">
        <h4 className="text-sm font-semibold text-white mb-3">Segment Totals</h4>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={segmentData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="segment" angle={-45} textAnchor="end" height={70} tick={{ fill: '#999', fontSize: 12 }} />
              <YAxis tick={{ fill: '#999' }} />
              <Tooltip formatter={(v) => `${v} MB`} />
              <Legend />
              <Bar dataKey="limit" name="Limit" fill="#3B82F6" />
              <Bar dataKey="usage" name="Usage" fill="#10B981" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-2">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fill: '#999', fontSize: 12 }}
            />
            <YAxis
              label={{
                value: 'Bandwidth (MB)',
                angle: -90,
                position: 'insideLeft',
                fill: '#999',
              }}
              tick={{ fill: '#999' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
            />
            <Bar dataKey="limit" fill="#3B82F6" name="Limit" radius={[8, 8, 0, 0]} />
            <Bar dataKey="usage" fill="#10B981" name="Usage" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Usage Percentage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* High Usage Devices */}
        <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-4">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            High Usage (≥70%)
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
                {chartData
              .filter((d) => d.percent >= 70)
              .sort((a, b) => b.percent - a.percent)
              .map((device) => (
                <div key={device.ip} className="flex items-center justify-between bg-red-900/20 border border-red-700/30 rounded p-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="text-xs font-semibold text-white truncate">{device.name}</div>
                      <div className="text-xs text-gray-500 truncate">{device.ip}</div>
                    </div>
                    <div className="w-28">
                      <ResponsiveContainer width="100%" height={40}>
                        <LineChart data={historyMap.get(device.ip) || []}>
                          <Line dataKey="y" stroke="#fb7185" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-400">{device.percent.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500">{device.usage.toFixed(1)}/{device.limit} MB</div>
                  </div>
                </div>
              ))}
            {chartData.filter((d) => d.percent >= 70).length === 0 && (
              <p className="text-xs text-gray-500 italic">No devices with high usage</p>
            )}
          </div>
        </div>

        {/* Medium Usage Devices */}
        <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-4">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
            Medium Usage (30-70%)
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
                {chartData
              .filter((d) => d.percent >= 30 && d.percent < 70)
              .sort((a, b) => b.percent - a.percent)
              .map((device) => (
                <div key={device.ip} className="flex items-center justify-between bg-amber-900/20 border border-amber-700/30 rounded p-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="text-xs font-semibold text-white truncate">{device.name}</div>
                      <div className="text-xs text-gray-500 truncate">{device.ip}</div>
                    </div>
                    <div className="w-28">
                      <ResponsiveContainer width="100%" height={40}>
                        <LineChart data={historyMap.get(device.ip) || []}>
                          <Line dataKey="y" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-amber-400">{device.percent.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500">{device.usage.toFixed(1)}/{device.limit} MB</div>
                  </div>
                </div>
              ))}
            {chartData.filter((d) => d.percent >= 30 && d.percent < 70).length === 0 && (
              <p className="text-xs text-gray-500 italic">
                No devices with medium usage
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Low Usage Devices */}
      <div className="bg-gray-900/20 border border-gray-700/50 rounded-lg p-4">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
          Low Usage ({`<30%`})
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {chartData
            .filter((d) => d.percent < 30)
            .sort((a, b) => b.percent - a.percent)
            .map((device) => (
              <div key={device.ip} className="bg-green-900/20 border border-green-700/30 rounded p-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{device.name}</div>
                    <div className="text-xs text-gray-500 truncate">{device.ip}</div>
                  </div>
                  <div className="w-28">
                    <ResponsiveContainer width="100%" height={40}>
                      <LineChart data={historyMap.get(device.ip) || []}>
                        <Line dataKey="y" stroke="#10B981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="text-xs text-green-400 font-bold">{device.percent.toFixed(1)}%</span>
                    <div className="text-xs text-gray-500">{device.usage.toFixed(1)}MB</div>
                  </div>
                </div>
              </div>
            ))}
        </div>
        {chartData.filter((d) => d.percent < 30).length === 0 && (
          <p className="text-xs text-gray-500 italic">
            No devices with low usage
          </p>
        )}
      </div>
    </div>
  );
};

export default DeviceLimitsGraph;
