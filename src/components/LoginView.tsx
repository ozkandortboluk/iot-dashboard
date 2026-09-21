import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  Server,
  ChevronDown,
  ChevronUp,
  Info
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
  
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'operator'>('customer');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
            <span className="font-bold text-xs">
              {dbStatusData ? (
                dbStatusData.dbEngine === 'postgres'
                  ? 'PostgreSQL (Aktif)'
                  : dbStatusData.dbEngine === 'local'
                  ? 'Yerel Depolama'
                  : 'PostgreSQL Bağlı Değil'
              ) : (
                'Yükleniyor...'
              )}
            </span>
            {isDbPopoverOpen ? (
              <ChevronUp className="w-3.5 h-3.5 opacity-60 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
            )}
          </button>

          {/* Database Status Popover Card */}
          {isDbPopoverOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 z-40 text-xs space-y-3 transition-all animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                  <Server className="w-4 h-4 text-indigo-500" />
                  <span>Veritabanı Durumu</span>
                </div>
                <button
                  type="button"
                  onClick={fetchDbStatus}
                  disabled={isDbFetching}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  title="Yenile"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDbFetching ? 'animate-spin text-indigo-500' : ''}`} />
                </button>
              </div>

              {/* Status Row */}
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

                {dbStatusData?.databaseState && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Sistem Durum Kodu:</span>
                    <span className="font-mono font-semibold text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                      {dbStatusData.databaseState}
                    </span>
                  </div>
                )}
              </div>

              {/* Status Message / Info Box */}
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

              {/* Troubleshooting hint if not ready */}
              {dbStatusData?.dbStatusColor === 'rose' && (
                <div className="p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-[10px] text-slate-600 dark:text-slate-400">
                  💡 <strong>Giriş İpucu:</strong> Veritabanı yanıt vermediği için oturum açma işlemleri başarısız olabilir. Lütfen PostgreSQL servisinizin çalıştığından emin olun veya birkaç saniye sonra tekrar deneyin.
                </div>
              )}
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
              {authMode === 'register' ? 'Müşteri Kayıt Portalı' : 'Müşteri & IoT Cihaz Girişi'}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {authMode === 'register' ? 'Yeni Hesap Oluştur' : 'Giriş Yapın'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {authMode === 'register'
              ? 'Müşteri hesabı açarak cihazlarınızı güvenle izleyin ve yönetin.'
              : 'E-posta adresiniz ve şifrenizle IoT platformuna hemen erişin.'}
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

          {/* Warning Banner if Database in Error state */}
          {dbStatusData?.dbStatusColor === 'rose' && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-start gap-2.5 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5">PostgreSQL Veritabanı Bağlantı Hatası</strong>
                <span>Veritabanı yanıt vermediği için oturum açma işlemi başarısız olabilir. Bağlantının tekrar kurulmasını bekleyin.</span>
              </div>
            </div>
          )}

          {/* Mode Switcher Tabs */}
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
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                Şifre
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

          {/* Toggle link below form */}
          <div className="text-center pt-2">
            {authMode === 'login' ? (
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
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

