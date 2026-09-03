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
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { formatShortTime } from '../lib/utils';
import { getRoleBadgeInfo } from '../lib/permissions';
import { NexusNodeLogo } from './NexusNodeLogo';
import { CustomerSelectorDropdown } from './CustomerSelectorDropdown';
import { CustomerAvatar } from './CustomerAvatar';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenDeploymentModal: () => void;
  onOpenAddWidgetModal: () => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenDeploymentModal,
  onOpenAddWidgetModal,
  editMode = false,
  onToggleEditMode,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
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
    devices,
    rawDevices,
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

  const customerOptions = React.useMemo(() => {
    const customerUsers = customersList.filter((u) => u.role === 'customer' || u.companyName);
    const allAdminIds = new Set(
      customersList
        .filter((c) => c.role === 'admin' || c.id === 'usr_admin' || c.id === 'admin')
        .map((c) => c.id)
    );
    allAdminIds.add('usr_admin');
    allAdminIds.add('admin');

    return customerUsers.map((cust) => {
      const isCustAdmin = cust.role === 'admin' || cust.id === 'usr_admin' || cust.id === 'admin';
      let devCount: number;
      if (isCustAdmin) {
        devCount = cust.deviceCount ?? rawDevices.filter((d) => !d.tenantId || allAdminIds.has(d.tenantId)).length;
      } else {
        devCount = cust.deviceCount ?? rawDevices.filter((d) => d.tenantId === cust.id).length;
      }

      return {
        id: cust.id,
        name: cust.name,
        email: cust.email,
        companyName: cust.companyName,
        phone: cust.phone,
        status: cust.status,
        deviceCount: devCount,
      };
    });
  }, [customersList, rawDevices]);

  return (
    <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/95 dark:bg-[#020617]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 transition-colors duration-200 flex items-center shadow-sm dark:shadow-none">
      <div className="w-full px-2.5 sm:px-4 md:px-6 lg:px-8 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        {/* Left Section: Mobile Menu Toggle, Brand Logo, Customer Title, Connection Badge & Admin Customer Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
          {/* Mobile Sidebar Menu Toggle Button */}
          <button
            type="button"
            id="mobile-sidebar-toggle-btn"
            onClick={onToggleMobileMenu}
            aria-label={isMobileMenuOpen ? 'Yan Menüyü Kapat' : 'Yan Menüyü Aç'}
            aria-expanded={isMobileMenuOpen}
            title={isMobileMenuOpen ? 'Yan Menüyü Gizle' : 'Yan Menüyü Aç'}
            className="md:hidden p-1.5 xs:p-2 rounded-xl text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors shrink-0 cursor-pointer active:scale-95"
          >
            {isMobileMenuOpen ? (
              <X className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>

          {/* Mobile/Compact Brand Logo - sığmadığında otomatik küçülür, sadece logo ikonu kalır */}
          <div className="md:hidden shrink-0">
            <NexusNodeLogo
              variant="compact"
              size="xs"
              showDomain={false}
              animated={true}
              responsiveHideText={true}
              onClick={() => window.location.reload()}
            />
          </div>

          {/* Customer Title (if logged in as customer) */}
          {user?.role === 'customer' && (user.companyName || user.name) ? (
            <div className="flex items-center gap-1.5 xs:gap-2 max-w-[120px] xs:max-w-[160px] sm:max-w-[220px] shrink-0">
              <CustomerAvatar
                companyName={user.companyName}
                name={user.name}
                size="xs"
              />
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                {user.companyName || user.name}
              </h1>
            </div>
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

          {/* ADMIN CUSTOMER SELECTOR (Searchable with Avatars) */}
          {user?.role === 'admin' && (
            <CustomerSelectorDropdown
              customers={customerOptions}
              selectedCustomerId={selectedCustomerForAdmin}
              onSelectCustomer={setSelectedCustomerForAdmin}
              totalDevicesCount={devices.length}
            />
          )}

          {/* Simulator Toggle Button (Admin Only) - Doğrudan üst barda görünür */}
          {user?.role === 'admin' && (
            <button
              type="button"
              id="header-simulator-toggle-btn"
              onClick={toggleSimulator}
              title={simulatorActive ? 'Sanal Veri Simülatörü Açık (Durdurmak için tıklayın)' : 'Sanal Veri Simülatörü Kapalı (Başlatmak için tıklayın)'}
              className={`flex items-center gap-1.5 p-1.5 xs:p-2 xl:px-2.5 xl:py-1 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                simulatorActive
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {simulatorActive ? <Pause className="w-3.5 h-3.5 shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
              <span className="hidden xl:inline">{simulatorActive ? 'Simülatör Açık' : 'Simülatör Kapalı'}</span>
            </button>
          )}
        </div>

        {/* Right Section: Actions, Notifications & User Profile */}
        <div className="flex items-center gap-1 xs:gap-1.5 shrink-0">
          {/* Add Widget & Edit Mode Buttons - Doğrudan üst barda görünür */}
          {activeTab === 'dashboard' && (
            <>
              <button
                type="button"
                id="header-add-widget-btn"
                onClick={onOpenAddWidgetModal}
                title="Yeni Widget Ekle"
                className="flex p-1.5 xs:p-2 xl:px-3 xl:py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
              >
                <Layers className="w-4 h-4 xl:w-3.5 xl:h-3.5 shrink-0" />
                <span className="hidden xl:inline">Widget Ekle</span>
              </button>

              {onToggleEditMode && (
                <button
                  type="button"
                  id="header-toggle-edit-mode-btn"
                  onClick={onToggleEditMode}
                  title={editMode ? 'Düzenlemeyi Tamamla' : 'Dashboard Düzenleme Modu'}
                  className={`flex p-1.5 xs:p-2 xl:px-3 xl:py-1.5 rounded-xl text-xs font-semibold transition-all items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 ${
                    editMode
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                >
                  <Sliders className="w-4 h-4 xl:w-3.5 xl:h-3.5 shrink-0" />
                  <span className="hidden xl:inline">{editMode ? 'Düzenlemeyi Bitir' : 'Düzenleme Modu'}</span>
                </button>
              )}
            </>
          )}

          {/* Help & Glossary Button - Doğrudan üst barda görünür */}
          <button
            type="button"
            id="header-help-btn"
            onClick={() => setActiveTab('help')}
            title="Yardım, SSS & Sözlük"
            className={`flex p-1.5 xs:p-2 xl:px-3 xl:py-1.5 rounded-xl text-xs font-medium border transition-colors items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'help'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30'
            }`}
          >
            <HelpCircle className="w-4 h-4 xl:w-3.5 xl:h-3.5 shrink-0" />
            <span className="hidden xl:inline">Yardım & SSS</span>
          </button>

          {/* Dark / Light Mode Toggle - Doğrudan üst barda görünür */}
          <button
            type="button"
            id="header-theme-toggle-btn"
            onClick={toggleTheme}
            className="flex p-1.5 xs:p-2 rounded-xl text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors shrink-0 cursor-pointer"
            title={theme === 'dark' ? 'Açık Moda Geç' : 'Karanlık Moda Geç'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Notifications Bell */}
          <div ref={notificationsRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-1.5 xs:p-2 rounded-xl text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors relative shrink-0 cursor-pointer"
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
                      className="text-[10px] sm:text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
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
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer"
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

