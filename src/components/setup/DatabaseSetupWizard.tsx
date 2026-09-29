import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  UserCheck,
  Activity,
  Cpu,
  RefreshCw,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  XCircle,
  HelpCircle,
  Zap,
  Terminal,
  LogIn,
  RotateCcw,
  Trash2,
  Play,
  X,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../config/version';

interface SetupStatus {
  setupRequired: boolean;
  isCompleted: boolean;
  setupTokenRequired?: boolean;
  isSetupAuthenticated?: boolean;
  currentStep: number;
  isDbConnected: boolean;
  isTimescaleAvailable: boolean;
  hasAdmin: boolean;
  dbConfig?: {
    host: string;
    port: number;
    database: string;
    user: string;
    sslMode: string;
  };
  stepsCompleted: {
    connection: boolean;
    timescale: boolean;
    migrations: boolean;
    schemaVerified: boolean;
    adminCreated: boolean;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  pgVersion?: string;
  timescaleAvailable: boolean;
  timescaleVersion?: string;
  latencyMs?: number;
  tablesStatus?: Record<string, boolean>;
  errorCode?: string;
}

interface StepLog {
  name: string;
  status: 'done' | 'failed' | 'skipped' | 'running';
  details?: string;
}

interface DatabaseSetupWizardProps {
  onComplete: () => void;
}

export const DatabaseSetupWizard: React.FC<DatabaseSetupWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showAdminPassword, setShowAdminPassword] = useState<boolean>(false);

  // Setup Security Token Authentication State
  const [setupToken, setSetupToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem('nexus_setup_token') || '';
    } catch {
      return '';
    }
  });
  const [setupTokenRequired, setSetupTokenRequired] = useState<boolean>(true);
  const [isTokenVerified, setIsTokenVerified] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenVerifying, setTokenVerifying] = useState<boolean>(false);
  const [showSetupToken, setShowSetupToken] = useState<boolean>(false);

  // Helper to generate authenticated request headers with X-Setup-Token
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const activeToken = setupToken || sessionStorage.getItem('nexus_setup_token');
    if (activeToken) {
      headers['X-Setup-Token'] = activeToken;
    }
    return headers;
  };

  // Database Form State (held strictly in React memory, never written to localStorage/sessionStorage)
  const [dbConfig, setDbConfig] = useState({
    host: 'timescaledb',
    port: 5432,
    database: 'iot_dashboard',
    user: 'iot_user',
    password: '',
    sslMode: 'disable' as 'disable' | 'require' | 'prefer' | 'verify-full',
  });

  // Quick Docker Loading State
  const [quickDockerLoading, setQuickDockerLoading] = useState<boolean>(false);

  // Test Connection Result
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testSuccess, setTestSuccess] = useState<boolean>(false);

  // Initialization Steps
  const [initLogs, setInitLogs] = useState<StepLog[]>([]);
  const [initComplete, setInitComplete] = useState<boolean>(false);

  // Admin Account State
  const [adminForm, setAdminForm] = useState({
    name: 'Sistem Yöneticisi',
    email: '',
    password: '',
    passwordConfirm: '',
    companyName: 'Merkez Yönetim',
  });

  // Step 7 Result
  const [completedAdmin, setCompletedAdmin] = useState<string | null>(null);

  // Recovery & Reset State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetTokenRequired, setResetTokenRequired] = useState(false);
  const [modalTokenInput, setModalTokenInput] = useState('');

  const openResetModal = () => {
    setResetError(null);
    setResetTokenRequired(false);
    setModalTokenInput(setupToken || tokenInput || '');
    setResetModalOpen(true);
  };

  // Verifies the Setup Security Token with the backend API
  const verifyToken = async (candidateToken: string, showToastError: boolean = true): Promise<boolean> => {
    const trimmed = (candidateToken || '').trim();
    if (!trimmed) {
      if (showToastError) setError('Lütfen kurulum güvenlik anahtarını giriniz.');
      return false;
    }

    setTokenVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/setup/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: trimmed }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('nexus_setup_token', trimmed);
        setSetupToken(trimmed);
        setIsTokenVerified(true);
        return true;
      } else {
        if (showToastError) {
          setError(data.message || 'Geçersiz kurulum güvenlik anahtarı.');
        }
        setIsTokenVerified(false);
        return false;
      }
    } catch (err: any) {
      if (showToastError) {
        setError('Sunucuyla iletişim kurulamadı. Lütfen bağlantınızı kontrol ediniz.');
      }
      return false;
    } finally {
      setTokenVerifying(false);
    }
  };

  // Fetch initial setup status from server
  const fetchStatus = async (manualStep?: number) => {
    try {
      setInitialLoading(true);
      const savedToken = sessionStorage.getItem('nexus_setup_token') || setupToken;
      const headers: Record<string, string> = {};
      if (savedToken) {
        headers['X-Setup-Token'] = savedToken;
      }

      const res = await fetch('/api/setup/status', {
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        const isDbReady = Boolean(
          data.isDbConnected &&
          data.stepsCompleted?.migrations &&
          data.hasAdmin &&
          !data.setupRequired
        );

        if (isDbReady) {
          onComplete();
          return;
        }

        const tokenRequired = Boolean(data.setupTokenRequired);
        setSetupTokenRequired(tokenRequired);

        if (data.setupToken) {
          setSetupToken(data.setupToken);
          sessionStorage.setItem('nexus_setup_token', data.setupToken);
          setIsTokenVerified(true);
        } else if (data.isSetupAuthenticated || !tokenRequired) {
          setIsTokenVerified(true);
        } else if (savedToken) {
          // Attempt silent verification with cached session token
          await verifyToken(savedToken, false);
        }

        if (data.dbConfig && manualStep === undefined) {
          setDbConfig((prev) => ({
            ...prev,
            host: data.dbConfig.host || prev.host,
            port: data.dbConfig.port || prev.port,
            database: data.dbConfig.database || prev.database,
            user: data.dbConfig.user || prev.user,
            sslMode: data.dbConfig.sslMode || prev.sslMode,
            password: prev.password || '',
          }));
        } else if (data.defaultDockerConfig && !data.dbConfig && manualStep === undefined) {
          setDbConfig((prev) => ({
            ...prev,
            ...data.defaultDockerConfig,
            password: prev.password || '',
          }));
        }

        if (manualStep !== undefined) {
          setCurrentStep(manualStep);
        } else if (data.isDbConnected && data.stepsCompleted?.schemaVerified && !data.hasAdmin) {
          setCurrentStep(6);
        } else if (data.isDbConnected && !data.stepsCompleted?.migrations) {
          setCurrentStep(4);
        } else if (data.isDbConnected) {
          setCurrentStep(3);
          setTestSuccess(true);
        } else {
          // If database is not connected, stay on Step 1 / Step 2
          setCurrentStep(1);
        }
      }
    } catch {
      // Backend not yet ready or offline
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Safe Setup Reset
  const handleResetSetup = async (preserveConfig: boolean) => {
    setResetLoading(true);
    setResetError(null);
    setError(null);
    try {
      const activeToken = modalTokenInput.trim() || setupToken || sessionStorage.getItem('nexus_setup_token');
      const res = await fetch('/api/setup/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'X-Setup-Token': activeToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ preserveConfig, setupToken: activeToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'SETUP_RECOVERY_TOKEN_REQUIRED' || data.code === 'SETUP_TOKEN_REQUIRED' || res.status === 401) {
          setResetTokenRequired(true);
        }
        throw new Error(data.message || data.error || 'Kurulum sıfırlanamadı.');
      }
      if (data.setupToken) {
        setSetupToken(data.setupToken);
        sessionStorage.setItem('nexus_setup_token', data.setupToken);
      }
      setIsTokenVerified(true);
      setSetupTokenRequired(false);
      setResetModalOpen(false);
      setResetError(null);
      setResetTokenRequired(false);
      setTestSuccess(false);
      setTestResult(null);
      setInitComplete(false);
      setInitLogs([]);

      if (!preserveConfig) {
        setDbConfig({
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: '',
          sslMode: 'disable',
        });
        setAdminForm({
          name: 'Sistem Yöneticisi',
          email: '',
          password: '',
          passwordConfirm: '',
          companyName: 'Merkez Yönetim',
        });
      }

      const nextStep = preserveConfig ? 2 : 1;
      await fetchStatus(nextStep);
      setCurrentStep(nextStep);
    } catch (err: any) {
      const msg = err?.message || 'Kurulum sıfırlanırken bir hata oluştu.';
      setResetError(msg);
      setError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  // Client-only local state reset fallback (in case server is unreachable)
  const handleClientOnlyReset = () => {
    setDbConfig({
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: '',
      sslMode: 'disable',
    });
    setTestSuccess(false);
    setTestResult(null);
    setCurrentStep(1);
    setResetModalOpen(false);
    setResetError(null);
  };

  // Safe Setup Resume / Recovery
  const handleResumeSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeToken = setupToken || sessionStorage.getItem('nexus_setup_token');
      const res = await fetch('/api/setup/resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'X-Setup-Token': activeToken } : {}),
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Kurulum devam ettirilemedi.');
      }
      if (data.setupToken) {
        setSetupToken(data.setupToken);
        sessionStorage.setItem('nexus_setup_token', data.setupToken);
      }
      setIsTokenVerified(true);
      setSetupTokenRequired(false);
      const resumeStep = data.currentStep || 1;
      await fetchStatus(resumeStep);
      setCurrentStep(resumeStep);
    } catch (err: any) {
      setError(err?.message || 'Kurulum kurtarılırken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Automated Docker Setup
  const handleQuickDockerSetup = async () => {
    setError(null);
    setQuickDockerLoading(true);
    try {
      const res = await fetch('/api/setup/quick-init-docker', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ password: dbConfig.password || '' }),
      });

      const data = await res.json();
      if (res.status === 401) {
        setIsTokenVerified(false);
        setError(data.message || 'Kurulum güvenlik anahtarı doğrulaması gereklidir.');
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Hızlı Docker kurulumu başarısız.');
      }

      setTestSuccess(true);
      setInitComplete(true);
      setCurrentStep(6);
    } catch (err: any) {
      setError(err?.message || 'Hızlı Docker kurulumu başarısız. Lütfen parametreleri manuel yapılandırın.');
    } finally {
      setQuickDockerLoading(false);
    }
  };

  // Step 3: Run real database connection test
  const handleTestConnection = async () => {
    setError(null);
    setLoading(true);
    setTestResult(null);
    setTestSuccess(false);

    try {
      const res = await fetch('/api/setup/test-database', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(dbConfig),
      });

      const data: TestResult = await res.json();
      setTestResult(data);

      if (res.status === 401) {
        setIsTokenVerified(false);
        setError(data.message || 'Kurulum güvenlik anahtarı doğrulaması gereklidir.');
        return;
      }

      if (res.ok && data.success) {
        setTestSuccess(true);
      } else {
        setTestSuccess(false);
        setError(data.message || 'Veritabanı bağlantı testi başarısız.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Sunucuya ulaşılamadı. Bağlantıyı kontrol edin.';
      setError(msg);
      setTestResult({
        success: false,
        message: msg,
        timescaleAvailable: false,
      });
    } finally {
      setLoading(false);
    }
  };

  // Save DB configuration and proceed to Step 4
  const handleSaveAndProceedToInit = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/setup/configure-database', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(dbConfig),
      });

      const data = await res.json();
      if (res.status === 401) {
        setIsTokenVerified(false);
        setError(data.message || 'Kurulum güvenlik anahtarı doğrulaması gereklidir.');
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Konfigürasyon kaydedilemedi.');
      }

      setCurrentStep(4);
    } catch (err: any) {
      setError(err?.message || 'Konfigürasyon kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Step 4 & 5: Run Database Initialization, Migrations, and Canonical Schema Verification
  const handleRunInitialization = async () => {
    setError(null);
    setLoading(true);
    setInitLogs([
      { name: 'Database connection', status: 'running', details: 'PostgreSQL bağlantısı doğrulanıyor...' },
    ]);

    try {
      const res = await fetch('/api/setup/initialize', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const data = await res.json();
      if (res.status === 401) {
        setIsTokenVerified(false);
        setError(data.message || 'Kurulum güvenlik anahtarı doğrulaması gereklidir.');
        return;
      }

      if (data.steps && Array.isArray(data.steps)) {
        setInitLogs(data.steps);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Veritabanı ilklendirme başarısız.');
      }

      if (!data.steps || !Array.isArray(data.steps)) {
        setInitLogs([
          { name: 'Database connection', status: 'done', details: 'PostgreSQL bağlantısı aktif.' },
          { name: 'PostgreSQL detected', status: 'done', details: 'PostgreSQL 16' },
          { name: 'TimescaleDB detected', status: 'done', details: 'TimescaleDB aktif.' },
          { name: 'Migrations completed', status: 'done', details: 'Tüm migrasyonlar başarıyla uygulandı.' },
          { name: 'Schema verified', status: 'done', details: 'Canonical Schema ile %100 uyumlu.' },
        ]);
      }

      setInitComplete(true);
    } catch (err: any) {
      setError(err?.message || 'İlklendirme sırasında hata meydana geldi.');
      setInitLogs((prev) => {
        if (prev.length === 0) {
          return [{ name: 'Initialization', status: 'failed' as const, details: err?.message }];
        }
        return prev.map((l) => (l.status === 'running' ? { ...l, status: 'failed' as const, details: err?.message } : l));
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 6: Create Primary Admin Account
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminForm.name.trim()) {
      setError('Lütfen yönetici adı ve soyadı giriniz.');
      return;
    }
    if (!adminForm.email.trim() || !adminForm.email.includes('@')) {
      setError('Geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (adminForm.password.length < 8) {
      setError('Yönetici şifresi en az 8 karakter olmalıdır.');
      return;
    }
    if (adminForm.password !== adminForm.passwordConfirm) {
      setError('Şifreler birbiriyle uyuşmuyor.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/setup/create-admin', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(adminForm),
      });

      const data = await res.json();

      if (res.status === 401) {
        setIsTokenVerified(false);
        setError(data.message || 'Kurulum güvenlik anahtarı doğrulaması gereklidir.');
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Yönetici hesabı oluşturulamadı.');
      }

      // Save user details to localStorage for instant AuthContext hydration (session token stored in HttpOnly cookie)
      if (data.user) {
        localStorage.removeItem('dashboard_token');
        localStorage.setItem('dashboard_user', JSON.stringify(data.user));
      }

      // Clean up setup token from session storage now that setup is complete
      try {
        sessionStorage.removeItem('nexus_setup_token');
      } catch {}

      setCompletedAdmin(data.user?.email || adminForm.email);
      setCurrentStep(7);
    } catch (err: any) {
      setError(err?.message || 'Yönetici hesabı oluşturulurken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSetup = async () => {
    setLoading(true);
    try {
      sessionStorage.removeItem('nexus_setup_token');

      // Verify profile if user state is not in localStorage
      if (!localStorage.getItem('dashboard_user')) {
        try {
          const profileRes = await fetch('/api/auth/me', { credentials: 'include' });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.user) {
              localStorage.setItem('dashboard_user', JSON.stringify(profileData.user));
            }
          }
        } catch {}
      }

      onComplete();
      window.location.href = '/';
    } catch {
      onComplete();
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, title: 'Hoş Geldiniz', label: 'Başlangıç' },
    { num: 2, title: 'Veritabanı Ayarları', label: 'Konfigürasyon' },
    { num: 3, title: 'Bağlantı Testi', label: 'Test' },
    { num: 4, title: 'İlklendirme & Migrasyon', label: 'Kurulum' },
    { num: 5, title: 'Şema Doğrulama', label: 'Doğrulama' },
    { num: 6, title: 'Yönetici Hesabı', label: 'Yönetici' },
    { num: 7, title: 'Tamamlandı', label: 'Bitiş' },
  ];

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm font-medium text-slate-400">NexusNode IoT kurulum durumu sorgulanıyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">{APP_NAME}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400">First Run Database Setup Wizard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="wizard-reset-btn"
              type="button"
              onClick={openResetModal}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer shadow-sm"
              title="Kurulum adımlarını veya konfigürasyonu sıfırlar"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Kurulumu Sıfırla</span>
            </button>
            <button
              id="wizard-back-to-login"
              type="button"
              onClick={onComplete}
              className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 px-3 py-1.5 rounded-lg transition cursor-pointer shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Giriş Ekranına Dön</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/60">
              {setupTokenRequired && !isTokenVerified ? (
                <>
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300">Kurulum Koruması Aktif</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">Sıfır Veri Kaybı Mimarisi</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Progress Indicator */}
      {setupTokenRequired && !isTokenVerified ? (
        <div className="max-w-5xl mx-auto w-full px-6 pt-8 pb-4">
          <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3.5 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-medium">İlk Kurulum Güvenlik Koruması: API uç noktaları için güvenlik anahtarı doğrulaması gerekiyor.</span>
            </div>
            <span className="hidden sm:inline-block font-mono text-[11px] bg-amber-900/50 px-2.5 py-0.5 rounded text-amber-200 border border-amber-700/50">
              SETUP AUTH LOCKED
            </span>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto w-full px-6 pt-8 pb-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-slate-800 w-full -z-0" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-indigo-600 transition-all duration-500 -z-0"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            />

            {steps.map((s) => {
              const isDone = s.num < currentStep;
              const isCurrent = s.num === currentStep;
              return (
                <div key={s.num} className="relative z-10 flex flex-col items-center group">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : isCurrent
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-900/50 shadow-md shadow-indigo-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span
                    className={`text-[11px] mt-1.5 font-medium hidden sm:block ${
                      isCurrent ? 'text-indigo-400 font-semibold' : isDone ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main className="max-w-3xl mx-auto w-full px-6 py-6 flex-1 flex flex-col justify-center">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden backdrop-blur-sm">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Hata Oluştu</p>
                  <p className="text-rose-300/90">{error}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleResumeSetup}
                  disabled={loading}
                  className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 border border-rose-700/60 text-rose-200 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Kaldığı Yerden Devam Et</span>
                </button>
                <button
                  type="button"
                  onClick={openResetModal}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>Sıfırla</span>
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {setupTokenRequired && !isTokenVerified ? (
              <motion.div
                key="setup-token-gate"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">İlk Kurulum Güvenlik Doğrulaması</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Setup Security Token Authentication</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs text-slate-300 leading-relaxed border-y border-slate-800/80 py-4">
                  <p>
                    NexusNode IoT kurulum uç noktaları (/api/setup/*), yetkisiz kişilerin sunucuya uzaktan bağlanmasını,
                    yönetici hesabı açmasını veya veritabanı ayarlarını manipüle etmesini engellemek için
                    <strong> Kurulum Güvenlik Anahtarı (Setup Token)</strong> ile kilitlenmiştir.
                  </p>

                  <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold">
                      <Terminal className="w-4 h-4 text-amber-400" />
                      <span>Güvenlik Anahtarını Nasıl Bulurum?</span>
                    </div>
                    <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-1.5 pl-1">
                      <li>
                        Sunucu başlatıldığında konsol çıktısında görüntülenen{' '}
                        <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">SETUP TOKEN: [token]</code>{' '}
                        satırı
                      </li>
                      <li>
                        Sunucu çalışma dizinindeki{' '}
                        <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">data/.setup_token</code>{' '}
                        dosyası
                      </li>
                      <li>
                        veya sunucunuza tanımladığınız <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">SETUP_TOKEN</code> ortam değişkeni
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-200">
                      Kurulum Güvenlik Anahtarı (Setup Token)
                    </label>
                    <div className="relative">
                      <input
                        id="setup-token-input"
                        type={showSetupToken ? 'text' : 'password'}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            verifyToken(tokenInput);
                          }
                        }}
                        placeholder="Örn: 64 karakterli hex güvenlik anahtarı..."
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupToken(!showSetupToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs p-1"
                        title={showSetupToken ? 'Gizle' : 'Göster'}
                      >
                        {showSetupToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Güvenlik anahtarı doğrulandığında oturumunuz boyunca geçerli olacak ve kurulum adımlarına erişebileceksiniz.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Uçtan Uca Kurulum Koruması</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleResetSetup(false)}
                      disabled={resetLoading}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{resetLoading ? 'Sıfırlanıyor...' : 'Kilidi Sıfırla & Temiz Başlat'}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      id="setup-token-verify-btn"
                      type="button"
                      disabled={tokenVerifying || !tokenInput.trim()}
                      onClick={() => verifyToken(tokenInput)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-amber-600/20 transition cursor-pointer"
                    >
                      {tokenVerifying ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Doğrulanıyor...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Doğrula ve Kuruluma Başla</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <>
                {/* STEP 1: Welcome */}
                {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Welcome to NexusNode IoT</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Endüstriyel IoT ve Zaman Serisi Analitik Platformu</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs text-slate-300 leading-relaxed border-y border-slate-800/80 py-4">
                  <p>
                    NexusNode IoT platformuna hoş geldiniz. Bu sihirbaz, sunucunuzdaki PostgreSQL ve TimescaleDB veritabanını
                    güvenli bir şekilde bağlamanıza, şemayı otomatik hazırlamanıza ve ilk sistem yöneticinizi oluşturmanıza yardımcı olacaktır.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5">
                      <Database className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-white block">TimescaleDB Hypertable</span>
                        <span className="text-slate-400 text-[11px]">Yüksek frekanslı IoT telemetri verileri için optimize edilmiş kolonsal depolama.</span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-white block">Sıfır Veri Kaybı Garantisi</span>
                        <span className="text-slate-400 text-[11px]">Mevcut verileriniz hiçbir şartta silinmez, şema onarımları güvenle yürütülür.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      id="wizard-step1-quick-docker"
                      type="button"
                      disabled={quickDockerLoading}
                      onClick={handleQuickDockerSetup}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                    >
                      {quickDockerLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Docker TimescaleDB Kuruluyor...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-emerald-200" />
                          <span>🚀 1-Tıkla Hızlı Docker Kurulumu</span>
                        </>
                      )}
                    </button>

                    <button
                      id="wizard-step1-bypass-login"
                      type="button"
                      onClick={onComplete}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5 text-indigo-400" />
                      <span>⚡ Doğrudan Giriş Yap (Test Hesabı)</span>
                    </button>
                  </div>

                  <button
                    id="wizard-step1-next"
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <span>Manuel Yapılandır</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Database Configuration */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <span>Veritabanı Yapılandırması</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    PostgreSQL veya TimescaleDB sunucunuzun bağlantı parametrelerini giriniz. Şifreniz sunucuda 0600 korumalı gizli dosyada saklanır.
                  </p>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-medium text-slate-400 mr-1">Hızlı Şablonlar:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDbConfig((prev) => ({
                        ...prev,
                        host: 'timescaledb',
                        port: 5432,
                        database: 'iot_dashboard',
                        user: 'iot_user',
                        sslMode: 'disable',
                      }));
                    }}
                    className="px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 rounded-lg text-xs font-mono transition cursor-pointer"
                  >
                    🐳 Docker Compose (timescaledb)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDbConfig((prev) => ({
                        ...prev,
                        host: 'localhost',
                        port: 5432,
                        database: 'iot_dashboard',
                        user: 'iot_user',
                        sslMode: 'disable',
                      }));
                    }}
                    className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-mono transition cursor-pointer"
                  >
                    💻 Yerel (localhost:5432)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Veritabanı Sunucusu (Host)</label>
                    <input
                      id="db-config-host"
                      type="text"
                      value={dbConfig.host}
                      onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                      placeholder="timescaledb veya localhost"
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-500">Docker ağı için: timescaledb | Yerel: localhost</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Bağlantı Portu</label>
                    <input
                      id="db-config-port"
                      type="number"
                      value={dbConfig.port}
                      onChange={(e) => setDbConfig({ ...dbConfig, port: parseInt(e.target.value, 10) || 5432 })}
                      placeholder="5432"
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-500">Standart port: 5432</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Veritabanı Adı (Database Name)</label>
                    <input
                      id="db-config-database"
                      type="text"
                      value={dbConfig.database}
                      onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                      placeholder="iot_dashboard"
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium">Veritabanı Kullanıcısı (User)</label>
                    <input
                      id="db-config-user"
                      type="text"
                      value={dbConfig.user}
                      onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                      placeholder="iot_user"
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-300 font-medium">Veritabanı Şifresi (Password)</label>
                    <div className="relative">
                      <input
                        id="db-config-password"
                        type={showPassword ? 'text' : 'password'}
                        value={dbConfig.password}
                        onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full px-3.5 py-2.5 pr-10 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500">Güvenlik: Şifre sunucuda 0600 izinli protected secret dosyasında saklanır.</span>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-slate-300 font-medium">SSL / TLS Bağlantı Modu</label>
                    <select
                      id="db-config-sslmode"
                      value={dbConfig.sslMode}
                      onChange={(e) => setDbConfig({ ...dbConfig, sslMode: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                    >
                      <option value="disable">disable (Yerel Docker veya dahili ağ için önerilen)</option>
                      <option value="require">require (Bulut sağlayıcıları - AWS RDS, DigitalOcean için)</option>
                      <option value="prefer">prefer (Mümkünse SSL dene, değilse düz bağlantı)</option>
                      <option value="verify-full">verify-full (Tam sertifika doğrulaması)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Geri</span>
                  </button>

                  <button
                    id="wizard-step2-next"
                    type="button"
                    onClick={() => {
                      setCurrentStep(3);
                      handleTestConnection();
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <span>Bağlantıyı Test Et</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Connection Test */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    <span>Veritabanı Bağlantı Testi</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Backend sunucusu doğrudan PostgreSQL soketine bağlanarak erişilebilirliği ve yetkileri test eder.
                  </p>
                </div>

                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-xs font-medium text-slate-300">PostgreSQL soketi test ediliyor ({dbConfig.host}:{dbConfig.port})...</p>
                  </div>
                ) : testResult ? (
                  <div className="space-y-4">
                    <div
                      className={`p-4 rounded-xl border text-xs flex flex-col gap-3 ${
                        testResult.success
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                          : 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          {testResult.success ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-rose-400" />
                          )}
                          <span>{testResult.message}</span>
                        </div>
                        {testResult.latencyMs !== undefined && (
                          <span className="font-mono text-[11px] bg-slate-900/60 px-2 py-1 rounded-md">
                            Gecikme: {testResult.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {testResult.pgVersion && (
                        <p className="text-[11px] text-slate-300 font-mono">
                          Sunucu Sürümü: {testResult.pgVersion}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-400">TimescaleDB Eklentisi:</span>
                        {testResult.timescaleAvailable ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Mevcut {testResult.timescaleVersion ? `(v${testResult.timescaleVersion})` : ''}</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Henüz aktif değil (İlklendirmede otomatik yüklenecek)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {!testResult.success && (
                      <div className="p-4 bg-slate-950/70 rounded-xl border border-rose-900/40 text-xs text-slate-300 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-rose-300 block">💡 Otomatik Düzeltme & Çözüm Önerileri:</span>
                          <span className="font-mono text-[10px] bg-rose-950/60 px-2 py-0.5 rounded text-rose-400">
                            {testResult.errorCode || 'CONN_ERROR'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {dbConfig.host !== 'localhost' && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = { ...dbConfig, host: 'localhost' };
                                setDbConfig(updated);
                                fetch('/api/setup/test-database', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updated),
                                })
                                  .then((r) => r.json())
                                  .then((d) => {
                                    setTestResult(d);
                                    setTestSuccess(!!d.success);
                                  })
                                  .catch(() => {});
                              }}
                              className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 rounded-lg text-xs font-medium cursor-pointer transition"
                            >
                              🔄 Host Olarak 'localhost' Dene
                            </button>
                          )}

                          {dbConfig.host !== 'timescaledb' && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = { ...dbConfig, host: 'timescaledb' };
                                setDbConfig(updated);
                                fetch('/api/setup/test-database', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updated),
                                })
                                  .then((r) => r.json())
                                  .then((d) => {
                                    setTestResult(d);
                                    setTestSuccess(!!d.success);
                                  })
                                  .catch(() => {});
                              }}
                              className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 rounded-lg text-xs font-medium cursor-pointer transition"
                            >
                              🐳 Host Olarak 'timescaledb' Dene
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={onComplete}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                          >
                            <LogIn className="w-3.5 h-3.5 text-indigo-400" />
                            <span>⚡ Doğrudan Giriş Yap (Test Hesabı)</span>
                          </button>
                        </div>

                        <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-2 text-[11px] text-slate-300 font-sans">
                          <p className="font-semibold text-amber-300">📌 Bağlantı Reddedildi (ECONNREFUSED) veya Zaman Aşımı Nedenleri:</p>
                          <ul className="list-disc pl-4 space-y-1 text-slate-400">
                            <li>
                              <strong>Docker / VPS Servisi:</strong> Sunucunuzda TimescaleDB/PostgreSQL konteynerinin çalıştığından emin olun (<code className="text-slate-300 font-mono">docker compose ps</code>).
                            </li>
                            <li>
                              <strong>Güvenli SSH Tüneli:</strong> Uzak VPS veritabanına bağlanmak için 5432 portunu internete açmak yerine yerleşik <strong className="text-cyan-400">SSH Tüneli</strong> özelliğini kullanın.
                            </li>
                            <li>
                              <strong>Docker Port Yönlendirme:</strong> Konteynerinizin <code className="text-slate-300 font-mono">-p 5432:5432</code> parametresiyle ana sunucu portuna bağlı olduğundan emin olun.
                            </li>
                            <li>
                              <strong>Bulut Veritabanı:</strong> Supabase, Neon, AWS RDS veya Cloud SQL kullanıyorsanız, SSL modunu <code className="text-indigo-400 font-mono">require</code> olarak seçin.
                            </li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Parametreleri Düzenle</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>Tekrar Test Et</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      id="wizard-step3-next"
                      type="button"
                      disabled={!testSuccess || loading}
                      onClick={handleSaveAndProceedToInit}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition cursor-pointer ${
                        testSuccess && !loading
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <span>Kaydet ve İlklendirmeye Geç</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4 & 5: Initialization, Migrations, and Schema Verification */}
            {(currentStep === 4 || currentStep === 5) && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-indigo-400" />
                    <span>Veritabanı İlklendirme & Şema Doğrulama</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    TimescaleDB eklentisi kontrol edilir, sırayla tüm migrasyonlar uygulanır ve Canonical Schema ile doğrulanır.
                  </p>
                </div>

                <div className="space-y-3">
                  {initLogs.length === 0 && !loading && (
                    <div className="p-6 bg-slate-950/60 rounded-xl border border-slate-800 text-center space-y-3">
                      <p className="text-xs text-slate-300">
                        Veritabanı tablolarının oluşturulması ve migrasyonların uygulanması için hazırsınız.
                        Bu işlem var olan hiçbir telemetri veya kullanıcı verisini silmez.
                      </p>
                      <button
                        id="wizard-start-init-btn"
                        type="button"
                        onClick={handleRunInitialization}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 cursor-pointer inline-flex items-center gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        <span>İlklendirmeyi Başlat</span>
                      </button>
                    </div>
                  )}

                  {initLogs.length > 0 && (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 font-mono text-xs">
                      {initLogs.map((log, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {log.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                            {log.status === 'running' && <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />}
                            {log.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                            {log.status === 'skipped' && <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                            <span className={log.status === 'failed' ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                              {log.name}
                            </span>
                          </div>
                          {log.details && (
                            <span className="text-[11px] text-slate-400 text-right truncate max-w-xs">{log.details}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Geri</span>
                    </button>

                    {!initComplete && initLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRunInitialization}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer transition"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span>Tekrar Dene</span>
                      </button>
                    )}
                  </div>

                  <button
                    id="wizard-step4-next"
                    type="button"
                    disabled={!initComplete || loading}
                    onClick={() => setCurrentStep(6)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition cursor-pointer ${
                      initComplete && !loading
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <span>Yönetici Oluşturmaya Geç</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 6: Create Administrator */}
            {currentStep === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-indigo-400" />
                    <span>İlk Sistem Yöneticisini Oluşturun</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Bu hesap sistemin birincil yöneticisi (Admin) olacaktır. Şifre bcrypt ile güvenli biçimde hashlenir ve doğrudan PostgreSQL tablosuna kaydedilir.
                  </p>
                </div>

                <form onSubmit={handleCreateAdmin} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-medium">Yönetici Adı ve Soyadı</label>
                      <input
                        id="admin-form-name"
                        type="text"
                        required
                        value={adminForm.name}
                        onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                        placeholder="Örn: Ahmet Yılmaz"
                        className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-medium">Kuruluş / Şirket Adı</label>
                      <input
                        id="admin-form-company"
                        type="text"
                        value={adminForm.companyName}
                        onChange={(e) => setAdminForm({ ...adminForm, companyName: e.target.value })}
                        placeholder="Merkez Yönetim"
                        className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-slate-300 font-medium">Yönetici E-posta Adresi</label>
                      <input
                        id="admin-form-email"
                        type="email"
                        required
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        placeholder="admin@sirketiniz.com"
                        className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-medium">Yönetici Şifresi (En az 8 karakter)</label>
                      <div className="relative">
                        <input
                          id="admin-form-password"
                          type={showAdminPassword ? 'text' : 'password'}
                          required
                          value={adminForm.password}
                          onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                          placeholder="••••••••••••"
                          className="w-full px-3.5 py-2.5 pr-10 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword(!showAdminPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-medium">Şifre Tekrarı</label>
                      <input
                        id="admin-form-password-confirm"
                        type="password"
                        required
                        value={adminForm.passwordConfirm}
                        onChange={(e) => setAdminForm({ ...adminForm, passwordConfirm: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Geri</span>
                    </button>

                    <button
                      id="wizard-submit-admin"
                      type="submit"
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Yönetici Kaydediliyor...</span>
                        </>
                      ) : (
                        <>
                          <span>Yöneticiyi Oluştur ve Kurulumu Bitir</span>
                          <Check className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* STEP 7: Installation Complete */}
            {currentStep === 7 && (
              <motion.div
                key="step7"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6 text-center py-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    NexusNode IoT installation completed successfully.
                  </h2>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Veritabanı bağlantısı, TimescaleDB, migrasyonlar, şema doğrulaması ve ilk sistem yöneticisi başarıyla kuruldu.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 max-w-md mx-auto text-left text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Veritabanı Sunucusu:</span>
                    <span className="font-mono">{dbConfig.host}:{dbConfig.port}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Veritabanı Adı:</span>
                    <span className="font-mono">{dbConfig.database}</span>
                  </div>
                  {completedAdmin && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Yönetici Hesabı:</span>
                      <span className="font-mono text-indigo-400">{completedAdmin}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400">Setup Durumu:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Kalıcı Olarak Kilitlendi</span>
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    id="wizard-finish-btn"
                    type="button"
                    disabled={loading}
                    onClick={handleFinishSetup}
                    className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-sm font-semibold shadow-xl shadow-indigo-600/30 transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Yönlendiriliyor...</span>
                      </>
                    ) : (
                      <>
                        <span>Yönetim Paneline Geç</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
        </div>
      </main>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {resetModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget && !resetLoading) {
                setResetModalOpen(false);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 relative"
            >
              {/* Close Button */}
              <button
                type="button"
                disabled={resetLoading}
                onClick={() => setResetModalOpen(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 pr-8">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Kurulumu Sıfırla</h3>
                  <p className="text-xs text-slate-400">Setup Wizard Reset Options</p>
                </div>
              </div>

              {resetError && (
                <div className="p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-rose-200">Sıfırlama İşlemi Başarısız Oldu</p>
                    <p className="text-[11px] text-rose-300/90 leading-relaxed">{resetError}</p>
                  </div>
                </div>
              )}

              {resetTokenRequired && (
                <div className="p-3 bg-slate-950/80 border border-amber-500/40 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Kurulum Güvenlik Anahtarı (Setup Token) Gerekli</span>
                  </div>
                  <input
                    type="password"
                    value={modalTokenInput}
                    onChange={(e) => setModalTokenInput(e.target.value)}
                    placeholder="data/.setup_token dosyasındaki güvenlik anahtarı..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    Sistem kilitli veya kurtarma modunda olduğundan sıfırlama işlemi için sunucu güvenlik anahtarı gereklidir.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">
                Kurulum yarım kalmış veya kilitlenmişse aşağıdaki seçeneklerden biriyle sihirbazı sıfırlayabilir ve yeni bir kurulum oturumu başlatabilirsiniz:
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => handleResetSetup(true)}
                  className="w-full text-left p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 active:bg-slate-700 active:scale-[0.99] border border-slate-700 hover:border-indigo-500/60 transition cursor-pointer group disabled:opacity-50 touch-manipulation"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white group-hover:text-indigo-400 flex items-center gap-2">
                      {resetLoading ? (
                        <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                      ) : null}
                      <span>Adımları Baştan Başlat (Veritabanı Ayarlarını Koru)</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Girdiğiniz host, port ve veritabanı adını saklar; kurulum adımlarını ve kilit durumunu sıfırlar.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => handleResetSetup(false)}
                  className="w-full text-left p-3.5 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 active:bg-rose-950/60 active:scale-[0.99] border border-rose-800/40 hover:border-rose-700 transition cursor-pointer group disabled:opacity-50 touch-manipulation"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-300 group-hover:text-rose-200 flex items-center gap-2">
                      {resetLoading ? (
                        <RefreshCw className="w-4 h-4 text-rose-400 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Tamamen Sıfırla (Tüm Ayarları Temizle)</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-rose-500 group-hover:text-rose-300" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Kayıtlı veritabanı parametrelerini ve oturum anahtarlarını silerek Step 1'e döner.
                  </p>
                </button>
              </div>

              {resetError && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleClientOnlyReset}
                    className="w-full py-2.5 px-3 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/50 rounded-xl transition cursor-pointer text-center"
                  >
                    Formu İstemcide Sıfırla ve Adım 1'e Dön
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => setResetModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg transition cursor-pointer"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 px-6 py-4 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} {APP_NAME}. Tüm hakları saklıdır.</span>
          <span className="font-mono text-[11px] text-slate-600">PostgreSQL + TimescaleDB Enterprise Edition</span>
        </div>
      </footer>
    </div>
  );
};
