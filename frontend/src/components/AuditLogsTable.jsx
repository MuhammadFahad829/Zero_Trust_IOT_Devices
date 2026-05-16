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

  const summary = useMemo(() => {
    const total = logs.length;
    const quarantines = logs.filter((row) => /quarantine|block/i.test(String(row.event || '') + ' ' + String(row.detail || ''))).length;
    const allows = logs.filter((row) => /allow|release/i.test(String(row.event || '') + ' ' + String(row.detail || ''))).length;
    return { total, quarantines, allows };
  }, [logs]);

  return (
    <div className="card-soft p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Audit Logs</h2>
          <p className="text-sm text-gray-500">Search policy changes, quarantine events, and device actions.</p>
        </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="card-soft px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest text-gray-500">Total logs</div>
          <div className="mt-1 text-lg font-semibold text-gray-100">{summary.total}</div>
        </div>
        <div className="card-soft px-4 py-3 border border-red-500/20 bg-red-950/10">
          <div className="text-[11px] uppercase tracking-widest text-gray-500">Quarantine / block</div>
          <div className="mt-1 text-lg font-semibold text-red-300">{summary.quarantines}</div>
        </div>
        <div className="card-soft px-4 py-3 border border-green-500/20 bg-green-950/10">
          <div className="text-[11px] uppercase tracking-widest text-gray-500">Allow / release</div>
          <div className="mt-1 text-lg font-semibold text-green-300">{summary.allows}</div>
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh] rounded-xl border border-gray-800/60">
        <table className="w-full text-left text-sm">
          <thead className="text-gray-400 text-xs uppercase sticky top-0 bg-gray-950/95 backdrop-blur z-10">
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
                <tr key={idx} className="border-t border-gray-800 hover:bg-gray-900/50 transition-colors">
                  <td className="px-2 py-2 text-gray-400">
                    {row.timestamp ? new Date(row.timestamp * 1000).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs border ${
                        /quarantine|block/i.test(String(row.event || '') + ' ' + String(row.detail || ''))
                          ? 'bg-red-950/30 border-red-500/20 text-red-300'
                          : /allow|release/i.test(String(row.event || '') + ' ' + String(row.detail || ''))
                            ? 'bg-green-950/30 border-green-500/20 text-green-300'
                            : 'bg-gray-800 border-gray-700 text-gray-200'
                      }`}
                    >
                      {row.event || 'N/A'}
                    </span>
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
