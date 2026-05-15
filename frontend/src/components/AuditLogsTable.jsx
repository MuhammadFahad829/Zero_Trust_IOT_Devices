import React, { useMemo, useState } from 'react';

export default function AuditLogsTable({ logs = [] }) {
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('ALL');

  const events = useMemo(() => {
    const set = new Set(logs.map((l) => l.event).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((row) => {
      const byEvent = eventFilter === 'ALL' || row.event === eventFilter;
      const needle = search.trim().toLowerCase();
      if (!needle) return byEvent;
      const hay = `${row.event || ''} ${row.ip || ''} ${row.detail || ''}`.toLowerCase();
      return byEvent && hay.includes(needle);
    });
  }, [logs, search, eventFilter]);

  return (
    <div className="p-6 bg-gray-900/40 rounded-lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">Audit Logs</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search IP/event/detail"
            className="bg-gray-950/70 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
          />
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="bg-gray-950/70 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
          >
            {events.map((eventName) => (
              <option key={eventName} value={eventName}>{eventName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-left text-sm">
          <thead className="text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Event</th>
              <th className="px-2 py-2">IP</th>
              <th className="px-2 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-2 py-4 text-center text-gray-500">No matching logs</td>
              </tr>
            ) : (
              filteredLogs.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-800">
                  <td className="px-2 py-2 text-gray-400">
                    {row.timestamp ? new Date(row.timestamp * 1000).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-2 py-2">
                    <span className="px-2 py-1 rounded bg-gray-800 text-xs">{row.event || 'N/A'}</span>
                  </td>
                  <td className="px-2 py-2 font-mono">{row.ip || '-'}</td>
                  <td className="px-2 py-2 text-gray-400">{row.detail || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
