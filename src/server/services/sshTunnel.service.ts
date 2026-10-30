import { Client, type ConnectConfig } from 'ssh2';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { systemLogger } from './systemLogger.service.js';
import { systemSecretsService } from './systemSecrets.service.js';
import { isDevelopmentSshTunnelAllowed, isVps } from '../config/runtimeEnvironment.js';

export function isSshTunnelAllowed(): boolean {
  return isDevelopmentSshTunnelAllowed();
}

export interface SSHTunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  remoteDbHost: string;
  remoteDbPort: number;
  localPort: number;
  autoConnect?: boolean;
  expectedHostFingerprint?: string; // e.g. SHA256:... or MD5:... for pinning
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
}

export type SSHTunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSHDevSession {
  token: string;
  createdAt: string;
  expiresAt: number;
  ttlSeconds: number;
  sshHost: string;
  sshUser: string;
  localPort: number;
}

export interface SSHTunnelDevSessionState {
  active: boolean;
  expiresAt: number | null;
  remainingSeconds: number;
  token: string | null;
}

export interface SSHTunnelState {
  status: SSHTunnelStatus;
  config: SSHTunnelConfig | null;
  lastError: string | null;
  connectedAt: string | null;
  logs: string[];
  hostFingerprint: string | null;
  devSession?: SSHTunnelDevSessionState;
}

export const CONFIG_FILE = path.join(process.cwd(), 'data', '.ssh_tunnel_config.json');
export const DEV_SESSION_FILE = path.join(process.cwd(), 'data', '.ssh_dev_session.json');
export const SSH_DEV_SESSION_TTL_MS = 60 * 60 * 1000; // 1 saat (3600 sn)
// Use a dedicated local forwarding port to avoid collision with local PostgreSQL.
export const DEFAULT_SSH_LOCAL_PORT = 15432;

/**
 * Calculates SHA-256 and MD5 fingerprints of SSH Host Public Key
 */
export function computeHostFingerprints(key: string | Buffer): { sha256: string; md5: string } {
  const buf = Buffer.isBuffer(key) ? key : Buffer.from(key, 'binary');
  const sha256Base64 = crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
  const sha256 = `SHA256:${sha256Base64}`;
  const md5Hex = crypto.createHash('md5').update(buf).digest('hex');
  const md5 = md5Hex.match(/.{2}/g)?.join(':') || md5Hex;
  return { sha256, md5 };
}

/**
 * Checks server host key against optional pinned fingerprint.
 * Strictly verifies SHA-256 (case-sensitive Base64) and MD5 fingerprints.
 * When a pinned fingerprint is provided and does not match, connection is rejected.
 */
export function verifyHostFingerprint(
  serverKey: string | Buffer,
  expectedFingerprint?: string
): { valid: boolean; actualSha256: string; actualMd5: string; pinned: boolean; error?: string } {
  const { sha256, md5 } = computeHostFingerprints(serverKey);

  if (!expectedFingerprint || !expectedFingerprint.trim()) {
    return {
      valid: false,
      actualSha256: sha256,
      actualMd5: md5,
      pinned: false,
      error: `Zorunlu SSH Host Key Parmak İzi (expectedHostFingerprint) eksik. Güvenilir SHA256 parmak izi pini tanımlanmadan SSH bağlantısı ve kimlik bilgisi gönderimi reddedildi (fail-closed).`,
    };
  }

  const cleanExpected = expectedFingerprint.trim();
  const rawExpectedSha = cleanExpected.replace(/^SHA256:/i, '');
  const rawActualSha = sha256.replace(/^SHA256:/i, '');

  // Exact comparison (Base64 is case-sensitive for SHA256; MD5 is hex case-insensitive)
  const isShaMatch =
    cleanExpected === sha256 ||
    rawExpectedSha === rawActualSha;

  const isMd5Match =
    cleanExpected.toLowerCase() === md5.toLowerCase() ||
    cleanExpected.replace(/[:\s]/g, '').toLowerCase() === md5.replace(/[:\s]/g, '').toLowerCase();

  if (isShaMatch || isMd5Match) {
    return { valid: true, actualSha256: sha256, actualMd5: md5, pinned: true };
  }

  return {
    valid: false,
    actualSha256: sha256,
    actualMd5: md5,
    pinned: true,
    error: `SSH Host Key Fingerprint uyuşmazlığı tespit edildi! Beklenen: "${expectedFingerprint}", Sunucudan gelen: "${sha256}". Olası Ortadaki Adam (MITM) veya sahte sunucu bağlantı girişimi engellendi.`,
  };
}

class SSHTunnelService {
  private sshClient: Client | null = null;
  private netServer: net.Server | null = null;
  private status: SSHTunnelStatus = 'disconnected';
  private lastError: string | null = null;
  private connectedAt: string | null = null;
  private activeHostFingerprint: string | null = null;
  private logs: string[] = [];
  private activeConfig: SSHTunnelConfig | null = null;

  constructor() {
    this.loadSavedConfig();
  }

  private addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString('tr-TR');
    const logLine = `[${timestamp}] ${msg}`;
    this.logs.push(logLine);
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    systemLogger.info('database', msg);
  }

  private loadSavedConfig() {
    if (!isSshTunnelAllowed()) {
      return;
    }
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.sshHost) {
          // Retrieve sensitive credentials from Vault
          const vaultPassword = systemSecretsService.getSecret('ssh_tunnel_password');
          const vaultPrivateKey = systemSecretsService.getSecret('ssh_tunnel_private_key');

          this.activeConfig = {
            ...parsed,
            localPort: Number(parsed.localPort) || DEFAULT_SSH_LOCAL_PORT,
            password: vaultPassword || undefined,
            privateKey: vaultPrivateKey || undefined,
          };
          this.addLog(`Kaydedilmiş SSH tünel yapılandırması yüklendi: ${parsed.sshUser}@${parsed.sshHost} (Local Port: ${this.activeConfig?.localPort})`);
        }
      }
    } catch (err: any) {
      systemLogger.warn('database', `SSH yapılandırma dosyası okunamadı: ${err?.message}`);
    }
  }

  public async saveConfig(config: SSHTunnelConfig) {
    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 1. Secure sensitive password & privateKey in System Secrets Vault
      if (config.password && !config.password.includes('••••••••')) {
        await systemSecretsService.setSecret('ssh_tunnel_password', config.password, {
          category: 'custom',
          label: 'SSH Tüneli Parolası',
          isSensitive: true,
        });
      }
      if (config.privateKey && !config.privateKey.includes('••••••••')) {
        await systemSecretsService.setSecret('ssh_tunnel_private_key', config.privateKey, {
          category: 'custom',
          label: 'SSH Tüneli Özel Anahtarı (Private Key)',
          isSensitive: true,
        });
      }

      // 2. Persist ONLY non-sensitive settings to disk
      const sanitizedConfigForDisk: Partial<SSHTunnelConfig> = {
        sshHost: config.sshHost,
        sshPort: config.sshPort || 22,
        sshUser: config.sshUser,
        authType: config.authType,
        remoteDbHost: config.remoteDbHost || '127.0.0.1',
        remoteDbPort: config.remoteDbPort || 5432,
        localPort: config.localPort || DEFAULT_SSH_LOCAL_PORT,
        autoConnect: config.autoConnect,
        expectedHostFingerprint: config.expectedHostFingerprint,
      };

      this.activeConfig = {
        ...config,
        localPort: config.localPort || DEFAULT_SSH_LOCAL_PORT,
      };

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(sanitizedConfigForDisk, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.chmodSync(CONFIG_FILE, 0o600);
    } catch (err: any) {
      systemLogger.error('database', `SSH yapılandırması kaydedilemedi: ${err?.message}`);
      throw err;
    }
  }

  public isConnected(): boolean {
    if (!isSshTunnelAllowed()) {
      return false;
    }
    return this.status === 'connected';
  }

  public getConfig(): SSHTunnelConfig | null {
    if (!isSshTunnelAllowed()) {
      return null;
    }
    return this.activeConfig;
  }

  public getLocalPort(): number {
    return this.activeConfig?.localPort || DEFAULT_SSH_LOCAL_PORT;
  }

  public getState(): SSHTunnelState {
    const session = this.getDevSession();
    const remainingSeconds = session ? Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)) : 0;

    return {
      status: this.status,
      config: this.activeConfig
        ? {
            ...this.activeConfig,
            password: (this.activeConfig.password || systemSecretsService.getSecret('ssh_tunnel_password')) ? '••••••••' : undefined,
            privateKey: (this.activeConfig.privateKey || systemSecretsService.getSecret('ssh_tunnel_private_key')) ? '••••••••' : undefined,
          }
        : null,
      lastError: this.lastError,
      connectedAt: this.connectedAt,
      logs: this.logs,
      hostFingerprint: this.activeHostFingerprint,
      devSession: {
        active: Boolean(session),
        expiresAt: session?.expiresAt || null,
        remainingSeconds,
        token: session?.token || null,
      },
    };
  }

  /**
   * 1 Saatlik Güvenli Yerel Geliştirici Oturumu Oluşturur / Yeniler.
   * Yalnızca yerel ortamda (Local/AI Studio) çalışır; VPS üretimde kesinlikle devre dışıdır.
   */
  public createOrRenewDevSession(config: SSHTunnelConfig): SSHDevSession | null {
    if (!isSshTunnelAllowed() || isVps()) {
      return null;
    }

    try {
      const dataDir = path.dirname(DEV_SESSION_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const now = Date.now();
      const expiresAt = now + SSH_DEV_SESSION_TTL_MS;
      const token = crypto.randomBytes(32).toString('hex');

      const session: SSHDevSession = {
        token,
        createdAt: new Date(now).toISOString(),
        expiresAt,
        ttlSeconds: Math.round(SSH_DEV_SESSION_TTL_MS / 1000),
        sshHost: config.sshHost,
        sshUser: config.sshUser,
        localPort: config.localPort || DEFAULT_SSH_LOCAL_PORT,
      };

      fs.writeFileSync(DEV_SESSION_FILE, JSON.stringify(session, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      try {
        fs.chmodSync(DEV_SESSION_FILE, 0o600);
      } catch {}

      this.addLog(`1 saatlik güvenli yerel geliştirici oturumu oluşturuldu (Bitiş: ${new Date(expiresAt).toLocaleTimeString('tr-TR')}).`);
      return session;
    } catch (err: any) {
      systemLogger.warn('database', `Yerel geliştirici oturumu kaydedilemedi: ${err?.message}`);
      return null;
    }
  }

  /**
   * Aktif ve süresi dolmamış yerel geliştirici oturumunu döndürür.
   */
  public getDevSession(): SSHDevSession | null {
    if (!isSshTunnelAllowed() || isVps()) {
      return null;
    }

    try {
      if (!fs.existsSync(DEV_SESSION_FILE)) {
        return null;
      }
      const raw = fs.readFileSync(DEV_SESSION_FILE, 'utf-8');
      const session = JSON.parse(raw) as SSHDevSession;
      if (!session || !session.expiresAt || !session.token) {
        return null;
      }

      if (Date.now() >= session.expiresAt) {
        this.clearDevSession();
        this.addLog('1 saatlik yerel geliştirici oturumunun süresi doldu.');
        return null;
      }

      return session;
    } catch (err: any) {
      return null;
    }
  }

  /**
   * 1 saatlik yerel geliştirici oturumunu sonlandırır ve dosyayı temizler.
   */
  public clearDevSession(): void {
    try {
      if (fs.existsSync(DEV_SESSION_FILE)) {
        fs.unlinkSync(DEV_SESSION_FILE);
        this.addLog('1 saatlik yerel geliştirici oturumu sonlandırıldı.');
      }
    } catch {
      // ignore
    }
  }

  /**
   * Aktif bir 1 saatlik oturumun bulunup bulunmadığını kontrol eder.
   */
  public hasActiveDevSession(): boolean {
    return this.getDevSession() !== null;
  }

  /**
   * 1 saatlik aktif oturum biletini kullanarak SSH tünelini arka planda otomatik yeniden bağlar.
   * Geliştirme esnasında kod değişiklikleri ile sunucu yeniden başlasa bile kullanıcıdan şifre istemez.
   */
  public async autoConnectDevSession(): Promise<boolean> {
    if (!isSshTunnelAllowed() || isVps()) {
      return false;
    }

    if (this.isConnected()) {
      return true;
    }

    const session = this.getDevSession();
    if (!session) {
      return false;
    }

    if (!this.activeConfig) {
      this.loadSavedConfig();
    }

    if (!this.activeConfig || !this.activeConfig.sshHost) {
      return false;
    }

    const remainingMins = Math.max(1, Math.round((session.expiresAt - Date.now()) / 60000));
    this.addLog(`1 saatlik yerel oturum aktif (${remainingMins} dk kaldı). SSH tüneli otomatik yeniden bağlanıyor...`);

    try {
      const result = await this.connectTunnel(this.activeConfig);
      if (result.success) {
        this.addLog(`Otomatik yeniden bağlanma başarılı! Veritabanı havuzu yenileniyor...`);
        try {
          const { db } = await import('../db.js');
          if (db && typeof db.initPostgresRepository === 'function') {
            await db.initPostgresRepository();
          }
        } catch {}
        return true;
      } else {
        this.addLog(`Otomatik yeniden bağlanma başarısız: ${result.message}`);
        return false;
      }
    } catch (err: any) {
      this.addLog(`Otomatik yeniden bağlanırken hata: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Probes the remote SSH server's public host key fingerprint WITHOUT sending any credentials.
   * Connects only to exchange keys and disconnects immediately during KEX, eliminating MITM exposure.
   */
  public async probeHostFingerprint(
    host: string,
    port: number = 22
  ): Promise<{ success: boolean; sha256?: string; md5?: string; error?: string }> {
    if (!isSshTunnelAllowed()) return { success: false, error: 'SSH tüneli bu ortamda devre dışı.' };
    return new Promise((resolve) => {
      const client = new Client();
      let isResolved = false;
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            client.end();
          } catch {}
          resolve({ success: false, error: 'SSH sunucu parmak izi sorgusu zaman aşımına uğradı (10s).' });
        }
      }, 10000);

      client.on('error', (err: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          let msg = err?.message || 'SSH bağlantı hatası';
          if (err?.code === 'ECONNREFUSED') {
            msg = `SSH sunucusu bağlantıyı reddetti (${host}:${port}).`;
          }
          resolve({ success: false, error: msg });
        }
      });

      const sshConnConfig: ConnectConfig = {
        host: host.trim(),
        port: Number(port) || 22,
        username: 'probe_identity_check',
        readyTimeout: 8000,
        hostVerifier: (hashedKey: string | Buffer, verifyCallback?: (verified: boolean) => void) => {
          const { sha256, md5 } = computeHostFingerprints(hashedKey);
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            // End client connection immediately: host key obtained before any credentials sent
            if (typeof verifyCallback === 'function') {
              verifyCallback(false);
            }
            try {
              client.end();
            } catch {}
            resolve({ success: true, sha256, md5 });
          }
          return false;
        },
      };

      try {
        client.connect(sshConnConfig);
      } catch (err: any) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          resolve({ success: false, error: err?.message || 'SSH bağlantısı başlatılamadı.' });
        }
      }
    });
  }

  public async testConnection(config: SSHTunnelConfig): Promise<{ success: boolean; message: string; hostFingerprint?: string | null }> {
    if (!isSshTunnelAllowed()) return { success: false, message: 'SSH tüneli bu ortamda devre dışı.' };
    if (!config.expectedHostFingerprint?.trim()) {
      return {
        success: false,
        message: 'SSH sunucu SHA256 parmak izini VPS üzerinden doğrulayıp girin. Kimlik doğrulaması başlatılmadı.',
      };
    }

    return new Promise((resolve) => {

      const client = new Client();
      let isResolved = false;
      let discoveredFingerprint: string | null = null;
      let fingerprintError: string | null = null;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            client.end();
          } catch {
            // ignore
          }
          resolve({
            success: false,
            message: 'SSH bağlantı zaman aşımına uğradı (10s). Lütfen IP ve port bilgilerini kontrol edin.',
            hostFingerprint: discoveredFingerprint,
          });
        }
      }, 10000);

      client.on('ready', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          client.end();
          resolve({
            success: true,
            message: `SSH Bağlantısı Başarılı! Sunucu (${config.sshUser}@${config.sshHost}:${config.sshPort || 22}) doğrulandı.${discoveredFingerprint ? ` [Host Key: ${discoveredFingerprint}]` : ''}`,
            hostFingerprint: discoveredFingerprint,
          });
        }
      });

      client.on('error', (err: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          let errMsg = fingerprintError || err?.message || 'SSH Bağlantı hatası';
          if (err?.code === 'ECONNREFUSED') {
            errMsg = `SSH sunucusu bağlantıyı reddetti (${config.sshHost}:${config.sshPort || 22}). SSH servisinin açık olduğunu doğrulayın.`;
          } else if (err?.level === 'client-authentication') {
            errMsg = 'SSH kimlik doğrulama başarısız! Kullanıcı adı, şifre veya SSH Key bilgisini kontrol edin.';
          }
          resolve({
            success: false,
            message: errMsg,
            hostFingerprint: discoveredFingerprint,
          });
        }
      });

      // Resolve effective password / privateKey from config or Vault
      let effectivePassword = config.password;
      if (!effectivePassword || effectivePassword.includes('••••••••')) {
        effectivePassword = systemSecretsService.getSecret('ssh_tunnel_password') || '';
      }
      let effectivePrivateKey = config.privateKey;
      if (!effectivePrivateKey || effectivePrivateKey.includes('••••••••')) {
        effectivePrivateKey = systemSecretsService.getSecret('ssh_tunnel_private_key') || undefined;
      }

      const sshConnConfig: ConnectConfig = {
        host: config.sshHost,
        port: config.sshPort || 22,
        username: config.sshUser,
        readyTimeout: 10000,
        hostVerifier: (hashedKey: string | Buffer, verifyCallback?: (verified: boolean) => void) => {
          const res = verifyHostFingerprint(hashedKey, config.expectedHostFingerprint);
          discoveredFingerprint = res.actualSha256;
          if (!res.valid) {
            fingerprintError = res.error || 'Host fingerprint mismatch';
            this.addLog(`GÜVENLİK UYARISI: ${res.error}`);
            if (typeof verifyCallback === 'function') {
              verifyCallback(false);
            }
            return false;
          }
          if (typeof verifyCallback === 'function') {
            verifyCallback(true);
          }
          return true;
        },
      };

      if (config.authType === 'privateKey') {
        if (!effectivePrivateKey) {
          clearTimeout(timeout);
          isResolved = true;
          client.end();
          return resolve({ success: false, message: 'SSH özel anahtarı bulunamadı.' });
        }
        sshConnConfig.privateKey = effectivePrivateKey;
      } else {
        sshConnConfig.password = effectivePassword || '';
      }

      try {
        client.connect(sshConnConfig);
      } catch (e: any) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `SSH bağlantı başlatılamadı: ${e?.message || e}`,
            hostFingerprint: discoveredFingerprint,
          });
        }
      }
    });
  }

  public async connectTunnel(config: SSHTunnelConfig): Promise<{
    success: boolean;
    message: string;
    localPort?: number;
    transportConnected?: boolean;
    isPgConnected?: boolean;
    databaseState?: string;
    hostFingerprint?: string | null;
  }> {
    if (!isSshTunnelAllowed()) return { success: false, message: 'SSH tüneli bu ortamda devre dışı.' };
    if (!config.expectedHostFingerprint?.trim()) {
      return { success: false, message: 'Zorunlu SSH Host Key Parmak İzi (expectedHostFingerprint) eksik. VPS üzerinden doğruladığınız SHA256 parmak izini girin; bağlantı başlatılmadı.' };
    }
    if (this.status === 'connected' || this.status === 'connecting') {
      await this.disconnectTunnel({ preserveDevSession: true });
    }

    this.status = 'connecting';
    this.lastError = null;

    // Resolve effective password / privateKey from config or Vault if masked
    let effectivePassword = config.password;
    if (!effectivePassword || effectivePassword.includes('••••••••')) {
      effectivePassword = systemSecretsService.getSecret('ssh_tunnel_password') || '';
    }
    let effectivePrivateKey = config.privateKey;
    if (!effectivePrivateKey || effectivePrivateKey.includes('••••••••')) {
      effectivePrivateKey = systemSecretsService.getSecret('ssh_tunnel_private_key') || undefined;
    }

    const fullConfig: SSHTunnelConfig = {
      ...config,
      localPort: Number(config.localPort) || DEFAULT_SSH_LOCAL_PORT,
      password: effectivePassword,
      privateKey: effectivePrivateKey,
    };


    this.activeConfig = fullConfig;
    await this.saveConfig(fullConfig);

    this.addLog(`SSH Tüneli başlatılıyor: ${fullConfig.sshUser}@${fullConfig.sshHost}:${fullConfig.sshPort || 22} -> Local :${fullConfig.localPort}...`);

    return new Promise((resolve) => {
      let isResolved = false;
      const sshClient = new Client();
      this.sshClient = sshClient;

      const connectTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.status = 'error';
          this.lastError = 'SSH bağlantı zaman aşımı (15s)';
          this.addLog('HATA: SSH tüneli bağlantısı zaman aşımına uğradı.');
          this.cleanup();
          resolve({
            success: false,
            message: 'SSH tüneli bağlantı zaman aşımına uğradı.',
          });
        }
      }, 15000);

      sshClient.on('ready', () => {
        this.addLog(`SSH El sıkışması başarılı (${fullConfig.sshUser}@${fullConfig.sshHost})! Yerel port dinleyici oluşturuluyor...`);

        const localPort = fullConfig.localPort || DEFAULT_SSH_LOCAL_PORT;
        const remoteHost = fullConfig.remoteDbHost || '127.0.0.1';
        const remotePort = fullConfig.remoteDbPort || 5432;

        const netServer = net.createServer((socket) => {
          if (!this.sshClient) {
            socket.destroy();
            return;
          }

          this.sshClient.forwardOut(
            socket.remoteAddress || '127.0.0.1',
            socket.remotePort || 0,
            remoteHost,
            remotePort,
            (err, stream) => {
              if (err) {
                this.addLog(`Port yönlendirme hatası (${remoteHost}:${remotePort}): ${err.message}`);
                socket.destroy();
                return;
              }
              socket.pipe(stream).pipe(socket);
              socket.on('error', () => stream.destroy());
              stream.on('error', () => socket.destroy());
            }
          );
        });

        netServer.on('error', (netErr: any) => {
          const errMsg = netErr?.message || 'Yerel port dinleme hatası';
          this.addLog(`Yerel port dinleme hatası (${localPort}): ${errMsg}`);
          if (netErr.code === 'EADDRINUSE') {
            this.addLog(`HATA: Yerel port ${localPort} zaten kullanımda.`);
          }
          this.status = 'error';
          this.lastError = `Yerel port ${localPort} hatası: ${errMsg}`;
          if (!isResolved) {
            isResolved = true;
            clearTimeout(connectTimeout);
            this.cleanup();
            resolve({
              success: false,
              message: netErr.code === 'EADDRINUSE'
                ? `Yerel ${localPort} portu şu anda kullanımda (EADDRINUSE). Lütfen Yerel Port alanına farklı bir port (örneğin 15432 veya 5433) yazarak tekrar deneyin.`
                : `Yerel port dinlenemedi (${localPort}): ${errMsg}`,
            });
          }
        });

        // Clean up previous netServer cleanly before listening
        const startListening = () => {
          netServer.listen(localPort, '127.0.0.1', async () => {
            this.addLog(`AKTİF: SSH Tüneli kuruldu! Yerel 127.0.0.1:${localPort} -> Uzak ${remoteHost}:${remotePort}`);
            this.status = 'connected';
            this.connectedAt = new Date().toISOString();
            this.netServer = netServer;

            if (!isResolved) {
              isResolved = true;
              clearTimeout(connectTimeout);

              // 1. If custom database credentials were provided in the tunnel connection, persist to Vault
              try {
                const { systemSecretsService } = await import('./systemSecrets.service.js');
                const updatePayload: any = {};
                if (config.dbPassword && typeof config.dbPassword === 'string' && config.dbPassword.trim()) {
                  updatePayload.password = config.dbPassword.trim();
                }
                if (config.dbUser && typeof config.dbUser === 'string' && config.dbUser.trim()) {
                  updatePayload.user = config.dbUser.trim();
                }
                if (config.dbName && typeof config.dbName === 'string' && config.dbName.trim()) {
                  updatePayload.database = config.dbName.trim();
                }
                if (Object.keys(updatePayload).length > 0) {
                  await systemSecretsService.updateDatabaseSecrets(updatePayload, 'ssh_tunnel');
                }
              } catch (vaultErr: any) {
                console.warn('[SSHTunnel] Vault credential save notice:', vaultErr?.message);
              }

              // 2. Check whether PostgreSQL password is real or a default placeholder
              const { systemSecretsService } = await import('./systemSecrets.service.js');
              const { isDefaultPassword } = await import('../utils/startupSecurityPolicy.js');
              const { recycleSharedPgPool, getSharedPgPool } = await import('../database/connection.js');
              const currentDbPass = systemSecretsService.getDatabasePassword();
              const hasValidDbPassword = Boolean(currentDbPass && !isDefaultPassword(currentDbPass));

              let isPgConnected = false;
              let dbState = 'DB_UNAVAILABLE';

              if (!hasValidDbPassword) {
                this.addLog(`SSH Tüneli kuruldu (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}). PostgreSQL parolası henüz girilmedi (varsayılan şablon parola kullanılamaz). Lütfen geçerli veritabanı parolanızı kaydedin.`);
              } else {
                try {
                  this.addLog('Veritabanı bağlantısı SSH tüneli (127.0.0.1:' + localPort + ') üzerinden başlatılıyor...');
                  await recycleSharedPgPool();
                  const testPool = getSharedPgPool();
                  if (testPool) {
                    const testClient = await testPool.connect();
                    try {
                      await testClient.query('SELECT 1;');
                      isPgConnected = true;
                      this.addLog('PostgreSQL bağlantısı doğrulandı (SELECT 1 başarılı).');
                    } finally {
                      testClient.release();
                    }
                  }
                  const { db } = await import('../db.js');
                  if (db && typeof db.initPostgresRepository === 'function') {
                    await db.initPostgresRepository();
                    dbState = db.getDatabaseState();
                  }

                  // A successful SELECT 1 confirms connectivity only. It must not
                  // permanently complete installation or persist the ephemeral
                  // 127.0.0.1 tunnel endpoint as the canonical database config.
                  // Setup completion remains owned by the setup/admin flow.
                } catch (pgErr: any) {
                  const errMsg = pgErr?.message || String(pgErr);
                  const lowerMsg = errMsg.toLowerCase();
                  if (lowerMsg.includes('password authentication failed') || lowerMsg.includes('sasl')) {
                    this.addLog('PostgreSQL kimlik doğrulama uyarısı: Girilen veritabanı parolası veya kullanıcı adı geçersiz. Lütfen veritabanı şifrenizi kontrol edin.');
                  } else {
                    this.addLog(`PostgreSQL bağlantı kontrolü uyarısı: ${errMsg}`);
                  }
                }
              }

              const isSuccess = isPgConnected || !hasValidDbPassword;
              if (!isSuccess) {
                this.addLog('GÜVENLİK KONTROLÜ: Veritabanı güvenlik kontrolü başarısız oldu. SSH tüneli otomatik olarak kapatılıyor...');
                this.status = 'error';
                this.lastError = 'PostgreSQL bağlantı doğrulaması başarısız oldu.';
                this.cleanup();
              } else {
                // Başarılı bağlantıda 1 saatlik yerel geliştirici oturumunu başlat/yenile
                this.createOrRenewDevSession(fullConfig);
              }

              const successMsg = isPgConnected
                ? `SSH Tüneli ve PostgreSQL bağlantısı başarıyla kuruldu! (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort})`
                : !hasValidDbPassword
                ? `SSH Tüneli kuruldu (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}). Uzak veritabanına bağlanmak için lütfen PostgreSQL parolanızı giriniz.`
                : `SSH Tüneli kuruldu (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}), ancak PostgreSQL veritabanı bağlantısı kurulamadı. Güvenlik kontrolleri başarısız olduğu için tünel otomatik olarak kapatıldı.`;

              resolve({
                success: isSuccess,
                transportConnected: isSuccess,
                isPgConnected,
                databaseState: dbState,
                message: successMsg,
                localPort,
              });
            }
          });
        };

        if (this.netServer) {
          this.netServer.close(() => {
            this.netServer = null;
            startListening();
          });
        } else {
          startListening();
        }
      });

      let fingerprintError: string | null = null;

      sshClient.on('error', (err: any) => {
        const errMsg = fingerprintError || err?.message || 'SSH Tünel Hatası';
        this.addLog(`HATA: SSH tüneli kesildi veya kurulamadı: ${errMsg}`);
        this.lastError = errMsg;
        this.status = 'error';

        if (!isResolved) {
          isResolved = true;
          clearTimeout(connectTimeout);
          this.cleanup();
          resolve({
            success: false,
            message: `SSH Tüneli kurulamadı: ${errMsg}`,
            hostFingerprint: this.activeHostFingerprint,
          });
        }
      });

      sshClient.on('close', () => {
        this.addLog('SSH Tünel bağlantısı kapandı.');
        if (this.status === 'connected') {
          this.status = 'disconnected';
        }
        this.cleanup();
      });

      const sshConnConfig: ConnectConfig = {
        host: fullConfig.sshHost,
        port: fullConfig.sshPort || 22,
        username: fullConfig.sshUser,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        hostVerifier: (hashedKey: string | Buffer, verifyCallback?: (verified: boolean) => void) => {
          const res = verifyHostFingerprint(hashedKey, fullConfig.expectedHostFingerprint);
          this.activeHostFingerprint = res.actualSha256;
          if (!res.valid) {
            fingerprintError = res.error || 'Host fingerprint mismatch';
            this.addLog(`GÜVENLİK UYARISI: ${res.error}`);
            if (typeof verifyCallback === 'function') {
              verifyCallback(false);
            }
            return false;
          }
          this.addLog(`SSH Host Anahtar Parmak İzi doğrulandı: ${res.actualSha256}`);
          if (typeof verifyCallback === 'function') {
            verifyCallback(true);
          }
          return true;
        },
      };

      if (fullConfig.authType === 'privateKey') {
        if (!effectivePrivateKey) {
          clearTimeout(connectTimeout);
          this.status = 'error';
          isResolved = true;
          this.cleanup();
          return resolve({ success: false, message: 'SSH özel anahtarı bulunamadı.' });
        }
        sshConnConfig.privateKey = effectivePrivateKey;
      } else {
        sshConnConfig.password = effectivePassword || '';
      }

      try {
        sshClient.connect(sshConnConfig);
      } catch (e: any) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(connectTimeout);
          this.status = 'error';
          this.lastError = e?.message || 'SSH başlatılamadı';
          resolve({
            success: false,
            message: `SSH Tünel başlatma hatası: ${e?.message || e}`,
            hostFingerprint: this.activeHostFingerprint,
          });
        }
      }
    });
  }

  public async disconnectTunnel(options?: { preserveDevSession?: boolean }): Promise<{ success: boolean; message: string }> {
    this.addLog('SSH Tüneli kapatılıyor...');
    this.status = 'disconnected';
    this.cleanup();
    if (!options?.preserveDevSession) {
      this.clearDevSession();
    }
    this.addLog('SSH Tüneli tamamen kapatıldı.');
    try {
      const { recycleSharedPgPool } = await import('../database/connection.js');
      await recycleSharedPgPool();
      const { db } = await import('../db.js');
      if (db && typeof db.initPostgresRepository === 'function') {
        db.initPostgresRepository().catch(() => {});
      }
    } catch {
      // ignore
    }
    return { success: true, message: 'SSH Tüneli başarıyla kapatıldı.' };
  }

  private cleanup() {
    if (this.netServer) {
      try {
        this.netServer.close();
      } catch {
        // ignore
      }
      this.netServer = null;
    }
    if (this.sshClient) {
      try {
        this.sshClient.end();
      } catch {
        // ignore
      }
      this.sshClient = null;
    }
  }
}

export const sshTunnelService = new SSHTunnelService();
