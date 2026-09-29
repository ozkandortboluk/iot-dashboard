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
 * Authorization guard for SSH Tunnel operations (/status, /test, /connect, /disconnect, /probe-fingerprint):
 * - If Setup Token is valid: Always allow access.
 * - If PostgreSQL is not connected / not ready: Always allow access so operator can bridge to remote DB.
 * - During initial setup (!isSetupCompleted): Allow access so AI Studio preview and wizard can configure tunnel.
 * - When Setup is completed AND DB is connected: Require authenticated Admin session.
 */
async function requireSshTunnelAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Valid Setup Token always grants access (setup, wizard, or disaster recovery)
  if (isRequestSetupAuthenticated(req, true)) {
    return next();
  }

  // 2. If PostgreSQL database is not connected or not ready, allow SSH tunnel operations.
  // The SSH tunnel is the physical transport required to reach PostgreSQL.
  // Requiring DB-backed user authentication when the DB connection is down
  // creates an impossible circular dependency (lockout).
  const isDbReady = Boolean(db.postgresRepo?.isReady());
  if (!isDbReady) {
    return next();
  }

  // 3. During initial setup mode, allow SSH tunnel configuration to bridge to the database
  const isCompleted = setupService.isSetupCompleted();
  if (!isCompleted) {
    return next();
  }

  // 4. If database is connected and setup is completed, require authenticated Admin user
  return authenticateUser(req, res, () => {
    return requireAdmin(req, res, next);
  });
}

/**
 * POST /api/system/ssh-tunnel/probe-fingerprint & POST /api/setup/ssh-tunnel/probe-fingerprint
 * Safely inspects the remote SSH server's public key fingerprint WITHOUT sending any user credentials.
 */
sshTunnelRouter.post('/probe-fingerprint', requireSshTunnelAuth, async (req: Request, res: Response) => {
  try {
    const { sshHost, sshPort } = req.body || {};
    if (!sshHost) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen SSH Sunucu Adresi (Host) giriniz.',
      });
    }

    const result = await sshTunnelService.probeHostFingerprint(String(sshHost), Number(sshPort) || 22);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Parmak izi sorgulanırken hata: ${err?.message || err}`,
    });
  }
});

/**
 * GET /api/system/ssh-tunnel/status & GET /api/setup/ssh-tunnel/status
 * Status endpoint for SSH Tunnel (Protected: setup mode or admin authorization required)
 */
sshTunnelRouter.get('/status', requireSshTunnelAuth, (req: Request, res: Response) => {
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
