import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ShieldCheck, Building2, Lock, UserCheck, ArrowRight, Sparkles, KeyRound, Sun, Moon, Database, LogIn, UserPlus } from 'lucide-react';
import { NexusNodeLogo } from './NexusNodeLogo';
import { DatabaseSetupWizard } from './setup/DatabaseSetupWizard';

export const LoginView: React.FC = () => {
  const { login, register, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'operator'>('customer');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Check if system has a real administrator or requires first-run setup
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const res = await fetch('/api/setup/status', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.hasAdmin || data.setupRequired || !data.isDbReady) {
            setAuthMode('setup');
          }
        }
      } catch {}
    };
    checkAdminStatus();
  }, []);

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
        setSuccessMsg('Kayıt başarılı! Hesabınız oluşturuldu ve giriş yapıldı.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Kayıt oluşturulamadı.';
        setError(msg);
        if (msg.includes('veritabanı bağlantısı') || msg.includes('kurulum tamamlanmadı')) {
          setAuthMode('setup');
        }
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
        const msg = err instanceof Error ? err.message : 'Giriş yapılamadı. Lütfen bilgilerinizi kontrol ediniz.';
        setError(msg);
        if (msg.includes('veritabanı bağlantısı') || msg.includes('kurulum tamamlanmadı')) {
          setAuthMode('setup');
        }
      }
    }
  };

  if (authMode === 'setup') {
    return (
      <DatabaseSetupWizard
        onComplete={() => {
          setAuthMode('login');
          setSuccessMsg('Veritabanı kurulumu başarıyla tamamlandı. Lütfen giriş yapınız.');
        }}
      />
    );
  }

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

          {/* Quick Demo Test Account Helper Banner */}
          {authMode === 'login' && (
            <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl flex items-center justify-between gap-2">
              <div className="text-[11px] leading-tight text-indigo-950 dark:text-indigo-200">
                <span className="font-bold flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                  <KeyRound className="w-3 h-3" /> Hazır Test Hesabı:
                </span>
                <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">test@nexusnodeiot.com.tr / test1234</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('test@nexusnodeiot.com.tr');
                  setPassword('test1234');
                  setError('');
                }}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] rounded-lg shadow-sm transition cursor-pointer shrink-0"
              >
                Doldur
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

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('setup');
                }}
                className="text-[11px] text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Veritabanı Yapılandırma & Kurulum Sihirbazı</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
