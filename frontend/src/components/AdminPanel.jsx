import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Shield, AlertCircle, CheckCircle, Lock } from 'lucide-react';

export default function AdminPanel({ hotspotActive = true }) {
  const [provOpen, setProvOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [provLoading, setProvLoading] = useState(false);
  const [provResult, setProvResult] = useState(null);
  const [vlanPreview, setVlanPreview] = useState(null);
  const [segmentPreview, setSegmentPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyVlan, setApplyVlan] = useState(true);
  const [applyDns, setApplyDns] = useState(true);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenStatus, setTokenStatus] = useState('not-set');
  const [segmentsInfo, setSegmentsInfo] = useState(null);
  const [applyingSegments, setApplyingSegments] = useState(false);
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [segmentQuery, setSegmentQuery] = useState('');
  const [policiesText, setPoliciesText] = useState('');
  const [savingPolicies, setSavingPolicies] = useState(false);

  const segmentList = segmentsInfo?.segment_scaffold?.segments || segmentsInfo?.policies?.segments || [];
  const assignedSegments = segmentsInfo?.segment_scaffold?.assigned_segments || [];
  const unassignedDevices = segmentsInfo?.segment_scaffold?.unassigned_devices || [];
  const vlanPreviewItems = segmentsInfo?.segment_scaffold?.vlan_preview || [];

  useEffect(() => {
    const saved = localStorage.getItem('PROVISION_TOKEN');
    setTokenStatus(saved ? 'set' : 'not-set');
    // fetch segments info
    (async () => {
      try {
        const res = await fetch('http://localhost:8000/segments');
        const json = await res.json();
        setSegmentsInfo(json);
        // also fetch policies source
        try {
          const p = await fetch('http://localhost:8000/policies');
          const pj = await p.json();
          setPoliciesText(JSON.stringify(pj.policies || pj || {}, null, 2));
        } catch (e) {}
        } catch (e) {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (segmentsInfo && segmentsInfo.policies && segmentsInfo.policies.segments) {
      const names = (segmentsInfo.policies.segments || []).map((s) => s.name).filter(Boolean);
      setSelectedSegments(new Set(names));
    }
  }, [segmentsInfo]);

  const validatePoliciesJSON = (text) => {
    try {
      JSON.parse(text || '{}');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };

  const formatPoliciesJSON = () => {
    try {
      const parsed = JSON.parse(policiesText || '{}');
      setPoliciesText(JSON.stringify(parsed, null, 2));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };

  const handleProvisioning = async () => {
    if (!applyVlan && !applyDns) return;
    setProvLoading(true);
    setProvResult(null);
    try {
      const token = localStorage.getItem('PROVISION_TOKEN') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body = { apply_vlan: applyVlan, apply_dns: applyDns, segments: Array.from(selectedSegments || []) };
      const res = await fetch('http://localhost:8000/provision', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setProvResult({ ok: true, data: json });
      console.log('provision result', json);
      try {
        window.dispatchEvent(new Event('provision:complete'));
      } catch (e) {
        // ignore
      }
    } catch (err) {
      setProvResult({ ok: false, error: String(err) });
    } finally {
      setProvLoading(false);
    }
  };

  const handleTokenSave = () => {
    if (tokenInput.trim() === '') {
      localStorage.removeItem('PROVISION_TOKEN');
      setTokenStatus('not-set');
    } else {
      localStorage.setItem('PROVISION_TOKEN', tokenInput.trim());
      setTokenStatus('set');
    }
    setTokenOpen(false);
    setTokenInput('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto"
    >
      <div className="mb-8 card-soft border border-blue-500/20 bg-blue-950/10 p-5 md:p-6 rounded-2xl shadow-[0_18px_50px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-blue/20 rounded-xl text-accent-blue border border-blue-500/15">
              <Settings size={28} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-blue-300/80 mb-1">Control center</p>
              <h1 className="text-3xl font-bold text-gray-100">Administration</h1>
              <p className="text-sm text-gray-400">Manage provisioning and token security from one place</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-300">
            <span className="px-3 py-1 rounded-full border border-gray-700 bg-gray-900/40">VLAN provisioning</span>
            <span className="px-3 py-1 rounded-full border border-gray-700 bg-gray-900/40">dnsmasq DHCP</span>
            <span className="px-3 py-1 rounded-full border border-gray-700 bg-gray-900/40">Token guarded</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Segments Card */}
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-2xl border border-gray-800/60 bg-gray-900/20 p-5 md:p-6 shadow transition"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                <Shield size={24} className="text-accent-blue" />
                Segmentation
              </h2>
              <p className="text-xs text-gray-500 mt-1">View and apply network segment policies</p>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] border border-blue-500/20 text-blue-300 bg-blue-950/20">Network</span>
          </div>

          <div className="bg-gray-800/40 border border-gray-700/40 rounded-2xl p-4 mb-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              Segments are defined in <code className="text-accent-blue text-xs">backend/policies.json</code>. You can view assigned segments and force re-apply iptables rules.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Segments</div>
              <div className="text-2xl font-bold text-white mt-1">{segmentList.length}</div>
              <div className="text-xs text-gray-400">from scaffold preview</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Assigned</div>
              <div className="text-2xl font-bold text-white mt-1">{assignedSegments.length}</div>
              <div className="text-xs text-gray-400">with devices mapped</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/30 p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Unassigned</div>
              <div className="text-2xl font-bold text-white mt-1">{unassignedDevices.length}</div>
              <div className="text-xs text-gray-400">devices awaiting segment</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">Assigned segments</div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={segmentQuery}
                  onChange={(e) => setSegmentQuery(e.target.value)}
                  placeholder="Search segments"
                  className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 w-48"
                  aria-label="Search segments"
                />
                <button type="button" onClick={() => {
                  // select all visible
                  const list = (segmentsInfo && segmentsInfo.policies && segmentsInfo.policies.segments) || [];
                  const filtered = list.filter((s) => s.name.toLowerCase().includes((segmentQuery||'').toLowerCase()) || (s.cidr||'').includes(segmentQuery||''));
                  const next = new Set(selectedSegments);
                  filtered.forEach((s) => next.add(s.name));
                  setSelectedSegments(next);
                }} className="btn btn-ghost text-xs">Select visible</button>
                <button type="button" onClick={() => setSelectedSegments(new Set())} className="btn btn-ghost text-xs">Clear</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(segmentsInfo && segmentsInfo.policies && segmentsInfo.policies.segments && segmentsInfo.policies.segments.length) ? (
                segmentsInfo.policies.segments
                  .filter((seg) => {
                    if (!segmentQuery || segmentQuery.trim() === '') return true;
                    const q = segmentQuery.toLowerCase();
                    return (seg.name || '').toLowerCase().includes(q) || ((seg.cidr||'').toLowerCase().includes(q));
                  })
                  .map((seg) => (
                    <label key={seg.name} className="inline-flex items-center gap-2 px-2 py-1.5 rounded-full border border-gray-700 bg-gray-900/30 text-xs text-gray-200 cursor-pointer">
                      <input type="checkbox" checked={selectedSegments.has(seg.name)} onChange={(e) => {
                        const next = new Set(selectedSegments);
                        if (e.target.checked) next.add(seg.name); else next.delete(seg.name);
                        setSelectedSegments(next);
                      }} className="w-4 h-4" aria-label={`Select segment ${seg.name}`} />
                      <span className="font-medium">{seg.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{seg.cidr || ''}</span>
                    </label>
                  ))
              ) : (
                <span className="text-xs text-gray-500">No segments defined in policies.json</span>
              )}
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-gray-700/50 bg-gray-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-gray-400">VLAN / policy scaffold</div>
                <div className="text-sm font-semibold text-gray-100">Preview generated from `/segments`</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setPreviewLoading(true);
                  try {
                    const res = await fetch('http://localhost:8000/segments/preview');
                    const json = await res.json();
                    setSegmentPreview(json);
                  } catch (e) {
                    setSegmentPreview({ error: String(e) });
                  } finally {
                    setPreviewLoading(false);
                  }
                }}
                className="btn btn-ghost text-xs"
              >
                {previewLoading ? 'Loading...' : 'Refresh preview'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-300 mb-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                <div className="text-gray-500 mb-1">Device mapping</div>
                <div className="font-medium text-gray-100">{segmentList.length ? segmentList.map((seg) => `${seg.name || 'unknown'} · ${seg.device_count ?? 0}`).join(' | ') : 'No scaffold data yet'}</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                <div className="text-gray-500 mb-1">VLAN preview</div>
                <div className="font-medium text-gray-100">{Array.isArray(vlanPreviewItems) && vlanPreviewItems.length ? vlanPreviewItems.map((item) => `${item.name || item.segment || 'segment'}:${item.vlan_id ?? '—'}`).join(' | ') : 'No VLAN preview yet'}</div>
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
              {segmentList.length > 0 ? segmentList.map((seg) => (
                <div key={seg.name} className="rounded-xl border border-gray-800 bg-gray-900/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{seg.name || 'Unnamed segment'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {seg.cidr || 'No CIDR'} · VLAN {seg.vlan_id ?? '—'} · {seg.iface || 'no iface'}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <div>{seg.device_count ?? 0} devices</div>
                      <div>{seg.limit_mbps ?? '—'} Mbps</div>
                    </div>
                  </div>
                  {Array.isArray(seg.device_ips) && seg.device_ips.length > 0 && (
                    <div className="mt-2 text-[11px] text-gray-400 break-all">{seg.device_ips.join(', ')}</div>
                  )}
                </div>
              )) : (
                <div className="text-xs text-gray-500">No segment scaffold returned yet.</div>
              )}
            </div>

            {segmentPreview && (
              <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                <div className="text-xs text-gray-400 mb-1">Preview response</div>
                <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">{JSON.stringify(segmentPreview, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">Policies (preview)</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => {
                  const res = validatePoliciesJSON(policiesText);
                  if (res.ok) alert('Valid JSON'); else alert('Invalid JSON: ' + res.error);
                }} className="btn btn-ghost text-xs">Validate</button>
                <button type="button" onClick={() => {
                  const res = formatPoliciesJSON();
                  if (!res.ok) alert('Format failed: ' + res.error);
                }} className="btn btn-ghost text-xs">Format</button>
              </div>
            </div>
            <div className="mb-2">
              <textarea aria-label="Policies JSON editor" value={policiesText} onChange={(e) => setPoliciesText(e.target.value)} className="w-full h-40 text-xs p-2 font-mono bg-gray-800 border border-gray-700 rounded text-gray-200" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={async () => {
                setApplyingSegments(true);
                try {
                  // call apply segments endpoint which rebuilds iptables from DB
                  await fetch('http://localhost:8000/segments/apply', { method: 'POST' });
                } catch (e) {}
                setApplyingSegments(false);
              }}
              disabled={!hotspotActive}
              className="btn btn-primary disabled:opacity-50"
              title={!hotspotActive ? 'Connect hotspot to apply segment policies' : undefined}
            >
              {applyingSegments ? 'Applying...' : 'Apply Segment Policies'}
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('http://localhost:8000/segments');
                  const json = await res.json();
                  setSegmentsInfo(json);
                  try {
                    const p = await fetch('http://localhost:8000/policies');
                    const pj = await p.json();
                    setPoliciesText(JSON.stringify(pj.policies || pj || {}, null, 2));
                  } catch (e) {}
                } catch (e) {}
              }}
              className="btn btn-ghost"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-400">Selected segments will be used for provisioning when you click <strong>Start Provisioning</strong>.</div>
          <div className="mt-3 flex items-center gap-2 justify-end">
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const v = validatePoliciesJSON(policiesText);
                  if (!v.ok) { alert('Invalid JSON: ' + v.error); return; }
                  setSavingPolicies(true);
                  try {
                    const token = localStorage.getItem('PROVISION_TOKEN') || '';
                    const headers = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                    const res = await fetch('http://localhost:8000/policies', { method: 'POST', headers, body: policiesText });
                    const j = await res.json();
                    if (j.status === 'ok') {
                      alert('Policies saved');
                    } else {
                      alert('Save failed: ' + (j.error || JSON.stringify(j)));
                    }
                  } catch (e) {
                    alert('Save error: ' + e);
                  } finally {
                    setSavingPolicies(false);
                  }
                }}
                disabled={!hotspotActive}
                className="btn btn-success disabled:opacity-50"
                title={!hotspotActive ? 'Connect hotspot to save policies' : undefined}
              >
                {savingPolicies ? 'Saving...' : 'Save Policies'}
              </button>
              <button onClick={() => { setPoliciesText('{}'); }} className="btn btn-ghost text-xs">Clear</button>
            </div>
          </div>
        </motion.div>

        {/* Provisioning Card */}
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-2xl border border-gray-800/60 bg-gray-900/20 p-5 md:p-6 shadow transition"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                <Shield size={24} className="text-accent-blue" />
                Network Provisioning
              </h2>
              <p className="text-xs text-gray-500 mt-1">Create VLANs and DHCP rules for your device segments</p>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] border border-blue-500/20 text-blue-300 bg-blue-950/20">Primary action</span>
          </div>

          <div className="bg-gray-800/40 border border-gray-700/40 rounded-2xl p-4 mb-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              Automatically create VLAN interfaces (eth0.100, eth0.200, etc.), network bridges, and configure dnsmasq DHCP servers for each segment. System will prompt for sudo password.
            </p>
          </div>

          <div className="space-y-3 mb-4">
            <label className={`flex items-center gap-3 ${!hotspotActive ? 'opacity-60' : 'cursor-pointer'} group`}>
              <input
                type="checkbox"
                checked={applyVlan}
                onChange={(e) => setApplyVlan(e.target.checked)}
                className="w-5 h-5 cursor-pointer accent-accent-blue rounded"
                disabled={!hotspotActive}
              />
              <span className="text-sm text-gray-200 group-hover:text-white transition">
                <strong>Create VLAN interfaces</strong>
                <p className="text-xs text-gray-400">eth0.100, eth0.200, bridges, etc.</p>
              </span>
            </label>
            <label className={`flex items-center gap-3 ${!hotspotActive ? 'opacity-60' : 'cursor-pointer'} group`}>
              <input
                type="checkbox"
                checked={applyDns}
                onChange={(e) => setApplyDns(e.target.checked)}
                className="w-5 h-5 cursor-pointer accent-accent-green rounded"
                disabled={!hotspotActive}
              />
              <span className="text-sm text-gray-200 group-hover:text-white transition">
                <strong>Configure dnsmasq DHCP</strong>
                <p className="text-xs text-gray-400">Assign IPs per VLAN segment</p>
              </span>
            </label>
          </div>

          {!applyVlan && !applyDns && (
            <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700/30 rounded-lg p-3 mb-4">
              <AlertCircle size={16} className="text-yellow-400" />
              <p className="text-xs text-yellow-200">Select at least one option</p>
            </div>
          )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-gray-500">A confirmation dialog will appear before any system changes.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setPreviewLoading(true);
                    setVlanPreview(null);
                    try {
                      const token = localStorage.getItem('PROVISION_TOKEN') || '';
                      const headers = { 'Content-Type': 'application/json' };
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      const body = { segments: Array.from(selectedSegments || []) };
                      const res = await fetch('http://localhost:8000/provision/preview', { method: 'POST', headers, body: JSON.stringify(body) });
                      const j = await res.json();
                      setVlanPreview(j);
                    } catch (e) {
                      setVlanPreview({ status: 'error', error: String(e) });
                    } finally {
                      setPreviewLoading(false);
                    }
                  }}
                  disabled={!hotspotActive}
                  className="btn btn-ghost disabled:opacity-50"
                  title="Preview VLAN commands for selected segments"
                >
                  Preview VLANs
                </button>

                <button
                  onClick={async () => {
                    setPreviewLoading(true);
                    setSegmentPreview(null);
                    try {
                      const token = localStorage.getItem('PROVISION_TOKEN') || '';
                      const headers = { 'Content-Type': 'application/json' };
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      const body = { segments: Array.from(selectedSegments || []) };
                      const res = await fetch('http://localhost:8000/segments/preview', { method: 'POST', headers, body: JSON.stringify(body) });
                      const j = await res.json();
                      setSegmentPreview(j);
                    } catch (e) {
                      setSegmentPreview({ status: 'error', error: String(e) });
                    } finally {
                      setPreviewLoading(false);
                    }
                  }}
                  disabled={!hotspotActive}
                  className="btn btn-ghost disabled:opacity-50"
                  title="Preview iptables segment rules"
                >
                  Preview Segment Rules
                </button>

                <button
                  onClick={() => setProvOpen(true)}
                  disabled={!hotspotActive || (!applyVlan && !applyDns)}
                  title={!hotspotActive ? 'Connect hotspot to enable provisioning' : undefined}
                  className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {provLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    '⚙️'
                  )}
                  {provLoading ? 'Provisioning...' : 'Start Provisioning'}
                </button>
              </div>
          </div>

          {provResult && (
            <div className={`mt-4 p-4 rounded-lg border ${provResult.ok ? 'bg-green-900/20 border-green-700/40' : 'bg-red-900/20 border-red-700/40'}`}>
              <div className="flex items-center gap-2 mb-2">
                {provResult.ok ? (
                  <CheckCircle size={18} className="text-green-400" />
                ) : (
                  <AlertCircle size={18} className="text-red-400" />
                )}
                <p className={`text-sm font-semibold ${provResult.ok ? 'text-green-300' : 'text-red-300'}`}>
                  {provResult.ok ? '✓ Success' : '✗ Failed'}
                </p>
              </div>
              <pre className="text-xs text-gray-300 bg-gray-800/50 rounded p-2 overflow-auto max-h-40 font-mono">
                {JSON.stringify(provResult.data || provResult.error, null, 2)}
              </pre>
            </div>
          )}
          {/* Previews */}
          {(vlanPreview || segmentPreview) && (
            <div className="mt-4 p-3 rounded-lg bg-gray-800/40 border border-gray-700/40">
              {previewLoading && <div className="text-xs text-gray-400 mb-2">Loading preview...</div>}
              {vlanPreview && (
                <div className="mb-3">
                  <div className="text-sm font-semibold text-gray-200 mb-1">VLAN Preview</div>
                  <pre className="text-xs text-gray-300 bg-gray-900/40 rounded p-2 overflow-auto max-h-40 font-mono">{vlanPreview.vlan_preview || JSON.stringify(vlanPreview, null, 2)}</pre>
                </div>
              )}
              {segmentPreview && (
                <div>
                  <div className="text-sm font-semibold text-gray-200 mb-1">Segment Rules Preview</div>
                  <pre className="text-xs text-gray-300 bg-gray-900/40 rounded p-2 overflow-auto max-h-40 font-mono">{Array.isArray(segmentPreview.commands) ? segmentPreview.commands.join('\n') : JSON.stringify(segmentPreview, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Security Token Card */}
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-2xl border border-gray-800/60 bg-gray-900/20 p-5 md:p-6 shadow transition"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                <Key size={24} className="text-accent-green" />
                Security Token
              </h2>
              <p className="text-xs text-gray-500 mt-1">Protect provisioning endpoints</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${
              tokenStatus === 'set'
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-gray-800 text-gray-400'
            }`}>
              {tokenStatus === 'set' ? '✓ Active' : '○ Not Set'}
            </span>
          </div>

          <div className="bg-gray-800/40 border border-gray-700/40 rounded-2xl p-4 mb-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              Set a security token to authorize provisioning requests. This token will be validated against the backend <code className="text-accent-blue text-xs">PROVISION_TOKEN</code> environment variable.
            </p>
          </div>

            <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">Current Status</label>
              <div className="flex items-center gap-2">
                {tokenStatus === 'set' ? (
                  <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-accent-green/10 border border-accent-green/30">
                    <Lock size={16} className="text-accent-green" />
                    <span className="text-sm text-accent-green">Token is configured</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
                    <AlertCircle size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-400">No token set</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">Example Token</label>
              <code className="block text-xs bg-gray-800 border border-gray-700 rounded px-3 py-2 text-accent-blue overflow-auto">
                admin-secret-2025
              </code>
            </div>
          </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-gray-500">Keep this token in sync with the backend environment variable.</p>
            <button
              onClick={() => {
                setTokenInput(localStorage.getItem('PROVISION_TOKEN') || '');
                setTokenOpen(true);
              }}
              className="btn btn-success"
              disabled={!hotspotActive}
              title={!hotspotActive ? 'Connect hotspot to manage token' : undefined}
            >
              🔐 Manage Token
            </button>
          </div>
        </motion.div>
      </div>

      {/* Token Modal */}
      {tokenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setTokenOpen(false)} />
          <div className="bg-gray-900 rounded-2xl p-6 z-60 w-11/12 max-w-sm border border-gray-800/60 shadow-lg">
            <h3 className="text-xl font-bold text-gray-100 mb-1">Security Token Settings</h3>
            <p className="text-xs text-gray-500 mb-4">Configure authentication token for provisioning</p>

            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-300 leading-relaxed">
                Your token will be stored locally in browser localStorage. It must match the backend <code className="text-accent-blue">PROVISION_TOKEN</code> environment variable to authorize requests.
              </p>
            </div>

            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter security token (leave blank to clear)"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 text-sm mb-4 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20 transition"
            />

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setTokenOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleTokenSave}
                className="btn btn-success"
                disabled={!hotspotActive}
                title={!hotspotActive ? 'Connect hotspot to save token' : undefined}
              >
                ✓ Save Token
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {provOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => (provLoading ? null : setProvOpen(false))} />
          <div className="bg-gray-900 rounded-2xl p-6 z-60 w-11/12 max-w-sm border border-gray-800/60 shadow-lg">
            <h3 className="text-lg font-bold text-gray-100 mb-2">Confirm Provisioning</h3>
            <p className="text-sm text-gray-400 mb-4">Review your settings before starting provisioning</p>

            <div className="space-y-2 mb-4 bg-gray-800/30 border border-gray-700/30 rounded-lg p-3">
              {applyVlan && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle size={16} className="text-accent-blue" />
                  <span className="text-gray-300">Create VLAN interfaces</span>
                </div>
              )}
              {applyDns && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle size={16} className="text-accent-green" />
                  <span className="text-gray-300">Configure dnsmasq DHCP</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setProvOpen(false)}
                disabled={provLoading}
                className="btn btn-ghost disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleProvisioning();
                  setProvOpen(false);
                }}
                disabled={provLoading || !hotspotActive}
                title={!hotspotActive ? 'Connect hotspot to start provisioning' : undefined}
                className="btn btn-primary disabled:opacity-50 flex items-center gap-2"
              >
                {provLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  '▶ Start Provisioning'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
