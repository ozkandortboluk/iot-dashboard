import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldAlert,
  KeyRound,
  UserCheck,
  Lock,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Eye,
  EyeOff,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../config/version';

interface RecoveryViewProps {
  onRecovered: () => void;
}

interface CopyableCommandProps {
  label: string;
  command: string;
  colorClass?: string;
  badge?: string;
}

const CopyableCommand: React.FC<CopyableCommandProps> = ({
  label,
  command,
  colorClass = 'text-indigo-400',
  badge,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-1 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-slate-300 font-sans font-medium truncate">{label}</span>
          {badge && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-mono shrink-0">
              {badge}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] flex items-center gap-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md border border-slate-700 transition cursor-pointer font-sans shrink-0 active:scale-95"
          title="Komutu panoya kopyala"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Kopyalandı!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400" />
              <span>Kopyala</span>
            </>
          )}
        </button>
      </div>
      <code className={`block bg-slate-950 p-2 rounded ${colorClass} overflow-x-auto break-all font-mono text-[11px] leading-relaxed select-all border border-slate-800/80`}>
        {command}
      </code>
    </div>
  );
};

export const RecoveryView: React.FC<RecoveryViewProps> = ({ onRecovered }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [name, setName] = useState('Sistem Yöneticisi');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tokenInput.trim()) {
      setError('Lütfen VPS konsolunda üretilen Tek Kullanımlık Kurtarma Anahtarını giriniz.');
      return;
    }
    if (!name.trim()) {
      setError('Lütfen ad ve soyad giriniz.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (password.length < 8) {
      setError('Yeni şifreniz en az 8 karakter olmalıdır.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/setup/recover-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recoveryToken: tokenInput.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Yönetici hesabı kurtarılamadı.');
      }

      setSuccessMsg('Yönetici hesabı başarıyla kurtarıldı ve veritabanına işlendi.');
      setTimeout(() => {
        onRecovered();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Kurtarma işlemi başarısız. Lütfen kurtarma anahtarını kontrol ediniz.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-rose-500/30">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">{APP_NAME}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-rose-950 text-rose-300 border border-rose-800/60">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400">Yönetici Hesabı Güvenli Kurtarma Modu</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs bg-rose-950/40 border border-rose-800/60 px-3 py-1.5 rounded-lg text-rose-300">
            <Lock className="w-4 h-4 text-rose-400" />
            <span className="font-medium">Console Admin Recovery</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto w-full px-6 py-8 flex-1 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md space-y-6"
        >
          {/* Header Info */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-rose-400" />
              <span>Yönetici Hesabı Kurtarma</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Veritabanı kurulumu önceden tamamlanmış ancak aktif bir yönetici hesabı doğrulanamamıştır. Güvenlik
              nedeniyle yeni yönetici oluşturma işlemi yalnızca <strong>VPS konsolundan alınan tek kullanımlık kurtarma anahtarı</strong> ile yapılabilir.
            </p>
          </div>

          {/* Terminal Hint */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-semibold font-mono">
                <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
                <span>VPS / Docker Konsol Kurtarma Komutları:</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 font-medium">
                Kopyalanabilir Komutlar
              </span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Kurtarma anahtarı (Recovery Token) üretip veritabanına işlemek için aşağıdaki komutlardan birini sunucu konsolunda çalıştırınız:
            </p>

            <div className="space-y-2.5">
              <CopyableCommand
                label="Docker Node.js Doğrudan Komut (Tek Satır):"
                badge="Docker One-Liner"
                command={`docker compose exec app node -e "const c=require('crypto'),f=require('fs');const t='rec_token_'+c.randomBytes(32).toString('hex');f.writeFileSync('/app/data/.recovery_token',t,{mode:0o600});console.log('\\nYeni Kurtarma Anahtari:\\n\\n'+t+'\\n');"`}
                colorClass="text-amber-300 font-semibold"
              />

              <CopyableCommand
                label="Docker Compose NPM Script Komutu:"
                badge="Docker Script"
                command="docker compose exec app npm run generate-recovery-token"
                colorClass="text-indigo-400"
              />

              <CopyableCommand
                label="Standart VPS / Yerel Ortam Script Komutu:"
                badge="VPS Native"
                command="npm run generate-recovery-token"
                colorClass="text-emerald-400"
              />
            </div>

            <p className="text-[10px] text-slate-500 pt-1">
              Üretilen anahtar konsola yazılacak ve <code className="text-slate-400">data/.recovery_token</code> dosyasına kaydedilecektir. Kopyaladığınız anahtarı aşağıdaki alana yapıştırınız.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleRecover} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Kurtarma Anahtarı (Recovery Token)</span>
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Örn: rec_token_..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Yönetici Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">E-posta Adresi</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Yeni Şifre</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="En az 8 karakter..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-rose-500 focus:outline-hidden pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Şifre Tekrarı</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Şifreyi tekrar giriniz..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Yönetici Hesabı Yeniden Oluşturuluyor...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Yönetici Hesabını Kurtar ve Giriş Yap</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900 bg-slate-950">
        NexusNode IoT Platform &copy; {new Date().getFullYear()} &bull; Secure Administrator Recovery System
      </footer>
    </div>
  );
};
