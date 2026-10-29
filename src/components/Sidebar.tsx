import React, { useState, useEffect, useCallback } from 'react';
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
  UserCog,
  HardDrive,
  Terminal,
  X,
  RefreshCw,
  Monitor,
  Bot,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRoleBadgeInfo } from '../lib/permissions';
import { NexusNodeLogo } from './NexusNodeLogo';
import {
  APP_RELEASE_TAG,
  APP_VERSION,
  GITHUB_RELEASE_TAG,
  GITHUB_VERSION,
  GITHUB_RELEASES_URL,
} from '../config/version';
import { apiFetch } from '../lib/apiFetch';
import { canShowSshControls } from '../lib/sshRuntimePolicy';
import { ADMIN_PLUGINS_TAB } from '../codex/plugin';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const [canShowSsh, setCanShowSsh] = useState(false);
  const [runtimeEnv, setRuntimeEnv] = useState<'vps' | 'aistudio' | 'local'>('local');
  const [githubVersionTag, setGithubVersionTag] = useState<string>(GITHUB_RELEASE_TAG);
  const [githubSyncStatus, setGithubSyncStatus] = useState<'synced' | 'ahead' | 'behind'>(
    APP_VERSION.localeCompare(GITHUB_VERSION, undefined, { numeric: true }) === 0
      ? 'synced'
      : APP_VERSION.localeCompare(GITHUB_VERSION, undefined, { numeric: true }) > 0 ? 'ahead' : 'behind',
  );
  const [isGithubRefreshing, setIsGithubRefreshing] = useState(false);
  const [isRuntimeRefreshing, setIsRuntimeRefreshing] = useState(false);

  const fetchRuntimeInfo = useCallback(async () => {
    setIsRuntimeRefreshing(true);
    try {
      const res = await apiFetch('/api/runtime', { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      if (data) {
        setCanShowSsh(canShowSshControls(data));
        if (data?.isVps || data?.environment === 'vps') {
          setRuntimeEnv('vps');
        } else if (data?.isAiStudio || data?.environment === 'aistudio') {
          setRuntimeEnv('aistudio');
        } else {
          setRuntimeEnv('local');
        }
      }
    } catch {
      setCanShowSsh(false);
    } finally {
      setIsRuntimeRefreshing(false);
    }
  }, []);

  const fetchGithubVersion = useCallback(async () => {
    setIsGithubRefreshing(true);
    try {
      const res = await apiFetch('/api/system/version', { credentials: 'include' });
      const data = res.ok ? await res.json() : null;
      if (data?.github?.releaseTag) {
        setGithubVersionTag(data.github.releaseTag);
      }
      if (data?.github?.syncStatus) setGithubSyncStatus(data.github.syncStatus);
    } catch {
      // silently ignore
    } finally {
      setIsGithubRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRuntimeInfo();
    fetchGithubVersion();
  }, [fetchRuntimeInfo, fetchGithubVersion]);

  const role = user?.role || 'customer';
  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const isAnalyst = role === 'analyst';
  const isCustomer = role === 'customer';

  const customerMenuItems = [
    {
      id: 'dashboard',
      label: 'Canlı İzleme Dashboard',
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
      label: 'Cihaz Sağlığı ve Bakım',
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
          label: 'Cihaz Sağlığı ve Bakım',
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
          id: 'server_status',
          label: 'Sunucu Durumu',
          icon: Activity,
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
          label: 'Cihaz Sağlığı ve Bakım',
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
          id: 'server_status',
          label: 'Sunucu Durumu',
          icon: Activity,
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
          label: 'Cihaz Sağlığı ve Bakım',
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
          id: 'server_status',
          label: 'Sunucu Durumu & Metrikler',
          icon: Activity,
        },
        {
          id: 'database_data',
          label: 'PostgreSQL & Veritabanı',
          icon: Database,
        },
        {
          id: 'security',
          label: 'Güvenlik & Audit Logları',
          icon: ShieldCheck,
        },
        {
          id: 'system_logs',
          label: 'Sistem & Hata Günlükleri',
          icon: Terminal,
        },
        {
          id: ADMIN_PLUGINS_TAB.id,
          label: ADMIN_PLUGINS_TAB.label,
          icon: Bot,
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

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    if (isMobileOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isMobileOpen, onCloseMobile]);

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
              onClick={() => handleSelectTab(item.id)}
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

  const renderContent = (isMobileView = false) => (
    <div className="flex flex-col justify-between h-full min-h-full">
      {/* Brand & Logo Header */}
      <div>
        <div className="h-14 sm:h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <NexusNodeLogo
            variant="full"
            size="sm"
            showDomain={true}
            animated={true}
            onClick={() => {
              if (isMobileView && onCloseMobile) onCloseMobile();
              window.location.reload();
            }}
            className="hover:opacity-85 transition-opacity"
          />
          {isMobileView && (
            <button
              type="button"
              id="mobile-drawer-close-btn"
              onClick={onCloseMobile}
              aria-label="Menüyü Kapat"
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
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
                    onClick={() => handleSelectTab(item.id)}
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

      {/* Footer / Version Cards - Çift Kart */}
      <div className="px-3 pb-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0b1120] shrink-0 space-y-2">
        {canShowSsh && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('nexus_open_ssh_drawer'))}
            className="w-full p-2.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/60 dark:bg-cyan-950/60 dark:hover:bg-cyan-900 border border-cyan-700/40 text-cyan-700 dark:text-cyan-300 transition-all flex items-center justify-between group shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">SSH Bağlantı Tüneli</span>
            </div>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-700 dark:text-cyan-300">
              SOL PANEL
            </span>
          </button>
        )}

        {/* Üst Kart: Çalışan Sistem Sürümü */}
        <button
          type="button"
          id="sidebar-running-version-btn"
          onClick={fetchRuntimeInfo}
          title={`Çalışan Sistem: ${APP_RELEASE_TAG} (${runtimeEnv === 'vps' ? 'VPS Sunucu' : runtimeEnv === 'aistudio' ? 'AI Studio' : 'Yerel Geliştirme'}) — Yenilemek için tıklayın`}
          className="group w-full p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/70 hover:border-indigo-400/70 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                runtimeEnv === 'vps'
                  ? 'bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400'
                  : runtimeEnv === 'aistudio'
                  ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-sky-600 dark:text-sky-400'
              }`}>
                <Monitor className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                  {APP_RELEASE_TAG}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                  {runtimeEnv === 'vps' ? 'VPS Canlı Sunucu' : runtimeEnv === 'aistudio' ? 'AI Studio Cloud' : 'Yerel Geliştirme'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                runtimeEnv === 'vps'
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                  : runtimeEnv === 'aistudio'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
              }`}>
                {runtimeEnv === 'vps' ? 'VPS' : runtimeEnv === 'aistudio' ? 'Cloud' : 'Yerel'}
              </span>
              <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors ${
                isRuntimeRefreshing ? 'animate-spin text-indigo-500' : ''
              }`} />
            </div>
          </div>
        </button>

        {/* Alt Kart: GitHub Depo Sürümü */}
        <a
          href={GITHUB_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          id="sidebar-github-version-link"
          onClick={(e) => { e.preventDefault(); fetchGithubVersion(); window.open(GITHUB_RELEASES_URL, '_blank', 'noopener,noreferrer'); }}
          title={`GitHub Depo Sürümü: ${githubVersionTag} — Tıklayarak GitHub sürümlerini açın ve yenileyin`}
          className="group block p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/70 hover:border-emerald-400/70 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/60 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors shrink-0">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                  {isGithubRefreshing ? '...' : githubVersionTag}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                  GitHub Son Sürüm
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide ${
                githubSyncStatus === 'synced'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : githubSyncStatus === 'ahead'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              }`}>
                {githubSyncStatus === 'synced'
                  ? 'Eşit'
                  : githubSyncStatus === 'ahead'
                  ? 'Yerel +1'
                  : 'Güncelleme'}
              </span>
              <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-emerald-500 transition-colors ${
                isGithubRefreshing ? 'animate-spin text-emerald-500' : ''
              }`} />
            </div>
          </div>
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="w-64 shrink-0 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 h-screen sticky top-0 z-30 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden md:flex transition-colors overflow-y-auto">
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer (Controlled via Top Header Button) */}
      <div
        id="mobile-sidebar-drawer-container"
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          isMobileOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ${
            isMobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onCloseMobile}
          aria-hidden="true"
        />

        {/* Sliding Drawer */}
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 shadow-2xl z-10 transition-transform duration-300 ease-in-out overflow-y-auto ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-label="Mobil Yan Menü"
        >
          {renderContent(true)}
        </aside>
      </div>
    </>
  );
};
