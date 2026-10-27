import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetch as fetch } from '../lib/apiFetch';
import { 
  Lock, 
  UserCheck, 
  ArrowRight, 
  Sparkles, 
  Sun, 
  Moon, 
  LogIn, 
  UserPlus, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info,
  Mail,
  KeyRound,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { NexusNodeLogo } from './NexusNodeLogo';

interface DbStatusData {
  dbEngine: 'postgres' | 'local' | 'disconnected';
  dbEngineLabel: string;
  dbStatus: 'connected' | 'connecting' | 'disconnected' | 'error' | 'setup_required';
  dbStatusLabel: string;
  dbStatusColor: 'emerald' | 'amber' | 'rose' | 'slate';
  dbMessage: string;
  isPostgresConfigured: boolean;
  isPostgresConnected: boolean;
  isPostgresReady: boolean;
  databaseState?: string;
  pool?: {
    totalCount: number;
    idleCount: number;
    activeCount: number;
    max: number;
  };
  uptimeSeconds?: number;
  timestamp?: string;
}

export const LoginView: React.FC = () => {
  const { login, register, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'operator'>('customer');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password reset specific states
  const [resetToken, setResetToken] = useState('');
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenVerificationError, setTokenVerificationError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);

  // Database Connection Status State
  const [dbStatusData, setDbStatusData] = useState<DbStatusData | null>(null);
  const [isDbFetching, setIsDbFetching] = useState<boolean>(false);
  const [isDbPopoverOpen, setIsDbPopoverOpen] = useState<boolean>(false);

  const fetchDbStatus = useCallback(async () => {
    setIsDbFetching(true);
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatusData({
          dbEngine: data.dbEngine || (data.activeEngine === 'postgres' ? 'postgres' : 'local'),
          dbEngineLabel: data.dbEngineLabel || (data.activeEngine === 'postgres' ? 'PostgreSQL / TimescaleDB' : 'Yerel Depolama (In-Memory / WAL)'),
          dbStatus: data.dbStatus || (data.isReady ? 'connected' : 'error'),
          dbStatusLabel: data.dbStatusLabel || (data.isReady ? (data.activeEngine === 'postgres' ? 'PostgreSQL Bağlı & Aktif' : 'Yerel Mod Aktif') : 'Bağlantı Hatası'),
          dbStatusColor: data.dbStatusColor || (data.isReady ? (data.activeEngine === 'postgres' ? 'emerald' : 'amber') : 'rose'),
          dbMessage: data.dbMessage || (data.isReady ? 'Veritabanı bağlantısı hazır.' : 'Veritabanı sunucusuna erişilemiyor.'),
          isPostgresConfigured: !!data.isPostgresConfigured,
          isPostgresConnected: !!data.isPostgresConnected,
          isPostgresReady: !!data.isPostgresReady,
          databaseState: data.databaseState,
          pool: data.pool,
          uptimeSeconds: data.uptimeSeconds,
          timestamp: data.timestamp
        });
      } else {
        setDbStatusData((prev) => ({
          dbEngine: 'disconnected',
          dbEngineLabel: 'PostgreSQL (Erişilemiyor)',
          dbStatus: 'error',
          dbStatusLabel: 'Sunucu Bağlantı Hatası',
          dbStatusColor: 'rose',
          dbMessage: 'Sunucudan veritabanı durum bilgisi alınamadı (HTTP ' + res.status + ').',
          isPostgresConfigured: prev?.isPostgresConfigured ?? true,
          isPostgresConnected: false,
          isPostgresReady: false
        }));
      }
    } catch {
      setDbStatusData({
        dbEngine: 'disconnected',
        dbEngineLabel: 'PostgreSQL (Çevrimdışı)',
        dbStatus: 'error',
        dbStatusLabel: 'Bağlı Değil / Hata',
        dbStatusColor: 'rose',
        dbMessage: 'Sunucuya ulaşılamıyor veya ağ bağlantısı yok.',
        isPostgresConfigured: true,
        isPostgresConnected: false,
        isPostgresReady: false
      });
    } finally {
      setIsDbFetching(false);
    }
  }, []);

  // Token Verification
  const verifyToken = useCallback(async (tokenToVerify: string) => {
    setIsVerifyingToken(true);
    setTokenVerificationError('');
    try {
      const res = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(tokenToVerify)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setTokenVerificationError(data.error || 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.');
      } else {
        setMaskedEmail(data.emailMasked || '');
      }
    } catch {
      setTokenVerificationError('Bağlantı doğrulanamadı. Lütfen sunucu bağlantınızı kontrol ediniz.');
    } finally {
      setIsVerifyingToken(false);
    }
  }, []);

  // Detect ?token=... or #reset-password?token=... in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');

    if (!token && window.location.hash) {
      const hash = window.location.hash;
      const match = hash.match(/[?&]token=([^&]+)/) || hash.match(/token=([^&]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (token) {
      setResetToken(token);
      setAuthMode('reset-password');
      verifyToken(token);
    }
  }, [verifyToken]);

  useEffect(() => {
    fetchDbStatus();
    const interval = setInterval(fetchDbStatus, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, [fetchDbStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (authMode === 'register') {
      if (!name.trim()) {
        setError('Lütfen adınızı ve soyadınızı giriniz.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Şifreler birbiriyle eşleşmiyor.');
        return;
      }
      if (password.length < 6) {
        setError('Şifre en az 6 karakter olmalıdır.');
        return;
      }

      try {
        await register(name, email, password, role);
        setSuccessMsg('Kayıt başarılı! Hesabınız oluşturuldu ve oturum açıldı.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Kayıt oluşturulamadı.';
        setError(msg);
      }
    } else {
      // Normal login
      if (!email.trim() || !password) {
        setError('Lütfen e-posta adresinizi ve şifrenizi giriniz.');
        return;
      }
      try {
        await login(email, password);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Giriş yapılamadı. Lütfen e-posta ve şifrenizi kontrol ediniz.';
        setError(msg);
      }
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotSuccessMsg('');

    if (!email.trim() || !email.includes('@')) {
      setError('Lütfen geçerli bir e-posta adresi giriniz.');
      return;
    }

    setIsSubmittingForgot(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'İstek gönderilemedi.');
      }
      setForgotSuccessMsg(
        data.message ||
        'Eğer bu e-posta adresi sistemimizde kayıtlı ise, şifre sıfırlama talimatları ve bağlantısı gönderilmiştir.'
      );
    } catch (err: any) {
      setError(err.message || 'İstek işlenirken bir sorun oluştu.');
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Yeni şifreniz en az 8 karakter olmalıdır.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Şifre güncellenemedi.');
      }
      setResetPasswordSuccess(true);
      setSuccessMsg(data.message || 'Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz.');

      // Return to login mode after 3 seconds
      setTimeout(() => {
        setAuthMode('login');
        setPassword('');
        setConfirmPassword('');
        setResetPasswordSuccess(false);
        if (window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }, 3500);
    } catch (err: any) {
      setError(err.message || 'Şifre güncellenirken bir sorun oluştu.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Helper colors for database status
  const getBadgeBg = (color?: string) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'rose':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  const getDotClass = (color?: string) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      case 'amber':
        return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]';
      case 'rose':
        return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      {/* Top right control bar: Database Status Widget & Theme Toggle */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 sm:gap-3">
        {/* Live Database Status Widget */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDbPopoverOpen(!isDbPopoverOpen)}
            className={`px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border shadow-md hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer ${
              dbStatusData?.dbStatusColor === 'rose'
                ? 'border-rose-300 dark:border-rose-800/80 text-rose-600 dark:text-rose-400'
                : dbStatusData?.dbStatusColor === 'emerald'
                ? 'border-emerald-300 dark:border-emerald-800/80 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-300 dark:border-amber-800/80 text-amber-600 dark:text-amber-400'
            }`}
            title="Veritabanı Bağlantı Durumu"
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getDotClass(dbStatusData?.dbStatusColor)}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${getDotClass(dbStatusData?.dbStatusColor)}`} />
            </span>
            <span className="hidden sm:inline">
              {dbStatusData?.dbStatusLabel || 'Veritabanı Kontrol Ediliyor...'}
            </span>
          </button>

          {/* Database Info Popover */}
          {isDbPopoverOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-500" />
                  Veritabanı Durumu
                </span>
                <button
                  type="button"
                  onClick={fetchDbStatus}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Yenile"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDbFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Veritabanı Tipi:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {dbStatusData?.dbEngineLabel || 'Bilinmiyor'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Bağlantı Durumu:</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${getBadgeBg(dbStatusData?.dbStatusColor)}`}>
                    {dbStatusData?.dbStatusColor === 'emerald' && <CheckCircle2 className="w-3 h-3" />}
                    {dbStatusData?.dbStatusColor === 'amber' && <AlertTriangle className="w-3 h-3" />}
                    {dbStatusData?.dbStatusColor === 'rose' && <XCircle className="w-3 h-3" />}
                    {dbStatusData?.dbStatusLabel || 'Kontrol Ediliyor...'}
                  </span>
                </div>

                {dbStatusData?.pool && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Bağlantı Havuzu:</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {dbStatusData.pool.activeCount} / {dbStatusData.pool.max} Aktif
                    </span>
                  </div>
                )}
              </div>

              {/* Status Message */}
              <div className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${
                dbStatusData?.dbStatusColor === 'rose'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  : dbStatusData?.dbStatusColor === 'emerald'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
              }`}>
                <div className="flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{dbStatusData?.dbMessage || 'Veritabanı durumu yükleniyor...'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
          title={theme === 'dark' ? 'Açık Moda Geç' : 'Karanlık Moda Geç'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          <span className="hidden sm:inline">{theme === 'dark' ? 'Açık Tema' : 'Karanlık Tema'}</span>
        </button>
      </div>

      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-indigo-500/10 dark:bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-emerald-500/10 dark:bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <NexusNodeLogo variant="stacked" size="lg" showDomain={true} animated={true} />
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-full mt-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {authMode === 'register' && 'Müşteri Kayıt Portalı'}
              {authMode === 'login' && 'Müşteri & IoT Cihaz Girişi'}
              {authMode === 'forgot-password' && 'Güvenli Hesap Kurtarma'}
              {authMode === 'reset-password' && 'Yeni Şifre Belirleme'}
            </span>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {authMode === 'register' && 'Yeni Hesap Oluştur'}
            {authMode === 'login' && 'Giriş Yapın'}
            {authMode === 'forgot-password' && 'Şifrenizi mi Unuttunuz?'}
            {authMode === 'reset-password' && 'Yeni Şifrenizi Belirleyin'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {authMode === 'register' && 'Müşteri hesabı açarak cihazlarınızı güvenle izleyin ve yönetin.'}
            {authMode === 'login' && 'E-posta adresiniz ve şifrenizle IoT platformuna hemen erişin.'}
            {authMode === 'forgot-password' && 'Kayıtlı e-posta adresinizi girin. Size tek kullanımlık güvenli şifre sıfırlama bağlantısı gönderelim.'}
            {authMode === 'reset-password' && 'Hesabınız için güçlü ve yeni bir şifre belirleyerek güvenliğinizi sağlayın.'}
          </p>
        </div>

        {/* Form Container Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xl dark:shadow-2xl space-y-6">
          {/* Database Live Banner inside Form */}
          <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-medium transition-colors ${getBadgeBg(dbStatusData?.dbStatusColor)}`}>
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold block">
                  {dbStatusData?.dbEngineLabel || 'Veritabanı Durumu Kontrol Ediliyor...'}
                </span>
                <span className="text-[11px] opacity-80 block">
                  {dbStatusData?.dbStatusLabel || 'Bağlantı bekleniyor...'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchDbStatus}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDbFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Mode Switcher Tabs (Only visible in login & register modes) */}
          {(authMode === 'login' || authMode === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setSuccessMsg('');
                }}
                className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Giriş Yap</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setSuccessMsg('');
                }}
                className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  authMode === 'register'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Yeni Kayıt</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-center gap-2 font-medium">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2 font-medium">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ================= MODE 1 & 2: LOGIN / REGISTER ================= */}
          {(authMode === 'login' || authMode === 'register') && (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      Ad Soyad
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ör. Ahmet Yılmaz"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      Hesap Türü / Rol
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as 'customer' | 'operator')}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    >
                      <option value="customer">Müşteri Portalı Hesabı (Kendi cihazlarını izleme)</option>
                      <option value="operator">Saha / Sistem Operatörü</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  E-posta Adresi
                </label>
                <input
                  type="email"
                  required
                  placeholder="ör. yonetici@sirket.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">
                    Şifre
                  </label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot-password');
                        setError('');
                        setSuccessMsg('');
                        setForgotSuccessMsg('');
                      }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                    >
                      Şifremi Unuttum?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                    Şifre Tekrar
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                <span>
                  {isLoading
                    ? authMode === 'register'
                      ? 'Kayıt Yapılıyor...'
                      : 'Giriş Yapılıyor...'
                    : authMode === 'register'
                    ? 'Kayıt Ol ve Giriş Yap'
                    : 'Sisteme Giriş Yap'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ================= MODE 3: FORGOT PASSWORD (OWASP) ================= */}
          {authMode === 'forgot-password' && (
            <div className="space-y-4 text-xs">
              {forgotSuccessMsg ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-2xl space-y-3 leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold text-sm mb-1 text-slate-900 dark:text-white">
                        Sıfırlama Talebi Alındı
                      </strong>
                      <p>{forgotSuccessMsg}</p>
                    </div>
                  </div>
                  <div className="p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                    ⏱️ Güvenliğiniz için bağlantı <strong>15 dakika</strong> geçerlidir. E-posta birkaç dakika içinde gelen kutunuza veya spam klasörünüze ulaşacaktır.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setForgotSuccessMsg('');
                      setError('');
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Giriş Ekranına Dön</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl text-indigo-700 dark:text-indigo-300 flex items-start gap-2">
                    <Mail className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <span>
                      Hesabınıza kayıtlı e-posta adresinizi giriniz. Tek kullanımlık şifre yenileme bağlantısı e-posta adresinize iletilecektir.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      Kayıtlı E-posta Adresi
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="ör. adiniz@sirket.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingForgot}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingForgot ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sıfırlama Bağlantısı Gönderiliyor...</span>
                      </>
                    ) : (
                      <>
                        <span>Sıfırlama Bağlantısı Gönder</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setError('');
                        setForgotSuccessMsg('');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Giriş Ekranına Geri Dön</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ================= MODE 4: RESET PASSWORD WITH TOKEN ================= */}
          {authMode === 'reset-password' && (
            <div className="space-y-4 text-xs">
              {isVerifyingToken ? (
                <div className="p-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    Sıfırlama bağlantısı doğrulanıyor...
                  </p>
                </div>
              ) : tokenVerificationError ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 rounded-2xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold text-sm mb-1 text-slate-900 dark:text-white">
                        Geçersiz veya Süresi Dolmuş Bağlantı
                      </strong>
                      <p>{tokenVerificationError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot-password');
                      setError('');
                      setTokenVerificationError('');
                    }}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Yeni Bir Bağlantı Talep Edin</span>
                  </button>
                </div>
              ) : resetPasswordSuccess ? (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-2xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Şifreniz Başarıyla Güncellendi!
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Tüm aktif oturumlarınız sonlandırıldı. Giriş ekranına yönlendiriliyorsunuz...
                  </p>
                </div>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  {maskedEmail && (
                    <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Hesap:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{maskedEmail}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      Yeni Şifre (En az 8 karakter)
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      Yeni Şifre Tekrar
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      Güvenlik Kriterleri:
                    </div>
                    <p>• En az 8 karakter uzunluğunda olmalıdır.</p>
                    <p>• Yeni şifreniz kaydedildiğinde diğer cihazlardaki açık oturumlarınız otomatik kapatılır.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReset}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingReset ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Yeni Şifre Kaydediliyor...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>Yeni Şifreyi Kaydet ve Giriş Yap</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setError('');
                        if (window.history.replaceState) {
                          window.history.replaceState(null, '', window.location.pathname);
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Giriş Ekranına Dön</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Toggle link below form (only for login / register) */}
          {authMode === 'login' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                Hesabınız yok mu? Yeni Müşteri Kaydı Oluşturun
              </button>
            </div>
          )}

          {authMode === 'register' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                Zaten bir hesabınız var mı? Giriş Yapın
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
