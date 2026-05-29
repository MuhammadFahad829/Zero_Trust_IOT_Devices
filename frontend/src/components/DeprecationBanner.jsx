import React from 'react';

const DeprecationBanner = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="bg-yellow-600 text-black p-3 rounded-md mb-4 flex items-start justify-between">
      <div className="flex-1">
        <strong className="block">Deprecation Notice</strong>
        <div className="text-sm">{message}</div>
      </div>
      <div className="ml-4">
        <button className="btn btn-ghost text-black" onClick={onClose} aria-label="Dismiss deprecation notice">Close</button>
      </div>
    </div>
  );
};

export default DeprecationBanner;
