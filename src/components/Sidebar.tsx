import React from 'react';
import {
  LayoutDashboard,
  Cpu,
  BarChart3,
  Bell,
  ShieldCheck,
  Server,
  Activity,
  Layers,
  Radio,
  Users,
  Wifi,
  Map,
  HelpCircle,
  Database,
  GitBranch,
  ExternalLink,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();

  const isCustomer = user?.role === 'customer';

  const customerMenuItems = [
    {
      id: 'dashboard',
      label: 'Özel Dashboard\'um',
      icon: LayoutDashboard,
      badge: 'Canlı',
    },
    {
      id: 'devices',
      label: 'Cihazlarım & Sensör Verileri',
      icon: Cpu,
    },
    {
      id: 'network_discovery',
      label: 'Ağdaki Cihazlar & Tarayıcı',
      icon: Wifi,
    },
    {
      id: 'notifications',
      label: 'Bildirimler & Alarmlar',
      icon: Bell,
    },
    {
      id: 'account_settings',
      label: 'Hesap & Şifre Ayarları',
      icon: UserCog,
    },
    {
      id: 'help',
      label: 'Yardım & Bilgi Merkezi',
      icon: HelpCircle,
      badge: 'Destek',
    },
  ];

  const adminMenuItems = [
    {
      section: 'MÜŞTERİ & SAHA YÖNETİMİ',
      items: [
        {
          id: 'customers',
          label: 'Müşteri Yönetimi',
          icon: Users,
          badge: 'Admin',
        },
        {
          id: 'devices',
          label: 'Tüm Saha Cihazları',
          icon: Cpu,
        },
        {
          id: 'network_discovery',
          label: 'Ağdaki Cihazlar & Tarayıcı',
          icon: Wifi,
          badge: 'Ağ',
        },
        {
          id: 'dashboard',
          label: 'Canlı İzleme Dashboard',
          icon: LayoutDashboard,
          badge: 'Canlı',
        },
      ],
    },
    {
      section: 'SİSTEM & GÜVENLİK',
      items: [
        {
          id: 'generator',
          label: 'Sanal Veri Üreteci',
          icon: Radio,
          badge: 'Admin',
        },
        {
          id: 'analytics',
          label: 'Veri Analizi & Export',
          icon: BarChart3,
        },
        {
          id: 'notifications',
          label: 'Bildirimler & Alarmlar',
          icon: Bell,
        },
        {
          id: 'database_data',
          label: 'PostgreSQL & Veritabanı',
          icon: Database,
          badge: 'Postgres',
        },
        {
          id: 'deployment',
          label: 'Sunucu Kurulum Rehberi',
          icon: Server,
        },
        {
          id: 'security',
          label: 'Güvenlik & Audit Logları',
          icon: ShieldCheck,
        },
        {
          id: 'account_settings',
          label: 'Hesap & Profil Ayarları',
          icon: UserCog,
        },
        {
          id: 'help',
          label: 'Yardım & Bilgi Merkezi',
          icon: HelpCircle,
          badge: 'Sözlük',
        },
      ],
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-h-screen border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden md:flex transition-colors">
      {/* Brand & Logo Header */}
      <div>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-lg text-sm ${
            isCustomer ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-indigo-600 shadow-indigo-600/20'
          }`}>
            {isCustomer ? 'M' : 'NX'}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-tight truncate">
              {isCustomer ? (user?.companyName || user?.name) : 'NexusNode IoT'}
            </h1>
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider mt-0.5 ${
              isCustomer ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
            }`}>
              {isCustomer ? 'Müşteri Portalı' : 'Sistem Yönetimi'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-3 space-y-4">
          {isCustomer ? (
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                MÜŞTERİ MENÜSÜ
              </p>
              {customerMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all text-xs font-medium cursor-pointer ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 font-bold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded border border-emerald-500/20">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            adminMenuItems.map((group, idx) => (
              <div key={idx} className="space-y-1">
                <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                  {group.section}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl transition-all text-xs font-medium cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-bold shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-500/20">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>
      </div>

      {/* Footer / Version & GitHub Release Notes */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0b1120]">
        <a
          href="https://github.com/ozkan-1403/iot-telemetry-platform/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="group block p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/70 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer"
          title="GitHub Sürüm Notları & Değişiklik Günlüğü (Changelog)"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                v1.2.1
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider">
              GitHub
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            <span className="truncate">Sürüm Detayları & Notlar</span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 ml-1" />
          </div>
        </a>
      </div>
    </aside>
  );
};
