import React from 'react';
import { ShieldCheck, Wifi, LayoutDashboard, History, Bot, Network, Settings, Layers } from 'lucide-react';
const primaryItems = [
  { name: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
  { name: 'Devices', icon: Wifi, tab: 'devices' },
];

const extraItems = [
  { name: 'Threat Vault', icon: Bot, tab: 'threats', section: 'Overview' },
  { name: 'Network Map', icon: Network, tab: 'topology', section: 'Network' },
  { name: 'Audit Logs', icon: History, tab: 'logs', section: 'Network' },
  { name: 'Segmentation', icon: Layers, tab: 'segmentation', section: 'Control' },
  { name: 'Administration', icon: Settings, tab: 'admin', section: 'Control' },
];

// Render extra navigation items directly to improve discoverability

const Sidebar = ({
  activeTab,
  setActiveTab,
  threatCount = 0,
  deviceCount = 0,
  deviceSegmentFilters = [],
  deviceSegmentFilter = 'all',
  setDeviceSegmentFilter = () => {},
  mobileOpen = false,
  onCloseMobile,
  hotspotActive = true,
}) => {
  return (
    <div
      className={[
        'w-60 bg-card h-full flex flex-col border-r border-gray-800/50 p-4 sm:p-5 overflow-y-auto',
        'fixed md:static top-0 left-0 z-40 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
      role="navigation"
      aria-label="Main sidebar navigation"
    >
      {/* Close button for mobile */}
      {mobileOpen && (
        <div className="md:hidden absolute top-3 right-3">
          <button
            aria-label="Close sidebar"
            onClick={() => onCloseMobile && onCloseMobile()}
            className="px-3 py-2 rounded-lg bg-gray-900/50 text-gray-200"
          >
            Close
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 sm:gap-3 mb-6 sm:mb-8">
        <div className="shrink-0 p-2.5 bg-accent-green/20 rounded-xl text-accent-green border border-accent-green/30" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.06)' }}>
          <ShieldCheck size={28} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] sm:text-xl font-extrabold tracking-[-0.02em] leading-tight text-white whitespace-nowrap">ZeroTrust IoT Gateway</h2>
          <span className="block text-[11px] sm:text-xs text-gray-500 tracking-wide mt-1 whitespace-nowrap">Network Control Center</span>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-gray-800/60 bg-gray-950/40 p-3 sm:p-4">
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.32em] text-gray-500">Live overview</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-gray-900/50 border border-gray-800/80 px-3 py-2">
            <div className="text-gray-500 text-[11px]">Devices</div>
            <div className="font-semibold text-gray-100">{deviceCount}</div>
          </div>
          <div className="rounded-xl bg-gray-900/50 border border-gray-800/80 px-3 py-2">
            <div className="text-gray-500 text-[11px]">Threats</div>
            <div className="font-semibold text-red-300">{threatCount}</div>
          </div>
        </div>
      </div>

      <nav className="space-y-4 sm:space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-gray-500">
            <Layers size={12} />
            <span>Overview</span>
          </div>
          <div className="space-y-2">
            {primaryItems.map((item) => {
              const isActive = activeTab === item.tab;
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    setActiveTab(item.tab);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-colors relative border ${
                    isActive
                      ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                      : 'text-gray-300 border-transparent hover:text-white hover:bg-gray-900/30 hover:border-gray-800/60'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-gray-500">
            <Layers size={12} />
            <span>More</span>
          </div>
          <div className="space-y-2">
            {extraItems.map((item) => {
              const isActive = activeTab === item.tab;
              const Icon = item.icon;
              const disabled = (item.tab === 'topology' || item.tab === 'admin') && !hotspotActive;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    if (disabled) return;
                    setActiveTab(item.tab);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title={disabled ? 'Connect hotspot to enable' : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={disabled ? 'true' : undefined}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-colors relative border ${
                    isActive
                      ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                      : disabled
                        ? 'text-gray-600 bg-gray-900/10 border-gray-800/30 cursor-not-allowed'
                        : 'text-gray-300 border-transparent hover:text-white hover:bg-gray-900/30 hover:border-gray-800/60'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{item.name}</span>
                  {item.tab === 'threats' && threatCount > 0 && (
                    <span className="ml-auto bg-accent-red text-white text-[10px] px-2 py-1 rounded-full">{threatCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {deviceSegmentFilters && deviceSegmentFilters.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-gray-500">
            <Layers size={12} />
            <span>Segments</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {deviceSegmentFilters.slice(0, 10).map((f) => (
              <button
                key={f.key}
                onClick={() => setDeviceSegmentFilter(f.key)}
                className={`px-3 py-1 rounded-full text-[11px] border ${deviceSegmentFilter === f.key ? 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue' : 'bg-gray-900/30 border-gray-800/60 text-gray-300 hover:bg-gray-900/50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-5 sm:pt-6 border-t border-gray-800/40">
        <p className="text-xs text-gray-500 text-center">ZeroTrust IoT Gateway</p>
        <p className="text-xs text-gray-600 text-center mt-1">v1.0</p>
      </div>
    </div>
  );
};

export default Sidebar;
