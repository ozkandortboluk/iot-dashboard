import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  AlertTriangle,
  RefreshCw,
  Database,
  ShieldCheck,
  Activity,
  HardDrive,
  Clock,
  KeyRound,
  Terminal,
  X,
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  Settings,
  Shield,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../config/version';

interface MaintenanceViewProps {
  onRetry: () => void;
  sshTunnelAllowed?: boolean;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ onRetry, sshTunnelAllowed = false }) => {
  const [retrying, setRetrying] = useState(false);
  const [dbConfig, setDbConfig] = useState<{ host?: string; port?: number; database?: string; user?: string }>({});
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean>(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>(new Date().toLocaleTimeString('tr-TR'));
  const [retryCount, setRetryCount] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal States
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'update_db' | 'reset_setup'>('update_db');
  const [isLocalFallbackModalOpen, setIsLocalFallbackModalOpen] = useState(false);

  // Form States - Update DB
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('5432');
  const [formDatabase, setFormDatabase] = useState('');
  const [formUser, setFormUser] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);

  // Auth Method in Modal: 'token' | 'admin'
  const [authMethod, setAuthMethod] = useState<'token' | 'admin'>('token');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Modal Action Status
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Copy state for VPS command
  const [copiedVpsCmd, setCopiedVpsCmd] = useState(false);

  const isFetchingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const failureCountRef = useRef<number>(0);

  const backoffDelays = [5000, 5000, 10000, 15000, 20000, 30000];

  const scheduleNextCheck = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = backoffDelays[Math.min(failureCountRef.current, backoffDelays.length - 1)];
    timerRef.current = setTimeout(() => {
      checkStatus();
    }, delay);
  }, []);

  const checkStatus = useCallback(async (isManual: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRetrying(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      const res = await fetch('/api/setup/status', { credentials: 'include' });
      setLastCheckTime(new Date().toLocaleTimeString('tr-TR'));
      setRetryCount((prev) => prev + 1);

      if (res.ok) {
        const data = await res.json();
        if (data.dbConfig) {
          setDbConfig(data.dbConfig);
          setFormHost((prev) => prev || data.dbConfig.host || 'timescaledb');
          setFormPort((prev) => prev || String(data.dbConfig.port || 5432));
          setFormDatabase((prev) => prev || data.dbConfig.database || 'iot_dashboard');
          setFormUser((prev) => prev || data.dbConfig.user || 'iot_user');
        }
        if (data.dbErrorMessage) {
          setDbErrorMessage(data.dbErrorMessage);
        }
        if (data.hasAdmin !== undefined) {
          setHasAdmin(Boolean(data.hasAdmin));
        }
        if (data.systemMode === 'READY' || data.isDbConnected) {
          if (isManual) {
            setFeedbackMsg({ type: 'success', text: 'Veritabanı bağlantısı kuruldu! Sistem açılıyor...' });
          }
          onRetry();
          return;
        } else if (isManual) {
          setFeedbackMsg({
            type: 'error',
            text: `Bağlantı kurulamadı: ${data.dbErrorMessage || 'PostgreSQL yanıt vermedi.'}`,
          });
        }
      } else {
        if (isManual) {
          setFeedbackMsg({ type: 'error', text: 'Sunucu durum kontrolüne yanıt vermedi.' });
        }
      }
      failureCountRef.current += 1;
    } catch {
      failureCountRef.current += 1;
      if (isManual) {
        setFeedbackMsg({ type: 'error', text: 'Ağ hatası: Sunucuya ulaşılamıyor.' });
      }
    } finally {
      isFetchingRef.current = false;
      setRetrying(false);
      scheduleNextCheck();
    }
  }, [onRetry, scheduleNextCheck]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkStatus]);

  // Handle Emergency Database Reconfiguration
  const handleEmergencyDbSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const payload: any = {
        host: formHost.trim(),
        port: parseInt(formPort, 10) || 5432,
        database: formDatabase.trim(),
        user: formUser.trim(),
        password: formPassword,
      };

      if (authMethod === 'token') {
        if (!recoveryToken.trim()) {
          throw new Error('Lütfen kurtarma anahtarını (Recovery Token) giriniz.');
        }
        payload.recoveryToken = recoveryToken.trim();
      } else {
        if (!adminEmail.trim() || !adminPassword) {
          throw new Error('Lütfen yönetici e-posta ve şifrenizi giriniz.');
        }
        payload.adminEmail = adminEmail.trim();
        payload.adminPassword = adminPassword;
      }

      const res = await fetch('/api/setup/emergency-database-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Veritabanı bağlantısı doğrulanamadı.');
      }

      setModalSuccess('Veritabanı bağlantısı başarıyla doğrulandı ve kaydedildi! Sistem açılıyor...');
      setTimeout(() => {
        setIsConfigModalOpen(false);
        onRetry();
      }, 1200);
    } catch (err: any) {
      setModalError(err.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Reset Setup Wizard
  const handleResetSetup = async () => {
    if (!recoveryToken.trim()) {
      setModalError('Kurulum sihirbazını sıfırlamak için kurtarma anahtarı (Recovery Token) zorunludur.');
      return;
    }

    if (!window.confirm('Kurulum Sihirbazı sıfırlanacak. Devam etmek istediğinize emin misiniz?')) {
      return;
    }

    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/setup/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Setup-Token': recoveryToken.trim(),
        },
        body: JSON.stringify({ preserveConfig: true }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Kurulum sıfırlanamadı.');
      }

      setModalSuccess('Kurulum sihirbazı sıfırlandı. Sayfa yönlendiriliyor...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || 'Sıfırlama başarısız oldu.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Switch to Local Fallback Mode
  const handleEnableLocalFallback = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setModalLoading(true);
    setModalError(null);

    try {
      const payload: any = {};
      if (recoveryToken.trim()) {
        payload.recoveryToken = recoveryToken.trim();
      }
      if (adminEmail.trim() && adminPassword) {
        payload.adminEmail = adminEmail.trim();
        payload.adminPassword = adminPassword;
      }

      const res = await fetch('/api/setup/enable-local-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Yerel moda geçiş başarısız oldu.');
      }

      setIsLocalFallbackModalOpen(false);
      onRetry();
    } catch (err: any) {
      setModalError(err.message || 'Yerel mod aktif edilemedi.');
    } finally {
      setModalLoading(false);
    }
  };

  const copyVpsCommand = () => {
    const cmd = `echo -n "${formPassword || 'YENİ_ŞİFRENİZ'}" > /opt/nexusnode-iot/secrets/postgres_password && docker compose restart app`;
    navigator.clipboard.writeText(cmd);
    setCopiedVpsCmd(true);
    setTimeout(() => setCopiedVpsCmd(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-500/30">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">{APP_NAME}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-950 text-amber-300 border border-amber-800/60">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400">Veritabanı Erişim Modu (Bakım Ekranı)</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-lg text-amber-300">
            <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-medium">Sistem Bakım Modunda</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto w-full px-6 py-8 flex-1 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md space-y-6"
        >
          {/* Main Banner */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-950/20 border border-amber-800/40">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-amber-200">Veritabanına Erişilemiyor (PostgreSQL Offline)</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sistem kurulumu daha önce başarıyla tamamlanmıştır. Ancak şu anda PostgreSQL/TimescaleDB veritabanı sunucusuna
                geçici olarak ulaşılamamaktadır.
              </p>
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Güvenlik Protokolü Aktif</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Veritabanı bağlantısı kapalıyken <strong>Kurulum Sihirbazı kesinlikle dışarıdan yetkisiz açılmaz</strong>. Verileriniz,
              şifreleriniz ve yönetici hesaplarınız güvendedir. Veritabanı kimlik bilgilerinizi güncelleyerek veya veritabanını yeniden başlatarak sistemi derhal açabilirsiniz.
            </p>
          </div>

          {/* Connection Status Details */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-300 block">Hedef Veritabanı Bilgileri</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-sans block">Sunucu (Host)</span>
                <span className="text-indigo-300 font-bold truncate block">{dbConfig.host || 'timescaledb'}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-sans block">Port</span>
                <span className="text-indigo-300 font-bold block">{dbConfig.port || 5432}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-sans block">Veritabanı</span>
                <span className="text-indigo-300 font-bold truncate block">{dbConfig.database || 'iot_dashboard'}</span>
              </div>
            </div>
          </div>

          {/* Diagnostic & Troubleshooting Advice */}
          {dbErrorMessage && (
            <div className="p-4 bg-slate-950/80 rounded-xl border border-amber-900/40 text-xs space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Hata & Bağlantı Teşhisi</span>
              </div>
              <p className="text-slate-300 leading-relaxed font-mono text-[11px] bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                {dbErrorMessage}
              </p>
              <div className="text-[11px] text-slate-400 space-y-2 pt-1">
                <span className="font-semibold text-slate-300 block">Hızlı Teşhis & Çözüm Rehberi:</span>
                <ul className="list-disc list-inside space-y-1 pl-1 text-slate-400">
                  <li>
                    <strong className="text-slate-300">Şifre Değişikliği Sonrası:</strong> Veritabanı şifresini değiştirdiyseniz, aşağıdaki <strong>"Ayarları & Şifreyi Güncelle"</strong> butonuna tıklayarak yeni şifrenizi tanımlayabilirsiniz.
                  </li>
                  <li>
                    <strong className="text-slate-300">Docker / Yerel Ağ:</strong> Konteyner ağında host olarak <code className="text-indigo-300 font-mono">timescaledb</code> veya <code className="text-emerald-400 font-mono">127.0.0.1</code> adresini kullanın.
                  </li>
                </ul>

                {/* VPS Direct Command Box */}
                <div className="mt-2.5 p-2.5 bg-slate-900/95 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">VPS Konsolunda Şifreyi Doğrudan Güncelleme:</span>
                    <button
                      type="button"
                      onClick={copyVpsCommand}
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                    >
                      {copiedVpsCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVpsCmd ? 'Kopyalandı!' : 'Komutu Kopyala'}</span>
                    </button>
                  </div>
                  <code className="block bg-slate-950 p-2 rounded text-cyan-300 font-mono text-[10px] break-all border border-slate-800/80 select-all">
                    echo -n "YENİ_ŞİFRENİZ" &gt; /opt/nexusnode-iot/secrets/postgres_password &amp;&amp; docker compose restart app
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Inline Feedback Banner */}
          {feedbackMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
                  : feedbackMsg.type === 'error'
                  ? 'bg-rose-950/70 border-rose-700/60 text-rose-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <span>{feedbackMsg.text}</span>
              <button
                type="button"
                onClick={() => setFeedbackMsg(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* Polling & Actions Footer */}
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Son kontrol: <strong className="text-slate-300">{lastCheckTime}</strong> (Sorgu #{retryCount})</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
              {/* Only show SSH Drawer button when SSH Tunnel is allowed */}
              {sshTunnelAllowed && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('nexus_open_ssh_drawer'))}
                  className="w-full sm:w-auto px-4 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/60 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40"
                >
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>SSH Tüneli İle Bağlan</span>
                </button>
              )}

              {/* Edit Settings & Credentials Modal Button */}
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setModalSuccess(null);
                  setIsConfigModalOpen(true);
                }}
                disabled={retrying}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer flex items-center justify-center gap-2"
                title="PostgreSQL / TimescaleDB bağlantı bilgilerini ve şifresini güvenle güncelleyin"
              >
                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ayarları &amp; Şifreyi Güncelle</span>
              </button>

              {/* Continue to Panel in Local WAL Fallback Mode */}
              {hasAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setIsLocalFallbackModalOpen(true);
                  }}
                  disabled={retrying}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2"
                  title="Yönetici hesabınızla doğrudan panele giriş yapın (Veriler yerel dayanıklı WAL motorunda tutulur)"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Panele Devam Et (Yerel Mod)</span>
                </button>
              )}

              {/* Retry Database Probe Button */}
              <button
                id="maintenance-retry-btn"
                type="button"
                onClick={() => {
                  failureCountRef.current = 0;
                  setFeedbackMsg(null);
                  checkStatus(true);
                }}
                disabled={retrying}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Yeniden Bağlanılıyor...' : 'Bağlantıyı Yeniden Dene'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Emergency Database Configuration Modal */}
      <AnimatePresence>
        {isConfigModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-200 my-8"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-950/80 border border-indigo-700/50 rounded-lg text-indigo-400">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Veritabanı Bağlantı &amp; Şifre Kurtarma</h3>
                    <p className="text-[11px] text-slate-400">PostgreSQL kimlik bilgilerinizi güncelleyin ve sisteme bağlanın</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('update_db')}
                  className={`flex-1 py-1.5 rounded-lg transition ${
                    activeModalTab === 'update_db'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Şifre &amp; Bağlantı Güncelle
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('reset_setup')}
                  className={`flex-1 py-1.5 rounded-lg transition ${
                    activeModalTab === 'reset_setup'
                      ? 'bg-rose-950/80 text-rose-300 font-semibold border border-rose-800/60'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kurulum Sihirbazını Sıfırla
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{modalSuccess}</span>
                </div>
              )}

              {/* Tab 1: Update DB Credentials */}
              {activeModalTab === 'update_db' && (
                <form onSubmit={handleEmergencyDbSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Sunucu (Host)</label>
                      <input
                        type="text"
                        value={formHost}
                        onChange={(e) => setFormHost(e.target.value)}
                        placeholder="timescaledb"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Port</label>
                      <input
                        type="number"
                        value={formPort}
                        onChange={(e) => setFormPort(e.target.value)}
                        placeholder="5432"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Veritabanı Adı</label>
                      <input
                        type="text"
                        value={formDatabase}
                        onChange={(e) => setFormDatabase(e.target.value)}
                        placeholder="iot_dashboard"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Kullanıcı Adı</label>
                      <input
                        type="text"
                        value={formUser}
                        onChange={(e) => setFormUser(e.target.value)}
                        placeholder="iot_user"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-semibold flex items-center justify-between">
                      <span>Yeni Veritabanı Şifresi</span>
                      <span className="text-[10px] text-amber-400">PostgreSQL'de tanımlı güncel parola</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showFormPassword ? 'text' : 'password'}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="PostgreSQL parolasını giriniz"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-2 text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowFormPassword(!showFormPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Authentication Section */}
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        Güvenlik Doğrulaması
                      </span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setAuthMethod('token')}
                          className={`px-2 py-0.5 rounded transition ${
                            authMethod === 'token'
                              ? 'bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Kurtarma Anahtarı
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMethod('admin')}
                          className={`px-2 py-0.5 rounded transition ${
                            authMethod === 'admin'
                              ? 'bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Yönetici Girişi
                        </button>
                      </div>
                    </div>

                    {authMethod === 'token' ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 block">Kurtarma Anahtarı (Recovery Token)</label>
                        <input
                          type="text"
                          value={recoveryToken}
                          onChange={(e) => setRecoveryToken(e.target.value)}
                          placeholder="data/.recovery_token dosyasındaki anahtar"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                          required
                        />
                        <span className="text-[10px] text-slate-500 block leading-tight">
                          Sunucunuzda <code className="text-slate-400 font-mono">cat data/.recovery_token</code> komutunu çalıştırarak anahtarı görebilirsiniz.
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Yönetici E-Posta / Adı</label>
                          <input
                            type="text"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            placeholder="admin@nexusnodeiot.com.tr"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Yönetici Şifresi</label>
                          <div className="relative">
                            <input
                              type={showAdminPassword ? 'text' : 'password'}
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminPassword(!showAdminPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                              {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsConfigModalOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      disabled={modalLoading}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"
                    >
                      {modalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>{modalLoading ? 'Test Ediliyor & Kaydediliyor...' : 'Bağlantıyı Doğrula ve Kaydet'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 2: Reset Setup Wizard */}
              {activeModalTab === 'reset_setup' && (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-200 leading-relaxed">
                    Kurulum Sihirbazını sıfırlamak, sistemin ilk kurulum adımlarını yeniden açar. Veritabanınızdaki mevcut tablolar korunur.
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-300 font-semibold block">Kurtarma Anahtarı (Recovery Token)</label>
                    <input
                      type="text"
                      value={recoveryToken}
                      onChange={(e) => setRecoveryToken(e.target.value)}
                      placeholder="data/.recovery_token dosyasındaki anahtar"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-rose-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsConfigModalOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={handleResetSetup}
                      disabled={modalLoading}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/30 transition cursor-pointer flex items-center gap-2"
                    >
                      {modalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>{modalLoading ? 'Sıfırlanıyor...' : 'Sihirbazı Sıfırla ve Başlat'}</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Local Fallback Mode Modal */}
      <AnimatePresence>
        {isLocalFallbackModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-950/80 border border-emerald-700/50 rounded-lg text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Yerel Mod ile Panele Giriş</h3>
                    <p className="text-[11px] text-slate-400">PostgreSQL çevrimdışıyken yerel WAL/SQLite ile panele erişin</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLocalFallbackModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-200">
                  {modalError}
                </div>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">
                PostgreSQL veritabanı offline iken sistem verilerini yerel SQLite ve WAL motoru üzerinden yönetebilirsiniz. Veritabanı yeniden bağlandığında sistem otomatik olarak PostgreSQL'e döner.
              </p>

              <form onSubmit={handleEnableLocalFallback} className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 font-medium">Kurtarma Anahtarı veya Yönetici Şifresi</label>
                  <input
                    type="password"
                    value={recoveryToken}
                    onChange={(e) => setRecoveryToken(e.target.value)}
                    placeholder="Kurtarma anahtarınızı veya şifrenizi giriniz"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    (Mevcut bir yönetici oturumunuz varsa doğrudan devam edebilirsiniz)
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsLocalFallbackModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-2"
                  >
                    {modalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    <span>{modalLoading ? 'Panele Geçiliyor...' : 'Yerel Mod ile Aç'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900 bg-slate-950">
        NexusNode IoT Platform &copy; {new Date().getFullYear()} &bull; Automatic Maintenance &amp; Self-Healing Guard
      </footer>
    </div>
  );
};
