import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Wifi, LayoutDashboard, History, Bot, Network } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
  { name: 'Devices', icon: Wifi, tab: 'devices' },
  { name: 'Threat Vault', icon: Bot, tab: 'threats' },
  { name: 'Network Map', icon: Network, tab: 'topology' },
  { name: 'Audit Logs', icon: History, tab: 'logs' },
];

const Sidebar = ({
  activeTab,
  setActiveTab,
  threatCount = 0,
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
      <div className="flex items-center gap-3 mb-16">
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

      <nav className="flex-1 space-y-3">
        {navItems.map((item) => {
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
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all relative ${
                isActive
                  ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                  : 'text-gray-400 hover:text-white'
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
      </nav>
    </motion.div>
  );
};

export default Sidebar;
