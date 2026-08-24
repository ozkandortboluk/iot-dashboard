import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Sun,
  Moon,
  Radio,
  Server,
  User as UserIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  LogOut,
  ChevronDown,
  Layers,
  Building2,
  ShieldCheck,
  UserCheck,
  HelpCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Sliders,
  UserCog,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { formatShortTime } from '../lib/utils';
import { getRoleBadgeInfo } from '../lib/permissions';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenDeploymentModal: () => void;
  onOpenAddWidgetModal: () => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenDeploymentModal,
  onOpenAddWidgetModal,
  editMode = false,
  onToggleEditMode,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const {
    isConnected,
    connectionStatus,
    reconnectWebSocket,
    wsLatency,
    notifications,
    unreadCount,
    markNotificationRead,
    clearAllNotifications,
    simulatorActive,
    toggleSimulator,
    selectedCustomerForAdmin,
    setSelectedCustomerForAdmin,
    customersList,
  } = useRealtime();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const customerUsers = customersList.filter((u) => u.role === 'customer' || u.companyName);

  return (
    <header className="sticky top-0 z-30 min-h-[3.5rem] sm:min-h-[4rem] py-1.5 sm:py-2 bg-white/90 dark:bg-[#020617]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 transition-colors duration-200 flex flex-col justify-center shadow-sm dark:shadow-none">
      <div className="px-2.5 sm:px-4 md:px-6 lg:px-8 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        {/* Left Section: Optional Customer Title, Connection Badge & Admin Customer Switcher */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          {/* Customer Title (if applicable, without 'Canlı İzleme') */}
          {user?.role === 'customer' && (user.companyName || user.name) ? (
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate max-w-[90px] xs:max-w-[120px] sm:max-w-[180px] shrink-0">
              {user.companyName || user.name}
            </h1>
          ) : null}

          {/* REALTIME CONNECTION STATUS INDICATOR - Compact Icon Badge */}
          <button
            onClick={reconnectWebSocket}
            title={
              connectionStatus === 'connected'
                ? `Gerçek Zamanlı WebSocket Akışı Aktif (${wsLatency}ms) — Yeniden bağlanmak için tıklayın`
                : connectionStatus === 'reconnecting'
                ? 'Sunucuya bağlanılıyor / yeniden deneniyor...'
                : 'Bağlantı koptu. Tekrar bağlanmak için tıklayın.'
            }
            className={`flex items-center gap-1.5 p-1.5 xs:p-2 2xl:px-2.5 2xl:py-1 rounded-full text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                : connectionStatus === 'reconnecting'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/20 animate-pulse'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/20'
            }`}
          >
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="hidden 2xl:inline">Bağlı ({wsLatency}ms)</span>
              </>
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                <span className="hidden 2xl:inline">Bağlanıyor...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="hidden 2xl:inline">Kopuk</span>
              </>
            )}
          </button>

          {/* ADMIN CUSTOMER SELECTOR */}
          {user?.role === 'admin' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-indigo-950/50 border border-slate-300 dark:border-indigo-500/30 rounded-xl p-1.5 2xl:px-2.5 2xl:py-1 text-xs max-w-[95px] xs:max-w-[125px] sm:max-w-[170px] min-w-0 shrink">
              <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <select
                value={selectedCustomerForAdmin}
                onChange={(e) => setSelectedCustomerForAdmin(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-indigo-300 font-semibold focus:outline-none cursor-pointer text-xs truncate w-full"
              >
                <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                  🌐 Tüm Müşteriler
                </option>
                {customerUsers.map((cust) => (
                  <option key={cust.id} value={cust.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                    🏢 {cust.companyName || cust.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Simulator Toggle Button - Compact (Admin Only) */}
          {user?.role === 'admin' && (
            <button
              onClick={toggleSimulator}
              title={simulatorActive ? 'Sanal Veri Simülatörü Açık' : 'Sanal Veri Simülatörü Kapalı'}
              className={`flex items-center gap-1.5 p-1.5 xs:p-2 2xl:px-2.5 2xl:py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                simulatorActive
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {simulatorActive ? <Pause className="w-3.5 h-3.5 shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
              <span className="hidden 2xl:inline">{simulatorActive ? 'Simülatör Açık' : 'Simülatör Kapalı'}</span>
            </button>
          )}
        </div>

        {/* Right Section: Actions, Notifications & User Profile */}
        <div className="flex items-center gap-1 xs:gap-1.5 shrink-0">
          {/* Add Widget & Edit Mode Buttons (if on dashboard tab) */}
          {activeTab === 'dashboard' && (
            <>
              <button
                onClick={onOpenAddWidgetModal}
                title="Yeni Widget Ekle"
                className="p-1.5 xs:p-2 2xl:px-3 2xl:py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5 shrink-0"
              >
                <Layers className="w-4 h-4 2xl:w-3.5 2xl:h-3.5 shrink-0" />
                <span className="hidden 2xl:inline">Widget Ekle</span>
              </button>

              <button
                onClick={onToggleEditMode}
                title={editMode ? 'Düzenlemeyi Tamamla' : 'Dashboard Düzenleme Modu'}
                className={`p-1.5 xs:p-2 2xl:px-3 2xl:py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                  editMode
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                <Sliders className="w-4 h-4 2xl:w-3.5 2xl:h-3.5 shrink-0" />
                <span className="hidden 2xl:inline">{editMode ? 'Düzenlemeyi Bitir' : 'Düzenleme Modu'}</span>
              </button>
            </>
          )}

          {/* Help & Glossary Button */}
          <button
            onClick={() => setActiveTab('help')}
            title="Yardım, SSS & Sözlük"
            className={`p-1.5 xs:p-2 2xl:px-3 2xl:py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'help'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30'
            }`}
          >
            <HelpCircle className="w-4 h-4 2xl:w-3.5 2xl:h-3.5 shrink-0" />
            <span className="hidden 2xl:inline">Yardım & SSS</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 xs:p-2 rounded-xl text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors shrink-0"
            title={theme === 'dark' ? 'Açık Moda Geç' : 'Karanlık Moda Geç'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Notifications Bell */}
          <div ref={notificationsRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-1.5 xs:p-2 rounded-xl text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors relative shrink-0"
              title="Bildirimler"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-[#020617]" />
              )}
            </button>

            {/* Notifications Dropdown Panel */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3 z-50 overflow-hidden animate-fadeIn">
                <div className="px-4 sm:px-5 pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Son Bildirimler
                  </h4>
                  {unreadCount > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      className="text-[10px] sm:text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      Tümünü Okundu İşaretle
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Henüz bildirim bulunmuyor.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          !n.read ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {n.severity === 'critical' ? (
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          ) : n.severity === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {n.title}
                                </p>
                                {(n.isSimulation || n.source === 'simulator') && (
                                  <span className="shrink-0 text-[9px] font-extrabold uppercase text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded">
                                    TEST ALARMI
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-1">
                                {formatShortTime(n.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                  <button
                    onClick={() => {
                      setActiveTab('notifications');
                      setShowNotifications(false);
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                  >
                    Tüm Bildirim Geçmişi →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div ref={userMenuRef} className="relative pl-1 sm:pl-2.5 border-l border-slate-200 dark:border-slate-800/80 shrink-0">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-1.5 sm:gap-2 transition-colors cursor-pointer"
            >
              <div className="text-right hidden 2xl:block">
                <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{user?.name}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{getRoleBadgeInfo(user?.role || 'customer').label}</p>
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 border border-indigo-400/30 flex items-center justify-center font-bold text-white shadow-md text-xs shrink-0">
                {user?.name.split(' ').map(n=>n[0]).join('') || 'DC'}
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 sm:w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2 z-50 text-xs animate-fadeIn">
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-slate-200">{user?.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">{user?.email}</p>
                  <span className={`mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeInfo(user?.role || 'customer').badgeClass}`}>
                    {getRoleBadgeInfo(user?.role || 'customer').label}
                  </span>
                </div>

                <div className="pt-1 mt-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setActiveTab('account_settings');
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 font-medium flex items-center gap-2 transition cursor-pointer"
                  >
                    <UserCog className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Hesap & Şifre Ayarları</span>
                  </button>

                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-medium flex items-center gap-2 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Oturumu Kapat</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

