import React from 'react';

export default function Skeleton({rows = 6, mode = 'card'}) {
  if (mode === 'table') {
    return (
      <div className="space-y-2">
        {Array.from({length: rows}).map((_, i) => (
          <div key={i} className="skeleton-row h-12 rounded-lg bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} className="skeleton-card p-4 rounded-2xl bg-gray-900/20 border border-gray-800/50 animate-pulse">
          <div className="h-10 w-10 rounded-full bg-gray-800 mb-3" />
          <div className="h-4 bg-gray-800 rounded mb-2 w-3/4" />
          <div className="h-3 bg-gray-800 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
