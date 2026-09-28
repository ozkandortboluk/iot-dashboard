import { Client, type ConnectConfig } from 'ssh2';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { systemLogger } from './systemLogger.service.js';
import { db } from '../db.js';

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
    systemLogger.info('ssh-tunnel', msg);
  }

  private loadSavedConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.sshHost) {
          this.activeConfig = parsed;
          this.addLog(`Kaydedilmiş SSH tünel yapılandırması yüklendi: ${parsed.sshUser}@${parsed.sshHost}`);
        }
      }
    } catch (err: any) {
      systemLogger.warn('ssh-tunnel', `SSH yapılandırma dosyası okunamadı: ${err?.message}`);
    }
  }

  public saveConfig(config: SSHTunnelConfig) {
    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.activeConfig = { ...config };
      // Save config to file (omit raw credentials in persistent log if needed, but save required params for reconnect)
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err: any) {
      systemLogger.error('ssh-tunnel', `SSH yapılandırması kaydedilemedi: ${err?.message}`);
    }
  }

  public getState(): SSHTunnelState {
    return {
      status: this.status,
      config: this.activeConfig
        ? {
            ...this.activeConfig,
            password: this.activeConfig.password ? '••••••••' : undefined,
            privateKey: this.activeConfig.privateKey ? '••••••••' : undefined,
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
            message: `SSH Bağlantısı Başarılı! Sunucu (${config.sshUser}@${config.sshHost}:${config.sshPort}) ile el sıkışma sağlandı.`,
          });
        }
      });

      client.on('error', (err: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          let errMsg = err?.message || 'SSH Bağlantı hatası';
          if (err?.code === 'ECONNREFUSED') {
            errMsg = `SSH sunucusu bağlantıyı reddetti (${config.sshHost}:${config.sshPort}). SSH servisinin açık olduğunu doğrulayın.`;
          } else if (err?.level === 'client-authentication') {
            errMsg = 'SSH kimlik doğrulama başarısız! Kullanıcı adı, şifre veya SSH Key bilgisini kontrol edin.';
          }
          resolve({
            success: false,
            message: errMsg,
          });
        }
      });

      const sshConnConfig: ConnectConfig = {
        host: config.sshHost,
        port: config.sshPort || 22,
        username: config.sshUser,
        readyTimeout: 10000,
      };

      if (config.authType === 'privateKey' && config.privateKey) {
        sshConnConfig.privateKey = config.privateKey;
      } else {
        sshConnConfig.password = config.password || '';
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

  public async connectTunnel(config: SSHTunnelConfig): Promise<{ success: boolean; message: string }> {
    // If already connected, disconnect first
    if (this.status === 'connected' || this.status === 'connecting') {
      await this.disconnectTunnel();
    }

    this.status = 'connecting';
    this.lastError = null;
    this.activeConfig = { ...config };
    this.saveConfig(config);

    this.addLog(`SSH Tüneli başlatılıyor: ${config.sshUser}@${config.sshHost}:${config.sshPort}...`);

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
        this.addLog(`SSH El sıkışması başarılı (${config.sshUser}@${config.sshHost})! Yerel port yönlendirme oluşturuluyor...`);

        // Create local TCP server to listen on localPort (e.g. 127.0.0.1:5432)
        const localPort = config.localPort || 5432;
        const remoteHost = config.remoteDbHost || '127.0.0.1';
        const remotePort = config.remoteDbPort || 5432;

        const netServer = net.createServer((socket) => {
          this.addLog(`Yerel tünel istemcisi bağlandı (${socket.remoteAddress}:${socket.remotePort}) -> Uzak ${remoteHost}:${remotePort}`);

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
                this.addLog(`Port yönlendirme hatası: ${err.message}`);
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
            this.addLog(`DİKKAT: Local port ${localPort} kullanımda. Tünel yine de hazır ancak yerel servis çakışıyor olabilir.`);
          }
        });

        // Close any existing server
        if (this.netServer) {
          try {
            this.netServer.close();
          } catch {
            // ignore
          }
        }

        netServer.listen(localPort, '127.0.0.1', () => {
          this.addLog(`AKTİF: SSH Tüneli kuruldu! Local http://127.0.0.1:${localPort} -> Remote ${remoteHost}:${remotePort}`);
          this.status = 'connected';
          this.connectedAt = new Date().toISOString();
          this.netServer = netServer;

          if (!isResolved) {
            isResolved = true;
            clearTimeout(connectTimeout);
            
            // Trigger Postgres DB reconnect attempt
            setTimeout(() => {
              this.addLog('Veritabanı bağlantısı tünel üzerinden yeniden başlatılıyor...');
              try {
                if (db && typeof db.reconnectPostgres === 'function') {
                  db.reconnectPostgres();
                }
              } catch (e: any) {
                this.addLog(`Veritabanı yenileme uyarısı: ${e?.message}`);
              }
            }, 1000);

            resolve({
              success: true,
              message: `SSH Tüneli başarıyla kuruldu! Local 127.0.0.1:${localPort} -> Uzak ${remoteHost}:${remotePort}`,
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
        host: config.sshHost,
        port: config.sshPort || 22,
        username: config.sshUser,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      };

      if (config.authType === 'privateKey' && config.privateKey) {
        sshConnConfig.privateKey = config.privateKey;
      } else {
        sshConnConfig.password = config.password || '';
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
