import React from 'react';
import {
  LayoutDashboard,
  Activity,
  Cpu,
  BarChart3,
  Bell,
  ShieldCheck,
  Server,
  Radio,
  Users,
  Wifi,
  HelpCircle,
  Database,
  GitBranch,
  ExternalLink,
  UserCog,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRoleBadgeInfo } from '../lib/permissions';
import { NexusNodeLogo } from './NexusNodeLogo';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();

  const role = user?.role || 'customer';
  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const isAnalyst = role === 'analyst';
  const isCustomer = role === 'customer';

  const customerMenuItems = [
    {
      id: 'dashboard',
      label: "Özel Dashboard'um",
      icon: LayoutDashboard,
    },
    {
      id: 'devices',
      label: 'Cihazlarım & Sensör Verileri',
      icon: Cpu,
    },
    {
      id: 'automations',
      label: 'Otomasyon & Senaryolar',
      icon: Activity,
    },
    {
      id: 'device_health',
      label: 'Cihaz Sağlığı',
      icon: ShieldCheck,
    },
    {
      id: 'network_discovery',
      label: 'Cihaz Keşfi ve Eşleştirme',
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
    },
  ];

  const operatorMenuGroups = [
    {
      section: 'SAHA & OPERASYON',
      items: [
        {
          id: 'dashboard',
          label: 'Operasyon Dashboard',
          icon: LayoutDashboard,
        },
        {
          id: 'devices',
          label: 'Saha Cihazları & Kontrol',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },
        {
          id: 'device_health',
          label: 'Cihaz Sağlığı',
          icon: ShieldCheck,
        },
        {
          id: 'firmware_ota',
          label: 'Firmware & OTA Durumu',
          icon: HardDrive,
        },
        {
          id: 'network_discovery',
          label: 'Cihaz Keşfi ve Eşleştirme',
          icon: Wifi,
        },
      ],
    },
    {
      section: 'ANALİZ & DESTEK',
      items: [
        {
          id: 'analytics',
          label: 'Veri Analizi & Raporlar',
          icon: BarChart3,
        },
        {
          id: 'notifications',
          label: 'Bildirimler & Alarmlar',
          icon: Bell,
        },
        {
          id: 'account_settings',
          label: 'Hesap Ayarları',
          icon: UserCog,
        },
        {
          id: 'help',
          label: 'Yardım & Bilgi Merkezi',
          icon: HelpCircle,
        },
      ],
    },
  ];

  const analystMenuGroups = [
    {
      section: 'VERİ & ANALİZ',
      items: [
        {
          id: 'dashboard',
          label: 'Analiz Dashboard',
          icon: LayoutDashboard,
        },
        {
          id: 'analytics',
          label: 'Veri Analizi & Export',
          icon: BarChart3,
        },
        {
          id: 'devices',
          label: 'Sensör Verileri & İzleme',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },
        {
          id: 'device_health',
          label: 'Cihaz Sağlığı',
          icon: ShieldCheck,
        },
        {
          id: 'network_discovery',
          label: 'Ağ Keşif İzleme',
          icon: Wifi,
        },
      ],
    },
    {
      section: 'SİSTEM & DESTEK',
      items: [
        {
          id: 'notifications',
          label: 'Bildirimler & Alarmlar',
          icon: Bell,
        },
        {
          id: 'account_settings',
          label: 'Hesap Ayarları',
          icon: UserCog,
        },
        {
          id: 'help',
          label: 'Yardım & Bilgi Merkezi',
          icon: HelpCircle,
        },
      ],
    },
  ];

  const adminMenuGroups = [
    {
      section: 'MÜŞTERİ & SAHA YÖNETİMİ',
      items: [
        {
          id: 'dashboard',
          label: 'Canlı İzleme Dashboard',
          icon: LayoutDashboard,
        },
        {
          id: 'customers',
          label: 'Müşteri Yönetimi',
          icon: Users,
        },
        {
          id: 'devices',
          label: 'Tüm Saha Cihazları',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },
        {
          id: 'device_health',
          label: 'Cihaz Sağlığı',
          icon: ShieldCheck,
        },
        {
          id: 'firmware_ota',
          label: 'Firmware & OTA Yönetimi',
          icon: HardDrive,
        },
        {
          id: 'network_discovery',
          label: 'Cihaz Keşfi ve Eşleştirme',
          icon: Wifi,
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
        },
      ],
    },
  ];

  const getBrandAvatar = () => {
    if (isCustomer) return { text: 'M', bg: 'bg-emerald-500 shadow-emerald-500/20' };
    if (isOperator) return { text: 'OP', bg: 'bg-amber-500 shadow-amber-500/20' };
    if (isAnalyst) return { text: 'AN', bg: 'bg-sky-500 shadow-sky-500/20' };
    return { text: 'NX', bg: 'bg-indigo-600 shadow-indigo-600/20' };
  };

  const getBrandTitle = () => {
    if (isCustomer) return user?.companyName || user?.name || 'Müşteri Portalı';
    if (isOperator) return 'NexusNode Saha';
    if (isAnalyst) return 'NexusNode Analytics';
    return 'NexusNode IoT';
  };

  const avatarInfo = getBrandAvatar();
  const brandTitle = getBrandTitle();

  const renderNavGroup = (groups: typeof adminMenuGroups, activeThemeClass: string, iconActiveColor: string) => {
    return groups.map((group, idx) => (
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
                  ? activeThemeClass
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? iconActiveColor : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    ));
  };

  return (
    <aside className="w-64 shrink-0 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 h-screen sticky top-0 z-30 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden md:flex transition-colors overflow-y-auto">
      {/* Brand & Logo Header */}
      <div>
        <div className="h-14 sm:h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <NexusNodeLogo
            variant="full"
            size="sm"
            showDomain={true}
            animated={true}
            onClick={() => window.location.reload()}
            className="hover:opacity-85 transition-opacity"
          />
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
                  </button>
                );
              })}
            </div>
          ) : isOperator ? (
            renderNavGroup(
              operatorMenuGroups,
              'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 font-bold shadow-sm',
              'text-amber-600 dark:text-amber-400'
            )
          ) : isAnalyst ? (
            renderNavGroup(
              analystMenuGroups,
              'bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20 font-bold shadow-sm',
              'text-sky-600 dark:text-sky-400'
            )
          ) : (
            renderNavGroup(
              adminMenuGroups,
              'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-bold shadow-sm',
              'text-indigo-600 dark:text-indigo-400'
            )
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
