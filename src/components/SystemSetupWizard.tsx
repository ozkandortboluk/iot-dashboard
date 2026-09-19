import React, { useState, useEffect } from 'react';
import {
  Database,
  ShieldCheck,
  Server,
  CheckCircle2,
  AlertTriangle,
  Lock,
  User as UserIcon,
  Mail,
  Building2,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Check,
  Terminal,
  Layers,
  KeyRound,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { SystemSetupStatus } from '../types';
import { APP_NAME, APP_VERSION } from '../config/version';

interface SystemSetupWizardProps {
  setupStatus: SystemSetupStatus | null;
  onComplete: () => Promise<any>;
}

export const SystemSetupWizard: React.FC<SystemSetupWizardProps> = ({
  setupStatus,
  onComplete,
}) => {
  const { setup, setupDatabase, login, user, token } = useAuth();

  // Wizard state: 1 = Admin Creation, 2 = PostgreSQL Configuration, 3 = Completion
  const [currentStep, setCurrentStep] = useState<number>(() => {
    if (setupStatus?.needAdminSetup) return 1;
    if (setupStatus?.needDatabaseConfig) return 2;
    return 1;
  });

  // Admin form state
  const [adminName, setAdminName] = useState('Sistem Yöneticisi');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('Endüstriyel Tesis');
  const [seedDemoData, setSeedDemoData] = useState(true);

  // Admin re-auth (if admin exists but not logged in when DB config is needed)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);

  // PostgreSQL form state
  const [connectionMode, setConnectionMode] = useState<'url' | 'params'>('url');
  const [postgresUrl, setPostgresUrl] = useState(() => {
    return setupStatus?.postgresConfig?.postgresUrl && !setupStatus.postgresConfig.postgresUrl.includes('••••••••')
      ? setupStatus.postgresConfig.postgresUrl
      : '';
  });

  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('nexusnode_iot');
  const [dbUser, setDbUser] = useState('postgres');
  const [dbPass, setDbPass] = useState('');
  const [dbSsl, setDbSsl] = useState(false);

  // Action states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    version?: string;
    latencyMs?: number;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    message: string;
    tablesCreated?: string[];
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Update step if setupStatus changes externally
  useEffect(() => {
    if (setupStatus?.needAdminSetup) {
      setCurrentStep(1);
    } else if (setupStatus?.needDatabaseConfig) {
      setCurrentStep(2);
    }
  }, [setupStatus?.needAdminSetup, setupStatus?.needDatabaseConfig]);

  // Compute composite PostgreSQL URL from discrete parameters if in 'params' mode
  const getEffectivePostgresUrl = (): string => {
    if (connectionMode === 'url') {
      return postgresUrl.trim();
    }
    const encodedUser = encodeURIComponent(dbUser.trim());
    const encodedPass = encodeURIComponent(dbPass);
    const host = dbHost.trim() || 'localhost';
    const port = dbPort.trim() || '5432';
    const database = dbName.trim() || 'nexusnode_iot';
    const sslParam = dbSsl ? '?sslmode=require' : '';
    return `postgresql://${encodedUser}:${encodedPass}@${host}:${port}/${database}${sslParam}`;
  };

  // Step 1: Submit Admin creation
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!adminName.trim() || !adminEmail.trim() || !adminPassword) {
      setErrorMessage('Lütfen tüm zorunlu alanları doldurunuz.');
      return;
    }

    if (adminPassword.length < 8) {
      setErrorMessage('Yönetici şifresi en az 8 karakter uzunluğunda olmalıdır.');
      return;
    }

    if (adminPassword !== adminConfirmPassword) {
      setErrorMessage('Girilen şifreler birbiriyle uyuşmuyor.');
      return;
    }

    setIsSubmitting(true);
    try {
      await setup(
        adminName.trim(),
        adminEmail.trim().toLowerCase(),
        adminPassword,
        companyName.trim(),
        seedDemoData
      );

      setSuccessMessage('Yönetici hesabı başarıyla oluşturuldu! Şimdi PostgreSQL veritabanı yapılandırmasına geçiliyor...');
      setTimeout(() => {
        setSuccessMessage(null);
        setCurrentStep(2);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Yönetici hesabı oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin login if returning to an existing instance that needs DB setup
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsVerifyingAdmin(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      setSuccessMessage('Yönetici yetkisi doğrulandı.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Hatalı yönetici kimlik bilgileri.');
    } finally {
      setIsVerifyingAdmin(false);
    }
  };

  // Test PostgreSQL Connection
  const handleTestConnection = async () => {
    const url = getEffectivePostgresUrl();
    if (!url) {
      setErrorMessage('Lütfen test edilecek PostgreSQL bağlantı URL adresini giriniz.');
      return;
    }

    setIsTesting(true);
    setErrorMessage(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/auth/test-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl: url }),
      });
      const data = await res.json();
      setTestResult(data);
      if (!data.success) {
        setErrorMessage(data.message || 'PostgreSQL bağlantı testi başarısız.');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Sunucuya ulaşılamadı.',
      });
      setErrorMessage(err.message || 'Sunucuya ulaşılamadı.');
    } finally {
      setIsTesting(false);
    }
  };

  // Step 2: Configure PostgreSQL & Run Migrations
  const handleConfigureDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setMigrationResult(null);

    const url = getEffectivePostgresUrl();
    if (!url) {
      setErrorMessage('PostgreSQL bağlantı adresi gereklidir.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await setupDatabase(url);
      setMigrationResult(result);
      setSuccessMessage('PostgreSQL veritabanı başarıyla bağlandı ve IoT şeması kuruldu!');
      setCurrentStep(3);

      setTimeout(async () => {
        await onComplete();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Veritabanı yapılandırması başarısız oldu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasAdminSession = Boolean(user && user.role === 'admin') || Boolean(token);
  const requiresAdminLogin = !setupStatus?.needAdminSetup && setupStatus?.needDatabaseConfig && !hasAdminSession;

  return (
    <div id="system-setup-wizard" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 border-b border-slate-800 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                <Database className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold text-white tracking-tight">{APP_NAME} Kurulum Sihirbazı</h1>
                  <span className="px-2 py-0.5 text-xs font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-full">
                    {APP_VERSION}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tam PostgreSQL Mimari Entegrasyonu & İlk Yönetici Yapılandırması
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center space-x-2 text-xs font-medium text-amber-400 bg-amber-950/50 border border-amber-800/40 px-3 py-1.5 rounded-lg">
              <Lock className="w-3.5 h-3.5" />
              <span>Sistem Kilitli (Kurulum Tamamlanmalı)</span>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-800/80">
            <div
              className={`flex items-center space-x-3 p-2.5 rounded-xl border transition-all ${
                currentStep === 1
                  ? 'bg-indigo-900/30 border-indigo-500/40 text-indigo-300'
                  : currentStep > 1
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800/30 border-slate-800 text-slate-500'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : currentStep === 1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <div>
                <p className="text-xs font-semibold leading-none">Yönetici Hesabı</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {currentStep > 1 ? 'Oluşturuldu' : 'İlk Admin Hesabı'}
                </p>
              </div>
            </div>

            <div
              className={`flex items-center space-x-3 p-2.5 rounded-xl border transition-all ${
                currentStep === 2
                  ? 'bg-indigo-900/30 border-indigo-500/40 text-indigo-300'
                  : currentStep === 3
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800/30 border-slate-800 text-slate-500'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  currentStep === 3
                    ? 'bg-emerald-600 text-white'
                    : currentStep === 2
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentStep === 3 ? <Check className="w-4 h-4" /> : '2'}
              </div>
              <div>
                <p className="text-xs font-semibold leading-none">PostgreSQL Yapılandırması</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {currentStep === 3 ? 'Bağlandı & Şema Hazır' : 'Bağlantı & Şema Kurulumu'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-6 p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start space-x-3 text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-6 p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start space-x-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="flex-1 font-medium">{successMessage}</div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6">
          {/* STEP 1: CREATE ADMIN ACCOUNT */}
          {currentStep === 1 && (
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Adım 1: Süper Yönetici (Admin) Hesabı</span>
                </div>
                <p className="text-xs text-slate-400">
                  Sistemde kayıtlı bir yönetici bulunamadı. Lütfen IoT platformunun tam yetkili ilk süper yöneticisini oluşturun. Bu hesap oluşturulduktan sonra doğrudan PostgreSQL veritabanı bağlantı ekranına yönlendirileceksiniz.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Yönetici Adı & Soyadı <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Örn: Ahmet Yılmaz"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Şirket / Tesis Adı <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Örn: Nexus IoT Tesisleri"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Yönetici E-Posta Adresi <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@sirketiniz.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Yönetici Şifresi <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="En az 8 karakter"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Şifre Tekrarı <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      placeholder="Şifrenizi tekrar girin"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-200">Başlangıç IoT Cihaz & Pano Şablonları</p>
                    <p className="text-[11px] text-slate-400">İlk inceleme için örnek sensör ve dashboard verilerini ekle</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={seedDemoData}
                  onChange={(e) => setSeedDemoData(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Yönetici Oluşturuluyor...</span>
                    </>
                  ) : (
                    <>
                      <span>Yöneticiyi Oluştur ve PostgreSQL Adımına Geç</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: POSTGRESQL DATABASE CONFIGURATION */}
          {currentStep === 2 && (
            <div>
              {/* If admin exists in the system but user has no active session, ask for admin auth first */}
              {requiresAdminLogin ? (
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-300 text-xs">
                    <div className="flex items-center space-x-2 font-semibold mb-1">
                      <KeyRound className="w-4 h-4" />
                      <span>Yönetici Doğrulaması Gerekli</span>
                    </div>
                    Sistemde mevcut bir yönetici hesabı bulunmaktadır. PostgreSQL veritabanı bağlantısını yapılandırmak için lütfen yönetici girişinizi yapınız.
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Yönetici E-Posta</label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@sirketiniz.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Yönetici Şifresi</label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Şifreniz"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingAdmin}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isVerifyingAdmin ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    <span>Yönetici Olarak Giriş Yap & Devam Et</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfigureDatabase} className="space-y-5">
                  <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
                        <Server className="w-4 h-4" />
                        <span>Adım 2: PostgreSQL Veritabanı Bilgileri</span>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">
                        Zorunlu Motor: PostgreSQL
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Yerel JSON veritabanı tamamen devre dışı bırakılmıştır. Sistemin tüm telemetri kayıtları, cihaz eşleştirmeleri, kullanıcılar ve dashboard düzenleri için PostgreSQL bağlantısı zorunludur.
                    </p>
                  </div>

                  {/* Mode switch */}
                  <div className="flex border-b border-slate-800 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setConnectionMode('url')}
                      className={`pb-2.5 px-4 flex items-center space-x-2 border-b-2 transition-all ${
                        connectionMode === 'url'
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-transparent text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Bağlantı URL (Connection String)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectionMode('params')}
                      className={`pb-2.5 px-4 flex items-center space-x-2 border-b-2 transition-all ${
                        connectionMode === 'params'
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-transparent text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Ayrıntılı Parametreler (Host/Port/Kullanıcı)</span>
                    </button>
                  </div>

                  {connectionMode === 'url' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        PostgreSQL Connection URI <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={postgresUrl}
                        onChange={(e) => setPostgresUrl(e.target.value)}
                        placeholder="postgresql://username:password@localhost:5432/nexusnode_iot?sslmode=disable"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-emerald-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span className="text-slate-500">Hızlı Şablonlar:</span>
                        <button
                          type="button"
                          onClick={() => setPostgresUrl('postgresql://postgres:postgres@localhost:5432/nexusnode_iot?sslmode=disable')}
                          className="hover:text-indigo-400 underline underline-offset-2"
                        >
                          Yerel Docker / Postgres
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setPostgresUrl('postgresql://postgres:[SIFRE]@[HOST].supabase.co:5432/postgres?sslmode=require')}
                          className="hover:text-indigo-400 underline underline-offset-2"
                        >
                          Supabase
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setPostgresUrl('postgresql://[KULLANICI]:[SIFRE]@[HOST].neon.tech/neondb?sslmode=require')}
                          className="hover:text-indigo-400 underline underline-offset-2"
                        >
                          Neon
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Host / Sunucu</label>
                        <input
                          type="text"
                          required
                          value={dbHost}
                          onChange={(e) => setDbHost(e.target.value)}
                          placeholder="localhost"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
                        <input
                          type="text"
                          required
                          value={dbPort}
                          onChange={(e) => setDbPort(e.target.value)}
                          placeholder="5432"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Veritabanı Adı (Database)</label>
                        <input
                          type="text"
                          required
                          value={dbName}
                          onChange={(e) => setDbName(e.target.value)}
                          placeholder="nexusnode_iot"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Kullanıcı (User)</label>
                        <input
                          type="text"
                          required
                          value={dbUser}
                          onChange={(e) => setDbUser(e.target.value)}
                          placeholder="postgres"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Şifre (Password)</label>
                        <input
                          type="password"
                          value={dbPass}
                          onChange={(e) => setDbPass(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="flex items-center space-x-3 pt-6">
                        <input
                          type="checkbox"
                          id="ssl-toggle"
                          checked={dbSsl}
                          onChange={(e) => setDbSsl(e.target.checked)}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                        />
                        <label htmlFor="ssl-toggle" className="text-xs text-slate-300 font-medium cursor-pointer">
                          SSL Bağlantısını Zorunlu Kıl (sslmode=require)
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Test Status Banner */}
                  {testResult && (
                    <div
                      className={`p-4 rounded-xl border text-xs flex items-start space-x-3 ${
                        testResult.success
                          ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{testResult.message}</p>
                        {testResult.version && (
                          <p className="text-[11px] opacity-80 mt-1">Sunucu Sürümü: {testResult.version}</p>
                        )}
                        {testResult.latencyMs !== undefined && (
                          <p className="text-[11px] opacity-80">Yanıt Gecikmesi: {testResult.latencyMs} ms</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || isSubmitting}
                      className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                    >
                      {isTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Bağlantı Test Ediliyor...</span>
                        </>
                      ) : (
                        <>
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Bağlantıyı Test Et</span>
                        </>
                      )}
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting || isTesting}
                      className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>PostgreSQL Bağlanıyor & Tablolar Kuruluyor...</span>
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          <span>Veritabanını Bağla & Sistemi Aç</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* STEP 3: SUCCESS & ACTIVATION */}
          {currentStep === 3 && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">Kurulum Başarıyla Tamamlandı!</h2>
              <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                Yönetici hesabı tanımlandı, PostgreSQL bağlantısı doğrulandı ve tüm IoT telemetri tabloları migrate edildi. Sistem açılıyor...
              </p>
              {migrationResult?.tablesCreated && (
                <div className="max-w-md mx-auto p-3 bg-slate-950 border border-slate-800 rounded-xl text-left">
                  <p className="text-[11px] font-mono text-slate-400 mb-1 font-semibold">Aktif Tablolar:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {migrationResult.tablesCreated.map((t) => (
                      <span key={t} className="px-2 py-0.5 text-[10px] font-mono bg-slate-900 border border-slate-800 text-emerald-400 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-2">
                <div className="inline-flex items-center space-x-2 text-xs font-semibold text-indigo-400 bg-indigo-950/60 px-4 py-2 rounded-full border border-indigo-800/50">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Platform Konsoluna Yönlendiriliyorsunuz...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
