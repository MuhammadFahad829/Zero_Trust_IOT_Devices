import React, { useState, useMemo } from 'react';
import DeviceLimitsGraph from './DeviceLimitsGraph';
import SegmentLimitControl from './SegmentLimitControl';

export default function Segmentation({ devices = [], availableSegments = [], selectedDevices = new Set(), setSelectedDevices, handleBulkLimit, handleBulkSegment, handleLimitForIps }) {
  
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [bulkLimitInput, setBulkLimitInput] = useState('');
  const [activePresetGroup, setActivePresetGroup] = useState('personal');

  const presetGroups = useMemo(() => ([
    {
      key: 'personal',
      label: 'Personal',
      description: 'Home and family devices',
      presets: ['personal', 'home', 'family'],
    },
    {
      key: 'workspace',
      label: 'Workspace',
      description: 'Office and work endpoints',
      presets: ['work', 'office', 'corp'],
    },
    {
      key: 'iot',
      label: 'IoT',
      description: 'Cameras, sensors, network gear',
      presets: ['iot', 'camera', 'network', 'security'],
    },
    {
      key: 'guest',
      label: 'Guest',
      description: 'Temporary and visitor access',
      presets: ['guest', 'temporary', 'visitor'],
    },
  ]), []);

  const segmentCounts = useMemo(() => {
    const map = new Map();
    devices.forEach((d) => {
      const key = d.segment || 'unassigned';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [devices]);

  const filtered = useMemo(() => {
    if (selectedSegment === 'all') return devices;
    if (selectedSegment === 'unassigned') return devices.filter((d) => !d.segment);
    return devices.filter((d) => d.segment === selectedSegment);
  }, [devices, selectedSegment]);

  const selectedPreview = useMemo(() => {
    return devices.filter((device) => selectedDevices.has(device.ip));
  }, [devices, selectedDevices]);

  const chosenGroup = presetGroups.find((group) => group.key === activePresetGroup) || presetGroups[0];

  const bulkLimit = Number(bulkLimitInput || 0);
  const previewSummary = useMemo(() => {
    const selectedCount = selectedPreview.length;
    const onlineCount = selectedPreview.filter((device) => device.online).length;
    const currentLimitTotal = selectedPreview.reduce((sum, device) => sum + Number(device.mb_limit || 100), 0);
    const currentUsageTotal = selectedPreview.reduce((sum, device) => sum + Number(device.trafficMB || 0), 0);
    const projectedLimitTotal = selectedCount > 0 && Number.isFinite(bulkLimit) && bulkLimit > 0 ? selectedCount * bulkLimit : null;

    return {
      selectedCount,
      onlineCount,
      currentLimitTotal,
      currentUsageTotal,
      projectedLimitTotal,
    };
  }, [bulkLimit, selectedPreview]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Segmentation & Limits</h1>
        <p className="text-gray-400">Macro segmentation overview and per-device limit adjustments.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-6">
        <div className="xl:col-span-8 bg-gray-900/40 border border-gray-800 rounded-2xl p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-200 border border-blue-500/20 text-xs">{devices.length} devices</span>
                <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-200 border border-green-500/20 text-xs">{previewSummary.onlineCount} online in preview</span>
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-200 border border-amber-500/20 text-xs">{availableSegments.length} known segments</span>
              </div>
              <label className="block text-sm font-medium text-gray-300">Filter by Segment</label>
              <select value={selectedSegment} onChange={(e) => setSelectedSegment(e.target.value)} className="mt-2 w-full lg:w-80 px-3 py-3 rounded-xl bg-gray-950 border border-gray-700 text-gray-100 text-sm">
                <option value="all">All Devices ({devices.length})</option>
                <option value="unassigned">Unassigned ({segmentCounts.get('unassigned') || 0})</option>
                {availableSegments.map((seg) => (
                  <option key={seg} value={seg}>{seg} ({segmentCounts.get(seg) || 0})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSelectedDevices(new Set(filtered.map((d) => d.ip)))} className="px-4 py-3 rounded-xl bg-blue-500/20 border border-blue-500/50 text-blue-200 text-sm hover:bg-blue-500/30">Select All</button>
              <button onClick={() => setSelectedDevices(new Set())} className="px-4 py-3 rounded-xl bg-gray-700/40 border border-gray-600 text-gray-300 text-sm hover:bg-gray-700/60">Clear</button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Filtered Devices</div>
              <div className="mt-1 text-2xl font-bold text-white">{filtered.length}</div>
              <div className="text-xs text-gray-400">in the current segment filter</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Selected Preview</div>
              <div className="mt-1 text-2xl font-bold text-white">{previewSummary.selectedCount}</div>
              <div className="text-xs text-gray-400">devices ready for bulk action</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Projected Limit</div>
              <div className="mt-1 text-2xl font-bold text-white">
                {previewSummary.projectedLimitTotal === null ? '—' : `${previewSummary.projectedLimitTotal.toFixed(0)} MB`}
              </div>
              <div className="text-xs text-gray-400">after applying the current bulk limit</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="w-full min-h-[240px] overflow-auto">
              <DeviceLimitsGraph devices={filtered} />
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 md:p-5">
            <h3 className="text-lg font-semibold text-white mb-1">Bulk Preview</h3>
            <p className="text-xs text-gray-400 mb-4">Review selected devices before applying changes.</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-gray-950/30 border border-gray-800 p-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Selected</div>
                <div className="text-xl font-bold text-white mt-1">{previewSummary.selectedCount}</div>
              </div>
              <div className="rounded-xl bg-gray-950/30 border border-gray-800 p-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Online</div>
                <div className="text-xl font-bold text-green-300 mt-1">{previewSummary.onlineCount}</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Set limit (MB) for selected</label>
              <input
                type="number"
                value={bulkLimitInput}
                onChange={(e) => setBulkLimitInput(e.target.value)}
                placeholder="e.g., 500"
                className="w-full px-3 py-3 rounded-xl bg-gray-950 border border-gray-700 text-gray-100 text-sm mb-2"
              />
              <button
                onClick={() => { if (bulkLimitInput && selectedDevices.size > 0) handleBulkLimit(Number(bulkLimitInput)); }}
                disabled={selectedDevices.size === 0 || !bulkLimitInput}
                className="w-full px-3 py-3 rounded-xl bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Limit
              </button>
            </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Set limit for current segment (MB)</label>
                        <SegmentLimitControl
                          devices={filtered}
                          handleLimitForIps={handleLimitForIps}
                        />
                      </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Grouped presets</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {presetGroups.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => setActivePresetGroup(group.key)}
                    className={`px-3 py-2 rounded-full border text-xs transition ${activePresetGroup === group.key ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-gray-700 bg-gray-950/40 text-gray-300 hover:border-gray-500'}`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-3 mb-3">
                <div className="text-sm font-semibold text-white">{chosenGroup.label}</div>
                <div className="text-xs text-gray-400 mb-3">{chosenGroup.description}</div>
                <div className="flex flex-wrap gap-2">
                  {chosenGroup.presets.map((seg) => (
                    <button
                      key={seg}
                      onClick={() => handleBulkSegment(seg)}
                      className="px-3 py-2 rounded-full border border-gray-600 bg-gray-950/50 text-gray-300 text-xs hover:border-accent-blue hover:text-accent-blue"
                    >
                      {seg}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => handleBulkSegment('')} className="w-full px-3 py-3 rounded-xl border border-gray-600 text-xs text-gray-400 hover:border-red-500 hover:text-red-300">
                Clear segment for selected
              </button>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-3">
              <div className="text-xs uppercase tracking-[0.24em] text-gray-500 mb-2">Preview selection</div>
              <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                {selectedPreview.length > 0 ? selectedPreview.slice(0, 8).map((device) => (
                  <div key={device.ip} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/30 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">{device.ip}</div>
                      <div className="text-xs text-gray-500 truncate">{device.segment || 'Unassigned'} · {(device.trafficMB || 0).toFixed(1)} MB</div>
                    </div>
                    <div className="text-xs font-semibold text-gray-300">{device.online ? 'Online' : 'Offline'}</div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-gray-800 bg-gray-900/20 p-4 flex flex-col gap-2">
                    <div className="text-sm font-semibold text-white">No devices selected</div>
                    <div className="text-xs text-gray-400">Pick devices to preview changes before applying bulk limits or segments.</div>
                    <div className="text-xs text-gray-400">Tips:</div>
                    <ul className="text-xs text-gray-400 list-disc list-inside ml-2">
                      <li>Go to the Devices tab and click <span className="font-semibold text-gray-200">Select</span> on rows or use <span className="font-semibold text-gray-200">Select All</span>.</li>
                      <li>Use the filter to narrow by segment, then bulk-apply limits or presets from this panel.</li>
                    </ul>
                    <div className="mt-2">
                      <button onClick={() => window.dispatchEvent(new CustomEvent('navigate:devices'))} className="px-3 py-2 rounded-xl bg-accent-blue text-white text-sm">Open Devices tab</button>
                    </div>
                  </div>
                )}
                {selectedPreview.length > 8 && <div className="text-xs text-gray-500">+{selectedPreview.length - 8} more selected devices</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
