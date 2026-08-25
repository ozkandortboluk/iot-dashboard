import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ShieldCheck, Building2, Lock, UserCheck, ArrowRight, Sparkles, KeyRound, Sun, Moon, Database } from 'lucide-react';
import { NexusNodeLogo } from './NexusNodeLogo';

export const LoginView: React.FC = () => {
  const { login, register, setup, checkSetupStatus, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [needSetup, setNeedSetup] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<'customer' | 'operator'>('customer');
  const [seedDemoData, setSeedDemoData] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Detect if system is running for the first time and needs an admin account
  useEffect(() => {
    checkSetupStatus().then((val) => {
      setNeedSetup(val);
      if (val) {
        setCompanyName('Merkez Yönetim');
      }
    }).catch(() => {});
  }, [checkSetupStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (needSetup) {
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
    } else if (isRegistering) {
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
      try {
        await login(email, password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center gap-2 text-xs font-semibold"
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
            <span>{needSetup ? 'İlk Sistem Kurulum Sihirbazı' : 'Müşteri & IoT Cihaz Portalı'}</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {needSetup 
              ? 'Yönetici Hesabı Oluşturun' 
              : isRegistering 
              ? 'Yeni Hesap Oluştur' 
              : 'Giriş Yapın'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {needSetup
              ? 'Sistemi güvenli üretim modunda ayağa kaldırmak için ilk yönetici hesabını oluşturun.'
              : isRegistering
              ? 'Müşteri veya operatör hesabı açarak cihazlarınızı uzaktan yönetin.'
              : 'Lütfen kullanıcı adınız (e-posta) ve şifreniz ile oturum açın.'}
          </p>
        </div>

        {/* Form Container Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xl dark:shadow-2xl space-y-6">
          {/* Mode Switcher Tabs (Only if NOT in setup mode) */}
          {!needSetup && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setError('');
                  setSuccessMsg('');
                }}
                className={`py-2 rounded-xl transition-all cursor-pointer ${
                  !isRegistering
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(true);
                  setError('');
                  setSuccessMsg('');
                }}
                className={`py-2 rounded-xl transition-all cursor-pointer ${
                  isRegistering
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Yeni Kayıt
              </button>
            </div>
          )}

          {needSetup && (
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs rounded-xl flex items-center gap-2 font-medium leading-relaxed">
              <Database className="w-4 h-4 shrink-0 text-indigo-500" />
              <span>
                <strong>Üretim Modu Güvenliği:</strong> Varsayılan şifreler kaldırılmıştır. Lütfen kendi yöneticinizi oluşturun.
              </span>
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
            {(isRegistering || needSetup) && (
              <>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                    {needSetup ? 'Sistem Yöneticisi Adı Soyadı' : 'Ad Soyad'}
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

                {!needSetup && (
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

                {(needSetup || role === 'customer') && (
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                      {needSetup ? 'Yönetici Kurum / Firma Adı' : 'Şirket / Kurum Adı (Opsiyonel)'}
                    </label>
                    <input
                      type="text"
                      placeholder={needSetup ? 'ör. Merkez Yönetim' : 'ör. ABC Lojistik A.Ş.'}
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
                {needSetup ? 'Yönetici E-posta Adresi' : 'E-posta Adresi'}
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
                {needSetup ? 'Güvenli Şifre' : 'Şifre'}
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

            {(isRegistering || needSetup) && (
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

            {needSetup && (
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
                  ? needSetup
                    ? 'Sistem Kuruluyor...'
                    : isRegistering
                    ? 'Kayıt Yapılıyor...'
                    : 'Giriş Yapılıyor...'
                  : needSetup
                  ? 'Sistemi Başlat ve Kurulumu Tamamla'
                  : isRegistering
                  ? 'Kayıt Ol ve Giriş Yap'
                  : 'Sisteme Giriş Yap'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Toggle link below form */}
          {!needSetup && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                {isRegistering
                  ? 'Zaten bir hesabınız var mı? Giriş Yapın'
                  : 'Hesabınız yok mu? Yeni Müşteri Kaydı Oluşturun'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
