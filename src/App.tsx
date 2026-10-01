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
import { ServerStatusView } from './components/system/ServerStatusView';
import { DatabaseSetupWizard } from './components/setup/DatabaseSetupWizard';
import { MaintenanceView } from './components/setup/MaintenanceView';
import { RecoveryView } from './components/setup/RecoveryView';
import { SSHTunnelDrawer } from './components/SSHTunnelDrawer';
import { NexusNodeLogo } from './components/NexusNodeLogo';
import { canAccessTab, getRoleBadgeInfo } from './lib/permissions';
import { apiFetch as fetch } from './lib/apiFetch';
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
  Terminal,
} from 'lucide-react';

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [editMode, setEditMode] = useState<boolean>(
    () => localStorage.getItem('nexus_edit_mode') === 'true'
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { selectedCustomerForAdmin, setSelectedCustomerForAdmin, customersList, devices, refreshData, isConnected } = useRealtime();

  // Site her açıldığında ve kullanıcı giriş yaptığında/değiştiğinde doğrudan Canlı İzleme Dashboard ekranı açılır
  useEffect(() => {
    setActiveTab('dashboard');
    try {
      localStorage.removeItem('nexus_active_tab');
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('nexus_edit_mode', String(editMode));
  }, [editMode]);

  // If the URL contains a password reset token/link, force showing the reset screen even if a session is open
  const isResetPasswordUrl = Boolean(
    window.location.search.includes('token=') ||
    window.location.hash.includes('token=') ||
    window.location.hash.includes('reset-password')
  );

  if (!user || isResetPasswordUrl) {
    return <LoginView />;
  }

  const isAdmin = user.role === 'admin';
  const isOperator = user.role === 'operator';
  const isAnalyst = user.role === 'analyst';
  const isCustomer = user.role === 'customer';

  // Guard: If role cannot access current tab, safely fallback to dashboard
  const safeActiveTab = canAccessTab(user.role, activeTab) ? activeTab : 'dashboard';

  const tabTitles: Record<string, string> = {
    dashboard: 'Canlı İzleme Dashboard',
    devices: isCustomer ? 'Cihazlarım & Sensör Verileri' : 'Saha Cihazları',
    device_health: 'Cihaz Sağlığı ve Bakım',
    firmware_ota: 'Firmware & OTA Yönetimi',
    network_discovery: 'Cihaz Keşfi ve Eşleştirme',
    customers: 'Müşteri Yönetimi & Hesaplar',
    generator: 'Sanal Veri & Telemetri Üreteci',
    analytics: 'Veri Analizi & Raporlama',
    notifications: 'Bildirimler & Alarmlar',
    database_data: 'PostgreSQL & Veritabanı Yönetimi',
    server_status: 'Sunucu Durumu & Canlı Sistem Metrikleri',
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
          {(isAdmin || isOperator || isAnalyst) && safeActiveTab === 'server_status' && (
            <ServerStatusView onNavigateToTab={(tab) => setActiveTab(tab)} />
          )}
          {isAdmin && safeActiveTab === 'security' && <SecurityView />}
          {isAdmin && safeActiveTab === 'system_logs' && <SystemLogsView />}
          {isAdmin && safeActiveTab === 'deployment' && <HelpView initialTab="server_deployment" onNavigateToTab={(tab) => setActiveTab(tab)} />}
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

function SystemStateGuard() {
  const [systemMode, setSystemMode] = useState<'READY' | 'MAINTENANCE' | 'RECOVERY' | 'SETUP' | 'LOADING'>('LOADING');
  const [isSSHDrawerOpen, setIsSSHDrawerOpen] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/setup/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.systemMode) {
          setSystemMode(data.systemMode);
        } else if (data.setupRequired) {
          setSystemMode('SETUP');
        } else if (data.isCompleted) {
          setSystemMode('READY');
        } else {
          setSystemMode('MAINTENANCE');
        }
      } else {
        // HTTP / API error -> only enter MAINTENANCE if server explicitly returns 503 maintenance code
        try {
          const errData = await res.json();
          if (errData?.code === 'SETUP_REQUIRED') {
            setSystemMode('SETUP');
          } else {
            setSystemMode('MAINTENANCE');
          }
        } catch {
          setSystemMode('MAINTENANCE');
        }
      }
    } catch {
      // Network / connection error -> keep current or safe fallback
      setSystemMode((prev) => (prev === 'LOADING' ? 'MAINTENANCE' : prev));
    }
  }, []);

  useEffect(() => {
    checkStatus();

    // Global maintenance event listener (e.g. dispatched on 503 with explicit maintenance payload)
    const handleGlobalMaintenance = () => {
      setSystemMode('MAINTENANCE');
    };
    const handleOpenSSH = () => {
      setIsSSHDrawerOpen(true);
    };

    window.addEventListener('nexus_system_maintenance', handleGlobalMaintenance);
    window.addEventListener('nexus_open_ssh_drawer', handleOpenSSH);

    return () => {
      window.removeEventListener('nexus_system_maintenance', handleGlobalMaintenance);
      window.removeEventListener('nexus_open_ssh_drawer', handleOpenSSH);
    };
  }, [checkStatus]);

  // Periodic health monitor when system is READY
  useEffect(() => {
    if (systemMode !== 'READY') return;

    const intervalId = setInterval(() => {
      fetch('/api/setup/status', { credentials: 'include' })
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          // Authoritative server-side system mode: only transition away from READY if server explicitly dictates
          if (data.systemMode && data.systemMode !== 'READY') {
            setSystemMode(data.systemMode);
          }
        })
        .catch(() => {
          // Network hiccup does not kick active operator out of dashboard
        });
    }, 25000); // Check every 25s

    return () => clearInterval(intervalId);
  }, [systemMode]);

  const renderActiveView = () => {
    if (systemMode === 'LOADING') {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs font-medium text-slate-400">Sistem Durumu Kontrol Ediliyor...</p>
          </div>
        </div>
      );
    }

    if (systemMode === 'SETUP') {
      return <DatabaseSetupWizard onComplete={checkStatus} />;
    }

    if (systemMode === 'MAINTENANCE') {
      return <MaintenanceView onRetry={checkStatus} />;
    }

    if (systemMode === 'RECOVERY') {
      return <RecoveryView onRecovered={checkStatus} />;
    }

    return (
      <RealtimeProvider>
        <DashboardContent />
      </RealtimeProvider>
    );
  };

  return (
    <>
      {renderActiveView()}

      {/* Persistent Left Edge Floating Handle for SSH Tunnel */}
      <button
        type="button"
        onClick={() => setIsSSHDrawerOpen(true)}
        title="SSH Bağlantı Tüneli (Sol Ekran)"
        className="fixed bottom-6 left-0 z-40 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-2.5 px-3 rounded-r-xl shadow-xl shadow-cyan-950/50 flex items-center gap-2 transition-transform hover:translate-x-1 group border-y border-r border-cyan-400/30 cursor-pointer"
      >
        <Terminal className="w-4 h-4 text-white group-hover:rotate-12 transition-transform shrink-0" />
        <span className="text-xs font-bold hidden sm:inline pr-1">SSH Tüneli</span>
      </button>

      {/* Global Left-Side SSH Tunnel Drawer */}
      <SSHTunnelDrawer
        isOpen={isSSHDrawerOpen}
        onClose={() => setIsSSHDrawerOpen(false)}
        onConnectedSuccess={checkStatus}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SystemStateGuard />
      </AuthProvider>
    </ThemeProvider>
  );
}
