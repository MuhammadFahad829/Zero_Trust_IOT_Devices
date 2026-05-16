import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Wifi, LayoutDashboard, History, Bot, Network, Settings, Layers, Shield } from 'lucide-react';

const navSections = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
      { name: 'Devices', icon: Wifi, tab: 'devices' },
      { name: 'Threat Vault', icon: Bot, tab: 'threats' },
    ],
  },
  {
    label: 'Network',
    items: [
      { name: 'Network Map', icon: Network, tab: 'topology' },
      { name: 'Audit Logs', icon: History, tab: 'logs' },
    ],
  },
  {
    label: 'Control',
    items: [
      { name: 'Administration', icon: Settings, tab: 'admin' },
    ],
  },
];

const Sidebar = ({
  activeTab,
  setActiveTab,
  threatCount = 0,
  deviceCount = 0,
  mobileOpen = false,
  onCloseMobile,
}) => {
  return (
    <motion.div
      initial={{ x: -120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={[
        'w-64 bg-card h-full flex flex-col border-r border-gray-800/50 p-6',
        'fixed md:static top-0 left-0 z-40 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 mb-10">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="p-2 bg-accent-green/20 rounded-xl text-accent-green border border-accent-green/30 shadow-[0_0_15px_rgba(34,197,94,0.2)] sentinel-breathe"
        >
          <ShieldCheck size={28} />
        </motion.div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Sentinel.ai</h2>
          <span className="text-xs text-gray-500">Autonomous Security</span>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-800/60 bg-gray-950/40 p-4">
        <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Live overview</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
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

      <nav className="space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-gray-500">
              {section.label === 'Overview' ? <Layers size={12} /> : section.label === 'Network' ? <Network size={12} /> : <Shield size={12} />}
              <span>{section.label}</span>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => {
                const isActive = activeTab === item.tab;
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.tab}
                    onClick={() => {
                      setActiveTab(item.tab);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    whileHover={{ x: 5, transition: { duration: 0.1 } }}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all relative border ${
                      isActive
                        ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                        : 'text-gray-400 border-transparent hover:text-white hover:bg-gray-900/40 hover:border-gray-800/60'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.name}</span>
                    {item.tab === 'threats' && threatCount > 0 && (
                      <span className="ml-auto bg-accent-red text-white text-[10px] px-2 py-1 rounded-full">{threatCount}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-gray-800/40">
        <p className="text-xs text-gray-500 text-center">Zero-Trust IoT Gateway</p>
        <p className="text-xs text-gray-600 text-center mt-1">v1.0</p>
      </div>
    </motion.div>
  );
};

export default Sidebar;
