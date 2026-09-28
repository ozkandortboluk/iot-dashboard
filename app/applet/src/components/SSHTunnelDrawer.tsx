import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  ShieldCheck,
  KeyRound,
  X,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Lock,
  Eye,
  EyeOff,
  Database,
  ArrowRightLeft,
  Info,
} from 'lucide-react';

export interface SSHTunnelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectedSuccess?: () => void;
}

export const SSHTunnelDrawer: React.FC<SSHTunnelDrawerProps> = ({
  isOpen,
  onClose,
  onConnectedSuccess,
}) => {
  const [sshHost, setSshHost] = useState('db.nexusnodeiot.com.tr');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('root');
  const [authType, setAuthType] = useState<'password' | 'privateKey'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [remoteDbHost, setRemoteDbHost] = useState('127.0.0.1');
  const [remoteDbPort, setRemoteDbPort] = useState('5432');
  const [localPort, setLocalPort] = useState('5432');

  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Poll status from server
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/ssh-tunnel/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setConnectedAt(data.connectedAt || null);
          setLogs(data.logs || []);
          setLastError(data.lastError || null);
          if (data.config) {
            if (data.config.sshHost) setSshHost(data.config.sshHost);
            if (data.config.sshPort) setSshPort(String(data.config.sshPort));
            if (data.config.sshUser) setSshUser(data.config.sshUser);
            if (data.config.authType) setAuthType(data.config.authType);
            if (data.config.remoteDbHost) setRemoteDbHost(data.config.remoteDbHost);
            if (data.config.remoteDbPort) setRemoteDbPort(String(data.config.remoteDbPort));
            if (data.config.localPort) setLocalPort(String(data.config.localPort));
          }
        }
      }
    } catch {
      // ignore transient network check errors
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleTestConnection = async () => {
    if (!sshHost || !sshUser) {
      setActionMessage({ type: 'error', text: 'Lütfen SSH Sunucu Adresi ve Kullanıcı Adı giriniz.' });
      return;
    }

    setTesting(true);
    setActionMessage({ type: 'info', text: 'SSH Bağlantısı test ediliyor...' });

    try {
      const res = await fetch('/api/system/ssh-tunnel/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sshHost,
          sshPort: Number(sshPort) || 22,
          sshUser,
          authType,
          password: authType === 'password' ? password : undefined,
          privateKey: authType === 'privateKey' ? privateKey : undefined,
          remoteDbHost,
          remoteDbPort: Number(remoteDbPort) || 5432,
          localPort: Number(localPort) || 5432,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
      } else {
        setActionMessage({ type: 'error', text: data.message || 'SSH bağlantı testi başarısız.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Bağlantı hatası: ${err?.message || err}` });
    } finally {
      setTesting(false);
      fetchStatus();
    }
  };

  const handleConnect = async () => {
    if (!sshHost || !sshUser) {
      setActionMessage({ type: 'error', text: 'Lütfen SSH Sunucu Adresi ve Kullanıcı Adı giriniz.' });
      return;
    }

    setConnecting(true);
    setActionMessage({ type: 'info', text: 'SSH Tüneli başlatılıyor...' });

    try {
      const res = await fetch('/api/system/ssh-tunnel/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sshHost,
          sshPort: Number(sshPort) || 22,
          sshUser,
          authType,
          password: authType === 'password' ? password : undefined,
          privateKey: authType === 'privateKey' ? privateKey : undefined,
          remoteDbHost,
          remoteDbPort: Number(remoteDbPort) || 5432,
          localPort: Number(localPort) || 5432,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
        if (onConnectedSuccess) {
          onConnectedSuccess();
        }
      } else {
        setActionMessage({ type: 'error', text: data.message || 'SSH Tünel başlatılamadı.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Tünel hatası: ${err?.message || err}` });
    } finally {
      setConnecting(false);
      fetchStatus();
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setActionMessage({ type: 'info', text: 'SSH Tüneli kapatılıyor...' });

    try {
      const res = await fetch('/api/system/ssh-tunnel/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Tünel kapatılamadı.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Hata: ${err?.message || err}` });
    } finally {
      setDisconnecting(false);
      fetchStatus();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40"
          />

          {/* Left Sliding Screen / Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 left-0 w-full sm:w-96 md:w-[440px] z-50 bg-slate-900 border-r border-slate-800 shadow-2xl shadow-cyan-950/40 flex flex-col justify-between overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    SSH Bağlantı Tüneli
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      Port Forwarding
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Veritabanına güvenli şifreli erişim</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  status === 'connected'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : status === 'connecting'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : status === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      status === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : status === 'connecting'
                        ? 'bg-amber-500 animate-ping'
                        : status === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-500'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">
                      {status === 'connected'
                        ? 'Tünel Aktif (Port Yönlendiriliyor)'
                        : status === 'connecting'
                        ? 'Tünel Bağlanıyor...'
                        : status === 'error'
                        ? 'Tünel Bağlantı Hatası'
                        : 'SSH Tüneli Kapalı'}
                    </div>
                    {status === 'connected' && (
                      <div className="text-[11px] opacity-80 font-mono mt-0.5">
                        Local 127.0.0.1:{localPort} &rarr; Uzak {remoteDbHost}:{remoteDbPort}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={fetchStatus}
                  title="Durumu Yenile"
                  className="p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Action Alert Banner */}
              {actionMessage && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : actionMessage.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  {actionMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : actionMessage.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              {/* Quick Preset Fill */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setSshHost('db.nexusnodeiot.com.tr');
                    setSshPort('22');
                    setSshUser('root');
                    setRemoteDbHost('127.0.0.1');
                    setRemoteDbPort('5432');
                    setLocalPort('5432');
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 hover:underline"
                >
                  <Server className="w-3.5 h-3.5" /> Sunucu Şablonunu Doldur (db.nexusnodeiot.com.tr)
                </button>
              </div>

              {/* Section 1: SSH Server Config */}
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" /> SSH Sunucu Adresi
                </h4>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[11px] text-slate-400">SSH Host / İsim</label>
                    <input
                      type="text"
                      value={sshHost}
                      onChange={(e) => setSshHost(e.target.value)}
                      placeholder="db.nexusnodeiot.com.tr"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">SSH Port</label>
                    <input
                      type="number"
                      value={sshPort}
                      onChange={(e) => setSshPort(e.target.value)}
                      placeholder="22"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono text-center"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">SSH Kullanıcı Adı (User)</label>
                  <input
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="root veya ubuntu"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Section 2: Authentication */}
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" /> Kimlik Doğrulama
                  </h4>
                  <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAuthType('password')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        authType === 'password'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Şifre
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthType('privateKey')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        authType === 'privateKey'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      SSH Key (PEM)
                    </button>
                  </div>
                </div>

                {authType === 'password' ? (
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">SSH Kullanıcı Şifresi</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Private Key Yapıştır (-----BEGIN RSA PRIVATE KEY-----)</label>
                    <textarea
                      rows={4}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-[11px] text-slate-100 focus:outline-none focus:border-cyan-500 font-mono resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Section 3: Port Forwarding Target */}
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-400" /> Hedef Yönlendirme
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Uzak DB Host</label>
                    <input
                      type="text"
                      value={remoteDbHost}
                      onChange={(e) => setRemoteDbHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Uzak DB Port</label>
                    <input
                      type="number"
                      value={remoteDbPort}
                      onChange={(e) => setRemoteDbPort(e.target.value)}
                      placeholder="5432"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Yerel Dinleme Portu (Local Bind Port)</label>
                  <input
                    type="number"
                    value={localPort}
                    onChange={(e) => setLocalPort(e.target.value)}
                    placeholder="5432"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">
                    Uygulama tünel üzerinden 127.0.0.1:{localPort} adresi ile veritabanına bağlanır.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || connecting}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
                  >
                    {testing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    Tüneli Test Et
                  </button>

                  {status === 'connected' ? (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="w-full py-2 px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-rose-900/30 disabled:opacity-50"
                    >
                      {disconnecting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      )}
                      Tüneli Kapat
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting || testing}
                      className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-cyan-900/30 disabled:opacity-50"
                    >
                      {connecting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      Tüneli Başlat
                    </button>
                  )}
                </div>
              </div>

              {/* Live Console Output */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold flex items-center gap-1.5 text-slate-300">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" /> Live Tünel Konsolu
                  </span>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Temizle
                  </button>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 h-36 overflow-y-auto space-y-1 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic">SSH tünel konsol çıktıları burada görüntülenecektir...</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes('HATA')
                            ? 'text-rose-400 font-semibold'
                            : log.includes('AKTİF') || log.includes('Başarılı')
                            ? 'text-emerald-400 font-semibold'
                            : 'text-slate-300'
                        }
                      >
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 text-[11px] text-slate-500 text-center">
              NexusNode IoT &bull; Şifreli SSH Port Forwarding Protokolü
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
