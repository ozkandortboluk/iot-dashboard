import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
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
  ExternalLink,
  Terminal,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../config/version';

interface MaintenanceViewProps {
  onRetry: () => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ onRetry }) => {
  const [retrying, setRetrying] = useState(false);
  const [dbConfig, setDbConfig] = useState<{ host?: string; port?: number; database?: string }>({});
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean>(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>(new Date().toLocaleTimeString('tr-TR'));
  const [retryCount, setRetryCount] = useState<number>(0);

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
        }
        if (data.dbErrorMessage) {
          setDbErrorMessage(data.dbErrorMessage);
        }
        if (data.hasAdmin !== undefined) {
          setHasAdmin(Boolean(data.hasAdmin));
        }
        if (data.systemMode === 'READY' || data.isDbConnected) {
          onRetry();
          return;
        }
      }
      failureCountRef.current += 1;
    } catch {
      failureCountRef.current += 1;
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
              <span>Güvenlik Protekolü Aktif</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Veritabanı bağlantısı kopuk olduğu dönemde <strong>Kurulum Sihirbazı kesinlikle tekrar açılmaz</strong>. Verileriniz,
              şifreleriniz ve yönetici hesaplarınız %100 güvendedir ve veritabanı yeniden başladığında sistem otomatik olarak açılacaktır.
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
              <div className="text-[11px] text-slate-400 space-y-1.5 pt-1">
                <span className="font-semibold text-slate-300 block">PostgreSQL Sunucusunu Dışa Açma Rehberi:</span>
                <ul className="list-disc list-inside space-y-1 pl-1 text-slate-400">
                  <li>
                    <strong className="text-slate-300">Güvenlik Duvarı:</strong> VPS üzerinde portu açın: <code className="text-indigo-300 font-mono">sudo ufw allow 5432/tcp</code>
                  </li>
                  <li>
                    <strong className="text-slate-300">Dış Bağlantı İzni:</strong> <code className="text-indigo-300 font-mono">/etc/postgresql/.../main/postgresql.conf</code> dosyasında <code className="text-emerald-400 font-mono">listen_addresses = '*'</code> yapın.
                  </li>
                  <li>
                    <strong className="text-slate-300">Erişim İzni (pg_hba.conf):</strong> <code className="text-indigo-300 font-mono">host all all 0.0.0.0/0 scram-sha-256</code> ekleyin ve servisi yeniden başlatın (<code className="text-indigo-300 font-mono">sudo systemctl restart postgresql</code>).
                  </li>
                </ul>
              </div>
            </div>
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
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('nexus_open_ssh_drawer'))}
                className="w-full sm:w-auto px-4 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/60 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40"
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>SSH Tüneli İle Bağlan (Sol Panel)</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await fetch('/api/setup/reset', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ preserveConfig: true }),
                      credentials: 'include',
                    });
                    window.location.reload();
                  } catch {
                    onRetry();
                  } finally {
                    setRetrying(false);
                  }
                }}
                disabled={retrying}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>Ayarları Düzenle</span>
              </button>

              {hasAdmin && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retrying}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 rounded-xl text-xs font-medium transition cursor-pointer flex items-center justify-center gap-2"
                  title="Yönetici hesabınızla doğrudan panele giriş yapın (Veriler yerel dayanıklı WAL motorunda tutulur)"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Panele Devam Et (Yerel Mod)</span>
                </button>
              )}

              <button
                id="maintenance-retry-btn"
                type="button"
                onClick={() => {
                  failureCountRef.current = 0;
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

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900 bg-slate-950">
        NexusNode IoT Platform &copy; {new Date().getFullYear()} &bull; Automatic Maintenance & Self-Healing Guard
      </footer>
    </div>
  );
};
