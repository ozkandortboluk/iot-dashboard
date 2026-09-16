import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ShieldCheck, Building2, Lock, UserCheck, ArrowRight, Sparkles, KeyRound, Sun, Moon, Database, LogIn, UserPlus, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { NexusNodeLogo } from './NexusNodeLogo';

export const LoginView: React.FC = () => {
  const { login, register, setup, checkSetupStatus, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [needSetup, setNeedSetup] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<'customer' | 'operator'>('customer');
  const [seedDemoData, setSeedDemoData] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isResettingSetup, setIsResettingSetup] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Detect if system is running for the first time and needs an admin account
  const refreshSetupCheck = useCallback(async () => {
    setIsCheckingSetup(true);
    try {
      const val = await checkSetupStatus();
      setNeedSetup(val);
      if (val) {
        setAuthMode('setup');
        setCompanyName((prev) => prev || 'Merkez Yönetim');
      }
    } catch {
      // Fallback
    } finally {
      setIsCheckingSetup(false);
    }
  }, [checkSetupStatus]);

  const handleResetToSetup = async () => {
    setIsResettingSetup(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/auth/reset-to-setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sıfırlama başarısız.');
      }
      setSuccessMsg('Sistem başarıyla ilk kurulum moduna alındı. Şimdi yönetici hesabınızı oluşturabilirsiniz.');
      setShowResetConfirm(false);
      await refreshSetupCheck();
      setAuthMode('setup');
    } catch (err: any) {
      setError(err.message || 'Sıfırlama sırasında hata oluştu.');
    } finally {
      setIsResettingSetup(false);
    }
  };

  useEffect(() => {
    refreshSetupCheck();
  }, [refreshSetupCheck]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (authMode === 'setup') {
      if (!name.trim()) {
        setError('Lütfen yönetici adını ve soyadını giriniz.');
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
        await setup(name, email, password, companyName || 'Merkez Yönetim', seedDemoData);
        setSuccessMsg('Sistem kurulumu başarıyla tamamlandı!');
        setNeedSetup(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Kurulum tamamlanamadı.');
      }
    } else if (authMode === 'register') {
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
        setSuccessMsg('Kayıt başarılı! Hesabınız oluşturuldu ve giriş yapıldı.');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Kayıt oluşturulamadı.');
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
        setError(err instanceof Error ? err.message : 'Giriş yapılamadı. Lütfen bilgilerinizi kontrol ediniz.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
          title={theme === 'dark' ? 'Açık Moda Geç' : 'Karanlık Moda Geç'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          <span className="hidden sm:inline">{theme === 'dark' ? 'Açık Tema' : 'Karanlık Tema'}</span>
        </button>
      </div>

      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-indigo-500/10 dark:bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-emerald-500/10 dark:bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <NexusNodeLogo variant="stacked" size="lg" showDomain={true} animated={true} />
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-full mt-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {authMode === 'setup'
                ? 'İlk Sistem Kurulum Sihirbazı'
                : authMode === 'register'
                ? 'Müşteri & Operatör Kayıt'
                : 'Müşteri & IoT Cihaz Portalı'}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {authMode === 'setup'
              ? 'Yönetici Hesabı Oluşturun' 
              : authMode === 'register' 
              ? 'Yeni Hesap Oluştur' 
              : 'Giriş Yapın'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {authMode === 'setup'
              ? 'Sistemi güvenli üretim modunda ayağa kaldırmak için ilk yönetici hesabını oluşturun.'
              : authMode === 'register'
              ? 'Müşteri veya operatör hesabı açarak cihazlarınızı uzaktan yönetin.'
              : 'Lütfen kullanıcı adınız (e-posta) ve şifreniz ile oturum açın.'}
          </p>
        </div>

        {/* Form Container Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xl dark:shadow-2xl space-y-6">
          {/* Mode Switcher Tabs with Refresh Action */}
          <div className="flex items-center gap-2">
            <div className={`grid ${needSetup ? 'grid-cols-2' : 'grid-cols-3'} p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold flex-1`}>
              {needSetup ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('setup');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      authMode === 'setup'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>İlk Kurulum</span>
                  </button>
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
                </>
              ) : (
                <>
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
                    <span>Giriş</span>
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
                    <span>Kayıt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('setup');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      authMode === 'setup'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Kurulum</span>
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={refreshSetupCheck}
              disabled={isCheckingSetup}
              title="Kurulum Durumunu Yeniden Kontrol Et"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingSetup ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>

          {needSetup && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-xl flex items-start gap-2 font-medium leading-relaxed">
              <Database className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Veritabanı Bağlı • Yönetici Hesabı Gerekli:</strong> Sistem veritabanına bağlandı ancak henüz bir yönetici hesabı bulunmuyor. Sisteme erişmek için lütfen ilk yönetici hesabını oluşturun.
              </span>
            </div>
          )}

          {authMode === 'setup' && !needSetup && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-xl space-y-2.5 leading-relaxed font-medium">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Sistemde Kayıtlı Yönetici Mevcut:</strong> Veritabanında daha önceden oluşturulmuş bir yönetici hesabı bulunmaktadır. Eğer şifrenizi unuttuysanız veya sistemi sıfırdan kurmak istiyorsanız aşağıdaki buton ile sistemi ilk kurulum moduna sıfırlayabilirsiniz.
                </span>
              </div>
              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sistemi İlk Kurulum Moduna Sıfırla</span>
                </button>
              ) : (
                <div className="p-2.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg space-y-2">
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                    Mevcut kullanıcı ve yönetici hesapları temizlenecektir. Emin misiniz?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isResettingSetup}
                      onClick={handleResetToSetup}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isResettingSetup ? 'Sıfırlanıyor...' : 'Evet, Sıfırla ve Kuruluma Geç'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded text-xs hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      İptal
                    </button>
                  </div>
                </div>
              )}
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

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {(authMode === 'register' || authMode === 'setup') && (
              <>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                    {authMode === 'setup' ? 'Sistem Yöneticisi Adı Soyadı' : 'Ad Soyad'}
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

                {authMode === 'register' && (
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
                )}

                {(authMode === 'setup' || role === 'customer') && (
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      {authMode === 'setup' ? 'Yönetici Kurum / Firma Adı' : 'Şirket / Kurum Adı (Opsiyonel)'}
                    </label>
                    <input
                      type="text"
                      placeholder={authMode === 'setup' ? 'ör. Merkez Yönetim' : 'ör. ABC Lojistik A.Ş.'}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                {authMode === 'setup' ? 'Yönetici E-posta Adresi' : 'E-posta Adresi'}
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
                {authMode === 'setup' ? 'Güvenli Şifre' : 'Şifre'}
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

            {(authMode === 'register' || authMode === 'setup') && (
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

            {authMode === 'setup' && (
              <div className="flex items-start gap-2.5 pt-1.5 pb-2">
                <input
                  id="seedDemo"
                  type="checkbox"
                  checked={seedDemoData}
                  onChange={(e) => setSeedDemoData(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-indigo-600 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="seedDemo" className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-normal select-none cursor-pointer">
                  Sistemi örnek sanal IoT cihazları, kurallar ve hazır telemetri verileriyle zenginleştir (Önerilen).
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>
                {isLoading
                  ? authMode === 'setup'
                    ? 'Sistem Kuruluyor...'
                    : authMode === 'register'
                    ? 'Kayıt Yapılıyor...'
                    : 'Giriş Yapılıyor...'
                  : authMode === 'setup'
                  ? 'Sistemi Başlat ve Kurulumu Tamamla'
                  : authMode === 'register'
                  ? 'Kayıt Ol ve Giriş Yap'
                  : 'Sisteme Giriş Yap'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Toggle link below form */}
          <div className="text-center pt-2 space-y-2">
            {authMode === 'setup' ? (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                Mevcut bir hesabınız varsa Giriş Yapın
              </button>
            ) : authMode === 'login' ? (
              <>
                <div>
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
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('setup');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className="text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Veritabanında yönetici hesabı yok mu? İlk Kurulum Sihirbazı</span>
                  </button>
                </div>
              </>
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
