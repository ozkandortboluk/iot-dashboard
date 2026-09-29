import { Router, type Request, type Response, type NextFunction } from 'express';
import { sshTunnelService, type SSHTunnelConfig, DEFAULT_SSH_LOCAL_PORT } from '../services/sshTunnel.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { isSshTunnelAllowed } from '../database/connection.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';
import { isRequestSetupAuthenticated } from '../middleware/setupAuth.js';
import { setupService } from '../services/setup.service.js';
import { db } from '../db.js';

export const sshTunnelRouter = Router();

/**
 * Strict authorization guard for mutating SSH Tunnel operations (/test, /connect, /disconnect):
 * - If Setup Token is valid (via header, cookie, query, or body), allow operation (during setup, wizard, or recovery).
 * - If Setup is completed, require authenticated Admin session.
 * - Anonymous / unauthorized requests fail closed (401).
 */
async function requireSshTunnelAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Valid Setup Token allows access (during initial setup, wizard, or disaster recovery)
  if (isRequestSetupAuthenticated(req, true)) {
    return next();
  }

  // 2. If setup is completed, require authenticated Admin user
  const isCompleted = setupService.isSetupCompleted();
  if (isCompleted) {
    return authenticateUser(req, res, () => {
      return requireAdmin(req, res, next);
    });
  }

  // 3. Setup is NOT completed and no valid Setup Token provided -> Fail closed (401)
  return res.status(401).json({
    success: false,
    code: 'SETUP_TOKEN_REQUIRED',
    error: 'Yetkisiz SSH Tünel isteği.',
    message: 'İlk kurulum aşamasında SSH tüneli operasyonlarını gerçekleştirmek için geçerli bir Kurulum Güvenlik Anahtarı (Setup Token) gereklidir.',
    hint: 'X-Setup-Token başlığı ile sunucu konsolundaki tokeni gönderiniz.',
  });
}

/**
 * GET /api/system/ssh-tunnel/status & GET /api/setup/ssh-tunnel/status
 * Status endpoint for SSH Tunnel
 */
sshTunnelRouter.get('/status', (req: Request, res: Response) => {
  try {
    const state = sshTunnelService.getState();
    const isDbConnected = Boolean(db.postgresRepo?.isReady());
    const databaseState = db.getDatabaseState();
    const activeEngine = db.getActiveEngine();

    return res.json({
      success: true,
      isTunnelAllowed: isSshTunnelAllowed(),
      isDbConnected,
      databaseState,
      activeEngine,
      ...state,
    });
  } catch (err: any) {
    systemLogger.error('database', `SSH Tünel durumu okunamadı: ${err?.message}`);
    return res.status(500).json({
      success: false,
      error: 'SSH tünel durumu alınamadı.',
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/test & POST /api/setup/ssh-tunnel/test
 * Test SSH Credentials & verify host fingerprint (Protected)
 */
sshTunnelRouter.post('/test', requireSshTunnelAuth, async (req: Request, res: Response) => {
  try {
    const {
      sshHost,
      sshPort,
      sshUser,
      authType,
      password,
      privateKey,
      remoteDbHost,
      remoteDbPort,
      localPort,
      expectedHostFingerprint,
    } = req.body || {};

    if (!sshHost || !sshUser) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen SSH Sunucu Adresi (Host) ve Kullanıcı Adı giriniz.',
      });
    }

    const config: SSHTunnelConfig = {
      sshHost: String(sshHost).trim(),
      sshPort: Number(sshPort) || 22,
      sshUser: String(sshUser).trim(),
      authType: authType === 'privateKey' ? 'privateKey' : 'password',
      password: password ? String(password) : undefined,
      privateKey: privateKey ? String(privateKey) : undefined,
      remoteDbHost: remoteDbHost ? String(remoteDbHost).trim() : '127.0.0.1',
      remoteDbPort: Number(remoteDbPort) || 5432,
      localPort: Number(localPort) || DEFAULT_SSH_LOCAL_PORT,
      expectedHostFingerprint: expectedHostFingerprint ? String(expectedHostFingerprint).trim() : undefined,
    };

    const result = await sshTunnelService.testConnection(config);
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('database', `SSH Tünel test hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH testi sırasında beklenmeyen hata: ${err?.message || err}`,
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/connect & POST /api/setup/ssh-tunnel/connect
 * Connect and establish SSH Tunnel with host key pinning & verification (Protected)
 */
sshTunnelRouter.post('/connect', requireSshTunnelAuth, async (req: Request, res: Response) => {
  try {
    const {
      sshHost,
      sshPort,
      sshUser,
      authType,
      password,
      privateKey,
      remoteDbHost,
      remoteDbPort,
      localPort,
      expectedHostFingerprint,
    } = req.body || {};

    if (!sshHost || !sshUser) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen SSH Sunucu Adresi (Host) ve Kullanıcı Adı giriniz.',
      });
    }

    const config: SSHTunnelConfig = {
      sshHost: String(sshHost).trim(),
      sshPort: Number(sshPort) || 22,
      sshUser: String(sshUser).trim(),
      authType: authType === 'privateKey' ? 'privateKey' : 'password',
      password: password ? String(password) : undefined,
      privateKey: privateKey ? String(privateKey) : undefined,
      remoteDbHost: remoteDbHost ? String(remoteDbHost).trim() : '127.0.0.1',
      remoteDbPort: Number(remoteDbPort) || 5432,
      localPort: Number(localPort) || DEFAULT_SSH_LOCAL_PORT,
      expectedHostFingerprint: expectedHostFingerprint ? String(expectedHostFingerprint).trim() : undefined,
    };

    const result = await sshTunnelService.connectTunnel(config);
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('database', `SSH Tünel başlatma hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH tüneli başlatılamadı: ${err?.message || err}`,
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/disconnect & POST /api/setup/ssh-tunnel/disconnect
 * Disconnect active SSH Tunnel (Protected)
 */
sshTunnelRouter.post('/disconnect', requireSshTunnelAuth, async (_req: Request, res: Response) => {
  try {
    const result = await sshTunnelService.disconnectTunnel();
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('database', `SSH Tünel kapatma hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH tüneli kapatılırken hata oluştu: ${err?.message || err}`,
    });
  }
});
