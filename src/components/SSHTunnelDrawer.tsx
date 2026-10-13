import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { apiFetch as fetch } from '../lib/apiFetch';
import { NexusNodeLogo } from './NexusNodeLogo';

export interface SSHTunnelDrawerProps {
  isOpen: boolean;
  onClose?: () => void;
  onConnectedSuccess?: () => void;
  isPreLoginScreen?: boolean;
}

export const SSHTunnelDrawer: React.FC<SSHTunnelDrawerProps> = ({
  isOpen,
  onClose,
  onConnectedSuccess,
  isPreLoginScreen = false,
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
  const [localPort, setLocalPort] = useState('15432');
  const [expectedHostFingerprint, setExpectedHostFingerprint] = useState('');
  const [discoveredFingerprint, setDiscoveredFingerprint] = useState<string | null>(null);

  // PostgreSQL Database Credentials over SSH Tunnel
  const [dbUser, setDbUser] = useState('iot_user');
  const [dbPassword, setDbPassword] = useState('');
  const [dbName, setDbName] = useState('iot_dashboard');
  const [showDbPassword, setShowDbPassword] = useState(false);

  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // 3-point separate checks for pre-login gate
  const [sshConnected, setSshConnected] = useState(false);
  const [postgresSelect1Verified, setPostgresSelect1Verified] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [canProceed, setCanProceed] = useState(false);

  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [probingFingerprint, setProbingFingerprint] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const setupToken =
      sessionStorage.getItem('nexus_setup_token') ||
      localStorage.getItem('nexus_setup_token') ||
      sessionStorage.getItem('setup_token') ||
      localStorage.getItem('setup_token') ||
      sessionStorage.getItem('x-setup-token') ||
      localStorage.getItem('x-setup-token');
    if (setupToken) {
      headers['X-Setup-Token'] = setupToken;
      headers['x-setup-token'] = setupToken;
    }
    const userToken = sessionStorage.getItem('nexus_session_token') || localStorage.getItem('nexus_session_token');
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
      headers['X-Auth-Token'] = userToken;
      headers['x-auth-token'] = userToken;
    }
    const bootstrapToken =
      sessionStorage.getItem('nexus_ssh_bootstrap_token');
    if (bootstrapToken) {
      headers['X-SSH-Bootstrap-Token'] = bootstrapToken;
    }
    return headers;
  }, []);

  const ensureBootstrapToken = useCallback(async (): Promise<string | null> => {
    const token =
      sessionStorage.getItem('nexus_ssh_bootstrap_token');
    if (token) return token;
    try {
      const res = await fetch('/api/system/ssh-tunnel/bootstrap-token', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.bootstrapToken) {
          sessionStorage.setItem('nexus_ssh_bootstrap_token', data.bootstrapToken);
          return data.bootstrapToken;
        }
      }
    } catch {
      // Ignore network errors in preview
    }
    return null;
  }, [getAuthHeaders]);

  const handleStatusData = useCallback((data: any) => {
    if (!data) return;
    setStatus(data.status);
    setConnectedAt(data.connectedAt || null);
    setLogs(data.logs || []);
    setLastError(data.lastError || null);
    if (data.hostFingerprint) {
      setDiscoveredFingerprint(data.hostFingerprint);
    }
    if (data.config && !isConfigLoaded) {
      if (data.config.sshHost) setSshHost(data.config.sshHost);
      if (data.config.sshPort) setSshPort(String(data.config.sshPort));
      if (data.config.sshUser) setSshUser(data.config.sshUser);
      if (data.config.authType) setAuthType(data.config.authType);
      if (data.config.remoteDbHost) setRemoteDbHost(data.config.remoteDbHost);
      if (data.config.remoteDbPort) setRemoteDbPort(String(data.config.remoteDbPort));
      if (data.config.localPort) setLocalPort(String(data.config.localPort));
      if (data.config.expectedHostFingerprint) setExpectedHostFingerprint(data.config.expectedHostFingerprint);
      setIsConfigLoaded(true);
    }

    const isSsh = data.sshConnected ?? (data.status === 'connected');
    const isSel1 = data.postgresSelect1Verified ?? false;
    const isReady = data.databaseReady ?? (data.databaseState === 'READY');
    const proceed = data.canProceedToLogin ?? (isSsh && isSel1 && isReady);

    setSshConnected(isSsh);
    setPostgresSelect1Verified(isSel1);
    setDatabaseReady(isReady);
    setCanProceed(proceed);
  }, [isConfigLoaded]);

  // Poll status from server
  const fetchStatus = useCallback(async () => {
    try {
      await ensureBootstrapToken();
      const res = await fetch('/api/system/ssh-tunnel/status', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        sessionStorage.removeItem('nexus_ssh_bootstrap_token');
        const newToken = await ensureBootstrapToken();
        if (newToken) {
          const retryRes = await fetch('/api/system/ssh-tunnel/status', {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            handleStatusData(retryData);
            return;
          }
        }
        setLastError('SSH Tüneli yönetimi için yetkilendirme doğrulanıyor. Lütfen tüneli başlatın.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          handleStatusData(data);
        }
      }
    } catch {
      // ignore transient network check errors
    }
  }, [ensureBootstrapToken, getAuthHeaders, handleStatusData]);

  useEffect(() => {
    if (isOpen || isPreLoginScreen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, isPreLoginScreen, fetchStatus]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs.length]);

  const handleProbeFingerprint = async () => {
    if (!sshHost) {
      setActionMessage({ type: 'error', text: 'Lütfen SSH Sunucu Adresi (Host) giriniz.' });
      return;
    }
    setProbingFingerprint(true);
    setActionMessage({ type: 'info', text: 'Sunucu Host Key parmak izi sorgulanıyor (Kimlik bilgisi gönderilmeden)...' });
    try {
      await ensureBootstrapToken();
      const res = await fetch('/api/system/ssh-tunnel/probe-fingerprint', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          sshHost,
          sshPort: Number(sshPort) || 22,
        }),
      });
      if (res.status === 401) {
        setActionMessage({
          type: 'error',
          text: 'Yetkisiz Erişim (401): SSH Tüneli sorgulaması için yetkilendirme gereklidir.',
        });
        return;
      }
      const data = await res.json();
      if (data.success && data.sha256) {
        setDiscoveredFingerprint(data.sha256);
        setActionMessage({
          type: 'success',
          text: `Host Key parmak izi güvenle sorgulandı: ${data.sha256}. Aşağıdaki butona tıklayarak sabitleyebilirsiniz.`,
        });
      } else {
        setActionMessage({
          type: 'error',
          text: data.error || data.message || 'Parmak izi sorgulanamadı. Sunucu adresi veya portu kontrol edin.',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Sorgu hatası: ${err?.message || err}` });
    } finally {
      setProbingFingerprint(false);
    }
  };

  const handleTestConnection = async () => {
    if (!sshHost || !sshUser) {
      setActionMessage({ type: 'error', text: 'Lütfen SSH Sunucu Adresi ve Kullanıcı Adı giriniz.' });
      return;
    }

    setTesting(true);
    setActionMessage({ type: 'info', text: 'SSH Bağlantısı test ediliyor...' });

    try {
      await ensureBootstrapToken();
      const res = await fetch('/api/system/ssh-tunnel/test', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          sshHost,
          sshPort: Number(sshPort) || 22,
          sshUser,
          authType,
          password: authType === 'password' ? password : undefined,
          privateKey: authType === 'privateKey' ? privateKey : undefined,
          remoteDbHost,
          remoteDbPort: Number(remoteDbPort) || 5432,
          localPort: Number(localPort) || 15432,
          expectedHostFingerprint: expectedHostFingerprint.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.hostFingerprint) {
        setDiscoveredFingerprint(data.hostFingerprint);
      }
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
      } else {
        setActionMessage({ type: 'error', text: data.message || data.error || 'SSH bağlantı testi başarısız.' });
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
    setActionMessage({ type: 'info', text: 'SSH Tüneli başlatılıyor ve PostgreSQL doğrulanıyor...' });

    try {
      await ensureBootstrapToken();
      const res = await fetch('/api/system/ssh-tunnel/connect', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          sshHost,
          sshPort: Number(sshPort) || 22,
          sshUser,
          authType,
          password: authType === 'password' ? password : undefined,
          privateKey: authType === 'privateKey' ? privateKey : undefined,
          remoteDbHost,
          remoteDbPort: Number(remoteDbPort) || 5432,
          localPort: Number(localPort) || 15432,
          expectedHostFingerprint: expectedHostFingerprint.trim() || undefined,
          dbUser: dbUser.trim() || undefined,
          dbPassword: dbPassword ? dbPassword : undefined,
          dbName: dbName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.hostFingerprint) {
        setDiscoveredFingerprint(data.hostFingerprint);
      }
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
        await fetchStatus();
        // The connect response confirms transport setup but does not supply
        // canProceedToLogin. Ask the parent to re-check SSH + SELECT 1 + READY.
        // The parent alone decides whether login may proceed.
        if (onConnectedSuccess) {
          onConnectedSuccess();
        }
      } else {
        setActionMessage({ type: 'error', text: data.message || data.error || 'SSH Tünel başlatılamadı.' });
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
      await ensureBootstrapToken();
      const res = await fetch('/api/system/ssh-tunnel/disconnect', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
      } else {
        setActionMessage({ type: 'error', text: data.message || data.error || 'Tünel kapatılamadı.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Hata: ${err?.message || err}` });
    } finally {
      setDisconnecting(false);
      fetchStatus();
    }
  };

  const fillDefaultPreset = () => {
    setSshHost('db.nexusnodeiot.com.tr');
    setSshPort('22');
    setSshUser('deploy');
    setRemoteDbHost('127.0.0.1');
    setRemoteDbPort('5432');
    setLocalPort('15432');
  };

  // Render Section 1: SSH Server Config
  const renderSshConfig = () => (
    <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
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
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-slate-400">SSH Port</label>
          <input
            type="number"
            value={sshPort}
            onChange={(e) => setSshPort(e.target.value)}
            placeholder="22"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono text-center"
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
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
        />
      </div>
    </div>
  );

  // Render Section 2: SSH Authentication
  const renderSshAuth = () => (
    <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" /> SSH Kimlik Doğrulama
        </h4>
        <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setAuthType('password')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
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
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
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
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 pr-9 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
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
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-2.5 text-[11px] text-slate-100 focus:outline-none focus:border-cyan-500 font-mono resize-none"
          />
        </div>
      )}
    </div>
  );

  // Render Section 3: Port Forwarding Target
  const renderPortForwarding = () => (
    <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
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
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-slate-400">Uzak DB Port</label>
          <input
            type="number"
            value={remoteDbPort}
            onChange={(e) => setRemoteDbPort(e.target.value)}
            placeholder="5432"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-slate-400">Yerel Dinleme Portu (Local Bind Port)</label>
        <input
          type="number"
          value={localPort}
          onChange={(e) => setLocalPort(e.target.value)}
          placeholder="15432"
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
        />
        <p className="text-[10px] text-slate-500">
          Uygulama tünel üzerinden 127.0.0.1:{localPort || '15432'} adresi ile PostgreSQL veritabanına bağlanır (Standart: 15432).
        </p>
      </div>
    </div>
  );

  // Render Section 4: DB Credentials
  const renderDbCredentials = () => (
    <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" /> PostgreSQL Veritabanı Bilgileri
        </h4>
        <span className="text-[10px] text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60 font-medium">
          İsteğe Bağlı
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-slate-400">DB Kullanıcı</label>
          <input
            type="text"
            value={dbUser}
            onChange={(e) => setDbUser(e.target.value)}
            placeholder="iot_user"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-slate-400">DB Adı</label>
          <input
            type="text"
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            placeholder="iot_dashboard"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-slate-400">PostgreSQL Veritabanı Şifresi</label>
        <div className="relative">
          <input
            type={showDbPassword ? 'text' : 'password'}
            value={dbPassword}
            onChange={(e) => setDbPassword(e.target.value)}
            placeholder="Mevcut sistem parolası kullanılır (opsiyonel)"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 pr-9 font-mono"
          />
          <button
            type="button"
            onClick={() => setShowDbPassword(!showDbPassword)}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            {showDbPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );

  // Render Section 5: Fingerprint Pinning
  const renderFingerprintSection = () => (
    <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Host Key Parmak İzi (Pinning)
        </h4>
        <button
          type="button"
          onClick={handleProbeFingerprint}
          disabled={probingFingerprint || !sshHost}
          className="text-[11px] px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {probingFingerprint ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Server className="w-3 h-3" />
          )}
          Parmak İzini Otomatik Sorgula
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-slate-400">Beklenen SHA256 Host Key Parmak İzi</label>
        <input
          type="text"
          value={expectedHostFingerprint}
          onChange={(e) => setExpectedHostFingerprint(e.target.value)}
          placeholder="SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
        />
      </div>

      {discoveredFingerprint && (
        <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Sunucudan Alınan Parmak İzi</div>
            <div className="text-[11px] font-mono text-slate-200 truncate select-all">{discoveredFingerprint}</div>
          </div>
          {expectedHostFingerprint !== discoveredFingerprint && (
            <button
              type="button"
              onClick={() => {
                setExpectedHostFingerprint(discoveredFingerprint);
                setActionMessage({ type: 'success', text: 'Host Fingerprint alanı dolduruldu.' });
              }}
              className="px-2 py-1 text-[11px] font-medium rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors shrink-0 cursor-pointer"
            >
              Kopyala
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Render Action Buttons
  const renderActionButtons = () => (
    <div className="space-y-2 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || connecting}
          className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer disabled:opacity-50"
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
            className="w-full py-2.5 px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-rose-900/30 cursor-pointer disabled:opacity-50"
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
            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-cyan-900/30 cursor-pointer disabled:opacity-50"
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

      {isPreLoginScreen && canProceed && (
        <button
          type="button"
          onClick={() => onConnectedSuccess && onConnectedSuccess()}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/50 cursor-pointer transition-all animate-pulse hover:animate-none"
        >
          <CheckCircle2 className="w-4 h-4" />
          Giriş Ekranına Devam Et
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      )}
    </div>
  );

  // Render Live Logs Console
  const renderConsoleLogs = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="font-semibold flex items-center gap-1.5 text-slate-300">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" /> Live Tünel Konsolu
        </span>
        <button
          onClick={() => setLogs([])}
          className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          Temizle
        </button>
      </div>
      <div
        ref={logContainerRef}
        className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 h-36 overflow-y-auto space-y-1 custom-scrollbar"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">SSH tünel konsol çıktıları burada görüntülenecektir...</div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className={
                log.includes('HATA') || log.includes('uyarısı')
                  ? 'text-rose-400 font-semibold'
                  : log.includes('AKTİF') || log.includes('başarıyla') || log.includes('doğrulandı')
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-300'
              }
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // 3-point checklist banner component
  const renderChecklistPills = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* 1. SSH Tüneli */}
      <div
        className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          sshConnected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : status === 'connecting'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            sshConnected
              ? 'bg-emerald-500/20 text-emerald-400'
              : status === 'connecting'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-slate-800 text-slate-500'
          }`}
        >
          {sshConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : status === 'connecting' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
          ) : (
            <Terminal className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1. SSH Tüneli</div>
          <div className="text-xs font-semibold truncate">
            {sshConnected ? 'Bağlantı Aktif' : status === 'connecting' ? 'Bağlanıyor...' : 'Bağlı Değil'}
          </div>
        </div>
      </div>

      {/* 2. PostgreSQL SELECT 1 */}
      <div
        className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          postgresSelect1Verified
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            postgresSelect1Verified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}
        >
          {postgresSelect1Verified ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Database className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">2. PostgreSQL SELECT 1</div>
          <div className="text-xs font-semibold truncate">
            {postgresSelect1Verified ? 'Sorgu Doğrulandı' : 'Doğrulama Bekleniyor'}
          </div>
        </div>
      </div>

      {/* 3. Veritabanı READY */}
      <div
        className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          databaseReady
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            databaseReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}
        >
          {databaseReady ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Lock className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3. Veritabanı Durumu</div>
          <div className="text-xs font-semibold truncate">
            {databaseReady ? 'READY (Hazır)' : 'Hazırlanıyor...'}
          </div>
        </div>
      </div>
    </div>
  );

  // PRE-LOGIN SCREEN RENDER (AI Studio Development Sandbox)
  if (isPreLoginScreen) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative selection:bg-cyan-500 selection:text-white">
        {/* Subtle Ambient Glow */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        </div>

        {/* Header */}
        <header className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <NexusNodeLogo className="w-10 h-10" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">NexusNode IoT Dashboard</h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  AI Studio Ortamı
                </span>
              </div>
              <p className="text-xs text-slate-400">PostgreSQL SSH Tüneli & Güvenli Bağlantı Doğrulaması</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fillDefaultPreset}
              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" /> Şablonu Doldur (db.nexusnodeiot.com.tr)
            </button>
            <button
              onClick={fetchStatus}
              title="Durumu Yenile"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Body */}
        <main className="max-w-6xl mx-auto w-full my-6 flex-1 space-y-6">
          {/* Status & 3 Checklist Pills */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">
                Giriş Öncesi Güvenlik Kontrolleri:
              </span>
              <span>
                Giriş ekranının açılabilmesi için aşağıdaki 3 koşulun doğrulanması zorunludur.
              </span>
            </div>
            {renderChecklistPills()}
          </div>

          {/* Action Alerts */}
          {actionMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 border ${
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
              <span className="flex-1">{actionMessage.text}</span>
            </div>
          )}

          {lastError && !actionMessage && (
            <div className="p-3.5 rounded-xl text-xs flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{lastError}</span>
            </div>
          )}

          {/* Form Content - 2 Columns on Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: SSH Server & Auth */}
            <div className="space-y-4">
              {renderSshConfig()}
              {renderSshAuth()}
              {renderFingerprintSection()}
            </div>

            {/* Right Column: DB Targets & Console */}
            <div className="space-y-4">
              {renderPortForwarding()}
              {renderDbCredentials()}
              {renderActionButtons()}
              {renderConsoleLogs()}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="max-w-6xl mx-auto w-full pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
          <div>NexusNode IoT &bull; Şifreli SSH Port Forwarding Protokolü</div>
          <div className="text-slate-600">AI Studio Ön-Giriş Güvenlik Katmanı</div>
        </footer>
      </div>
    );
  }

  // STANDARD DRAWER RENDER (Slide-out from left for desktop/mobile in dashboard)
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
            className="fixed inset-y-0 left-0 w-full sm:w-96 md:w-[460px] z-50 bg-slate-900 border-r border-slate-800 shadow-2xl shadow-cyan-950/40 flex flex-col justify-between overflow-hidden"
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
              {onClose && (
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
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
                  className="p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                  onClick={fillDefaultPreset}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Server className="w-3.5 h-3.5" /> Sunucu Şablonunu Doldur (db.nexusnodeiot.com.tr)
                </button>
              </div>

              {renderSshConfig()}
              {renderSshAuth()}
              {renderPortForwarding()}
              {renderDbCredentials()}
              {renderFingerprintSection()}
              {renderActionButtons()}
              {renderConsoleLogs()}
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
