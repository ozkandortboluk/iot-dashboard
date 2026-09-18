import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider, useRealtime } from './context/RealtimeContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { WidgetGrid } from './components/WidgetGrid';
import { DevicesView } from './components/DevicesView';
import { DeviceHealthView } from './components/DeviceHealthView';
import { CustomerManagement } from './components/CustomerManagement';
import { AnalyticsView } from './components/AnalyticsView';
import { NotificationsView } from './components/NotificationsView';
import { SecurityView } from './components/SecurityView';
import { DeploymentView } from './components/DeploymentView';
import { DataGeneratorView } from './components/DataGeneratorView';
import { DatabaseDataView } from './components/DatabaseDataView';
import { NetworkDiscoveryView } from './components/NetworkDiscoveryView';
import { AddWidgetModal } from './components/AddWidgetModal';
import { LoginView } from './components/LoginView';
import { HelpView } from './components/HelpView';
import { AutomationsView } from './components/AutomationsView';
import { AccountSettingsView } from './components/AccountSettingsView';
import { FirmwareView } from './components/FirmwareView';
import { SystemLogsView } from './components/system/SystemLogsView';
import { DatabaseSetupWizard } from './components/setup/DatabaseSetupWizard';
import { NexusNodeLogo } from './components/NexusNodeLogo';
import { canAccessTab, getRoleBadgeInfo } from './lib/permissions';
import { useAnimatedFavicon } from './hooks/useAnimatedFavicon';
import {
  LayoutDashboard,
  Cpu,
  BarChart3,
  Bell,
  ChevronRight,
  Home,
  Users,
  LogOut,
  Menu,
  RefreshCw,
  Database,
  CheckCircle2,
  Server,
} from 'lucide-react';

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem('nexus_active_tab') || 'dashboard'
  );
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [editMode, setEditMode] = useState<boolean>(
    () => localStorage.getItem('nexus_edit_mode') === 'true'
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('nexus_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('nexus_edit_mode', String(editMode));
  }, [editMode]);
  const { user, logout } = useAuth();
  const { selectedCustomerForAdmin, setSelectedCustomerForAdmin, customersList, devices, refreshData, isConnected } = useRealtime();

  // Dynamic animated tab pulse favicon synchronized with real-time state
  useAnimatedFavicon(isConnected, true);

  if (!user) {
    return <LoginView />;
  }

  const isAdmin = user.role === 'admin';
  const isOperator = user.role === 'operator';
  const isAnalyst = user.role === 'analyst';
  const isCustomer = user.role === 'customer';

  // Guard: If role cannot access current tab, safely fallback to dashboard
  const safeActiveTab = canAccessTab(user.role, activeTab) ? activeTab : 'dashboard';

  const tabTitles: Record<string, string> = {
    dashboard: isCustomer ? 'Özel Dashboard\'um' : 'Canlı İzleme Dashboard',
    devices: isCustomer ? 'Cihazlarım & Sensör Verileri' : 'Saha Cihazları',
    device_health: 'Cihaz Sağlığı & Metrikleri',
    firmware_ota: 'Firmware & OTA Yönetimi',
    network_discovery: 'Cihaz Keşfi ve Eşleştirme',
    customers: 'Müşteri Yönetimi & Hesaplar',
    generator: 'Sanal Veri & Telemetri Üreteci',
    analytics: 'Veri Analizi & Raporlama',
    notifications: 'Bildirimler & Alarmlar',
    database_data: 'PostgreSQL & Veritabanı Yönetimi',
    security: 'Güvenlik & Audit Logları',
    system_logs: 'Sunucu Sistem & Hata Günlükleri',
    deployment: 'Sunucu & DB Kurulum Rehberi',
    account_settings: 'Hesap & Şifre Ayarları',
    help: 'Yardım & Bilgi Merkezi',
    automations: 'Otomasyon & Senaryolar',
  };

  const getBreadcrumbContext = () => {
    if (isCustomer) {
      return `${user.companyName || user.name} (Müşteri Hesabı)`;
    }
    if (isOperator) {
      return 'Saha Operasyonu';
    }
    if (isAnalyst) {
      return 'Veri & Analiz Masası';
    }
    if (selectedCustomerForAdmin !== 'all') {
      const activeCust = customersList.find((c) => c.id === selectedCustomerForAdmin);
      return `Yönetim > ${activeCust?.companyName || activeCust?.name || 'Seçili Müşteri'}`;
    }
    return 'Merkez Yönetim';
  };

  const roleInfo = getRoleBadgeInfo(user.role);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-[#020617] dark:text-slate-200 font-sans transition-colors duration-200 flex flex-col md:flex-row">
      {/* Sidebar for Desktop & Slide-out Drawer for Mobile */}
      <Sidebar
        activeTab={safeActiveTab}
        setActiveTab={setActiveTab}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <Header
          activeTab={safeActiveTab}
          setActiveTab={setActiveTab}
          onOpenDeploymentModal={() => {
            if (isAdmin) setActiveTab('deployment');
          }}
          onOpenAddWidgetModal={() => setIsAddWidgetOpen(true)}
          editMode={editMode}
          onToggleEditMode={() => setEditMode((prev) => !prev)}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Navigation Breadcrumb Bar */}
        <div className="sticky top-14 sm:top-16 z-20 px-3 sm:px-6 md:px-8 py-2 bg-white/95 dark:bg-[#0a0f1d]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs min-w-0 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-1.5 sm:gap-2 text-slate-500 dark:text-slate-400 font-medium overflow-x-auto whitespace-nowrap min-w-0 pr-2 scrollbar-none">
            <Home className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="hidden xs:inline shrink-0">
              {isAdmin ? 'Sistem Yönetimi' : isOperator ? 'Operatör Masası' : isAnalyst ? 'Analist Masası' : 'Müşteri Portalı'}
            </span>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300 font-semibold truncate shrink">{getBreadcrumbContext()}</span>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
            <span className="text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20 shrink-0">
              {tabTitles[safeActiveTab]}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] shrink-0">
            <span className="text-slate-500">Aktif Rol:</span>
            <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${roleInfo.badgeClass}`}>
              {roleInfo.label}
            </span>
          </div>
        </div>

        <main className="flex-1 p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          {safeActiveTab === 'dashboard' && (
            <WidgetGrid
              onOpenAddWidgetModal={() => setIsAddWidgetOpen(true)}
              editMode={editMode}
              setEditMode={setEditMode}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}
          {safeActiveTab === 'devices' && (
            <DevicesView onNavigateToHelp={() => setActiveTab('help')} />
          )}
          {safeActiveTab === 'automations' && <AutomationsView />}
          {safeActiveTab === 'device_health' && (
            <DeviceHealthView />
          )}
          {(isAdmin || isOperator) && safeActiveTab === 'firmware_ota' && (
            <FirmwareView
              currentUser={user}
              devices={devices}
              onRefreshDevices={refreshData}
            />
          )}
          {safeActiveTab === 'network_discovery' && (
            <NetworkDiscoveryView
              onNavigateToDevices={() => setActiveTab('devices')}
              onNavigateToHelp={() => setActiveTab('help')}
            />
          )}
          {isAdmin && safeActiveTab === 'customers' && (
            <CustomerManagement
              onSelectCustomerForDashboard={(customerId) => {
                setSelectedCustomerForAdmin(customerId);
                setActiveTab('dashboard');
              }}
              onNavigateToDevices={() => setActiveTab('devices')}
            />
          )}
          {isAdmin && safeActiveTab === 'generator' && <DataGeneratorView />}
          {(isAdmin || isOperator || isAnalyst) && safeActiveTab === 'analytics' && <AnalyticsView />}
          {safeActiveTab === 'notifications' && <NotificationsView />}
          {isAdmin && safeActiveTab === 'database_data' && <DatabaseDataView />}
          {isAdmin && safeActiveTab === 'security' && <SecurityView />}
          {isAdmin && safeActiveTab === 'system_logs' && <SystemLogsView />}
          {isAdmin && safeActiveTab === 'deployment' && <DeploymentView />}
          {safeActiveTab === 'account_settings' && <AccountSettingsView />}
          {safeActiveTab === 'help' && <HelpView onNavigateToTab={(tab) => setActiveTab(tab)} />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f172a] border-t border-slate-800 flex items-center justify-around md:hidden z-40 text-[10px] font-semibold">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 ${
            safeActiveTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{isCustomer ? 'Dashboard\'um' : 'Dashboard'}</span>
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`flex flex-col items-center gap-1 ${
            safeActiveTab === 'devices' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Cihazlar</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex flex-col items-center gap-1 ${
              safeActiveTab === 'customers' ? 'text-indigo-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Müşteriler</span>
          </button>
        )}
        {(isAdmin || isOperator || isAnalyst) && (
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center gap-1 ${
              safeActiveTab === 'analytics' ? 'text-indigo-400 font-bold' : 'text-slate-400'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analiz</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex flex-col items-center gap-1 ${
            safeActiveTab === 'notifications' ? 'text-indigo-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Bildirimler</span>
        </button>
        <button
          id="mobile-bottom-menu-btn"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            isMobileMenuOpen ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Tüm Menüyü Aç / Kapat"
        >
          <Menu className="w-4 h-4" />
          <span>Menü</span>
        </button>
        <button
          onClick={logout}
          className="flex flex-col items-center gap-1 text-rose-400 hover:text-rose-300 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Çıkış Yap</span>
        </button>
      </div>

      {/* Add Widget Modal */}
      <AddWidgetModal
        isOpen={isAddWidgetOpen}
        onClose={() => setIsAddWidgetOpen(false)}
        onNavigateToAlarms={() => {
          setIsAddWidgetOpen(false);
          setActiveTab('notifications');
        }}
      />
    </div>
  );
}

/**
 * Startup Gatekeeper: Enforces strict PostgreSQL initialization before displaying Login or Dashboard
 * Flow:
 * 1. Site loads
 * 2. Check: Is PostgreSQL configured, connected, TimescaleDB checked, migrations complete, and admin exists?
 * 3. If NO -> Directly render DatabaseSetupWizard (Host / Port / DB / User / Password -> Test -> PostgreSQL ✓ -> TimescaleDB ✓ -> Migration -> Admin -> READY -> Login)
 * 4. If YES -> Directly render LoginView / Dashboard
 */
function AppStartupGatekeeper() {
  const [bypassToLogin, setBypassToLogin] = useState(false);
  const [dbStatusState, setDbStatusState] = useState<{
    isLoading: boolean;
    setupRequired: boolean;
    isDbReady: boolean;
    errorMessage?: string;
  }>({
    isLoading: true,
    setupRequired: false,
    isDbReady: false,
  });

  const checkDatabaseReadiness = useCallback(async () => {
    setDbStatusState((prev) => ({ ...prev, isLoading: true, errorMessage: undefined }));
    try {
      const res = await fetch('/api/setup/status', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        const isReady = Boolean(
          data.isDbConnected &&
          data.stepsCompleted?.migrations &&
          data.hasAdmin &&
          !data.setupRequired
        );

        setDbStatusState({
          isLoading: false,
          setupRequired: !isReady,
          isDbReady: isReady,
        });
        return;
      } else {
        // Non-200 response (e.g. 503 database not ready)
        setDbStatusState({
          isLoading: false,
          setupRequired: true,
          isDbReady: false,
        });
      }
    } catch (err: unknown) {
      setDbStatusState({
        isLoading: false,
        setupRequired: true,
        isDbReady: false,
        errorMessage: err instanceof Error ? err.message : 'Veritabanı kontrol hatası',
      });
    }
  }, []);

  useEffect(() => {
    checkDatabaseReadiness();
  }, [checkDatabaseReadiness]);

  // Loading state during initial startup check
  if (dbStatusState.isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center p-6 space-y-6">
        <NexusNodeLogo variant="stacked" size="lg" showDomain={true} animated={true} />
        
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono shadow-xl">
          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>PostgreSQL & TimescaleDB durumu kontrol ediliyor...</span>
        </div>
      </div>
    );
  }

  // Database is NOT configured or NOT ready -> Render Database Setup Wizard directly (unless user intentionally bypassed to Login)
  if (!bypassToLogin && (dbStatusState.setupRequired || !dbStatusState.isDbReady)) {
    return (
      <DatabaseSetupWizard
        onComplete={() => {
          setBypassToLogin(true);
        }}
      />
    );
  }

  // Database is configured and ready (or bypassed to login) -> Render regular Auth & Dashboard flow
  return (
    <AuthProvider>
      <RealtimeProvider>
        <DashboardContent />
      </RealtimeProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppStartupGatekeeper />
    </ThemeProvider>
  );
}
