import { Client, type ConnectConfig } from 'ssh2';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { systemLogger } from './systemLogger.service.js';
import { systemSecretsService } from './systemSecrets.service.js';

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
}

export type SSHTunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSHTunnelState {
  status: SSHTunnelStatus;
  config: SSHTunnelConfig | null;
  lastError: string | null;
  connectedAt: string | null;
  logs: string[];
}

const CONFIG_FILE = path.join(process.cwd(), 'data', '.ssh_tunnel_config.json');
export const DEFAULT_SSH_LOCAL_PORT = 15432;

class SSHTunnelService {
  private sshClient: Client | null = null;
  private netServer: net.Server | null = null;
  private status: SSHTunnelStatus = 'disconnected';
  private lastError: string | null = null;
  private connectedAt: string | null = null;
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
            password: vaultPassword || parsed.password || undefined,
            privateKey: vaultPrivateKey || parsed.privateKey || undefined,
          };
          this.addLog(`Kaydedilmiş SSH tünel yapılandırması yüklendi: ${parsed.sshUser}@${parsed.sshHost} (Local Port: ${this.activeConfig?.localPort})`);
        }
      }
    } catch (err: any) {
      systemLogger.warn('database', `SSH yapılandırma dosyası okunamadı: ${err?.message}`);
    }
  }

  public saveConfig(config: SSHTunnelConfig) {
    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 1. Secure sensitive password & privateKey in System Secrets Vault
      if (config.password && !config.password.includes('••••••••')) {
        systemSecretsService.setSecret('ssh_tunnel_password', config.password, {
          category: 'custom',
          label: 'SSH Tüneli Parolası',
          isSensitive: true,
        }).catch(() => {});
      }
      if (config.privateKey && !config.privateKey.includes('••••••••')) {
        systemSecretsService.setSecret('ssh_tunnel_private_key', config.privateKey, {
          category: 'custom',
          label: 'SSH Tüneli Özel Anahtarı (Private Key)',
          isSensitive: true,
        }).catch(() => {});
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
      };

      this.activeConfig = {
        ...config,
        localPort: config.localPort || DEFAULT_SSH_LOCAL_PORT,
      };

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(sanitizedConfigForDisk, null, 2), 'utf-8');
    } catch (err: any) {
      systemLogger.error('database', `SSH yapılandırması kaydedilemedi: ${err?.message}`);
    }
  }

  public isConnected(): boolean {
    return this.status === 'connected';
  }

  public getLocalPort(): number {
    return this.activeConfig?.localPort || DEFAULT_SSH_LOCAL_PORT;
  }

  public getState(): SSHTunnelState {
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
    };
  }

  public async testConnection(config: SSHTunnelConfig): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const client = new Client();
      let isResolved = false;

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
            message: `SSH Bağlantısı Başarılı! Sunucu (${config.sshUser}@${config.sshHost}:${config.sshPort || 22}) ile el sıkışma sağlandı.`,
          });
        }
      });

      client.on('error', (err: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          let errMsg = err?.message || 'SSH Bağlantı hatası';
          if (err?.code === 'ECONNREFUSED') {
            errMsg = `SSH sunucusu bağlantıyı reddetti (${config.sshHost}:${config.sshPort || 22}). SSH servisinin açık olduğunu doğrulayın.`;
          } else if (err?.level === 'client-authentication') {
            errMsg = 'SSH kimlik doğrulama başarısız! Kullanıcı adı, şifre veya SSH Key bilgisini kontrol edin.';
          }
          resolve({
            success: false,
            message: errMsg,
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
      };

      if (config.authType === 'privateKey' && effectivePrivateKey) {
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
          });
        }
      }
    });
  }

  public async connectTunnel(config: SSHTunnelConfig): Promise<{
    success: boolean;
    message: string;
    localPort?: number;
    isPgConnected?: boolean;
    databaseState?: string;
  }> {
    if (this.status === 'connected' || this.status === 'connecting') {
      await this.disconnectTunnel();
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
    this.saveConfig(fullConfig);

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
          this.addLog(`Yerel port dinleme hatası (${localPort}): ${netErr.message}`);
          if (netErr.code === 'EADDRINUSE') {
            this.addLog(`UYARI: Yerel port ${localPort} kullanımda. Lütfen başka bir port seçin veya mevcut servisi durdurun.`);
          }
        });

        if (this.netServer) {
          try {
            this.netServer.close();
          } catch {
            // ignore
          }
        }

        netServer.listen(localPort, '127.0.0.1', async () => {
          this.addLog(`AKTİF: SSH Tüneli kuruldu! Yerel 127.0.0.1:${localPort} -> Uzak ${remoteHost}:${remotePort}`);
          this.status = 'connected';
          this.connectedAt = new Date().toISOString();
          this.netServer = netServer;

          if (!isResolved) {
            isResolved = true;
            clearTimeout(connectTimeout);

            // Synchronously recycle PostgreSQL pool and test the database connection
            let isPgConnected = false;
            let dbState = 'DB_UNAVAILABLE';
            try {
              this.addLog('Veritabanı bağlantısı SSH tüneli (127.0.0.1:' + localPort + ') üzerinden başlatılıyor...');
              const { recycleSharedPgPool } = await import('../database/connection.js');
              await recycleSharedPgPool();
              const { db } = await import('../db.js');
              if (db && typeof db.initPostgresRepository === 'function') {
                isPgConnected = await db.initPostgresRepository();
                dbState = db.getDatabaseState();
              }
            } catch (pgErr: any) {
              this.addLog(`PostgreSQL bağlantı kontrolü uyarısı: ${pgErr?.message || pgErr}`);
            }

            const successMsg = isPgConnected
              ? `SSH Tüneli ve PostgreSQL bağlantısı başarıyla kuruldu! (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort})`
              : `SSH Tüneli başarıyla kuruldu (127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}), ancak PostgreSQL henüz el sıkışmadı. Lütfen veritabanı kullanıcı adı ve şifrenizi kontrol edin.`;

            resolve({
              success: true,
              message: successMsg,
              localPort,
              isPgConnected,
              databaseState: dbState,
            });
          }
        });
      });

      sshClient.on('error', (err: any) => {
        const errMsg = err?.message || 'SSH Tünel Hatası';
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
      };

      if (fullConfig.authType === 'privateKey' && effectivePrivateKey) {
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
          });
        }
      }
    });
  }

  public async disconnectTunnel(): Promise<{ success: boolean; message: string }> {
    this.addLog('SSH Tüneli kapatılıyor...');
    this.status = 'disconnected';
    this.cleanup();
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
