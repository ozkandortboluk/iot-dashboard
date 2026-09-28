import { Router, type Request, type Response, type NextFunction } from 'express';
import { sshTunnelService, type SSHTunnelConfig, DEFAULT_SSH_LOCAL_PORT } from '../services/sshTunnel.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { isSshTunnelAllowed } from '../database/connection.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { isRequestSetupAuthenticated } from '../middleware/setupAuth.js';
import { setupService } from '../services/setup.service.js';
import { db } from '../db.js';

export const sshTunnelRouter = Router();

/**
 * Authorization guard for SSH Tunnel operations.
 * - In Development / Preview mode (isSshTunnelAllowed), allow tunnel control directly.
 * - During initial setup mode, allow if setup is in progress.
 * - In Production VPS mode, require authenticated Admin.
 */
async function authorizeSshTunnel(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'development' || isSshTunnelAllowed()) {
    return next();
  }

  const isSetupRoute = req.baseUrl?.startsWith('/api/setup') || req.path?.startsWith('/setup');
  const isSetupCompleted = setupService.isSetupCompleted();

  if (isSetupRoute || !isSetupCompleted) {
    if (isRequestSetupAuthenticated(req, true) || !isSetupCompleted) {
      return next();
    }
  }

  // Otherwise, require standard Admin Authentication
  return authenticateUser(req, res, () => {
    return requireAdmin(req, res, next);
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
 * Test SSH Credentials without keeping tunnel active (Protected)
 */
sshTunnelRouter.post('/test', authorizeSshTunnel, async (req: Request, res: Response) => {
  try {
    const { sshHost, sshPort, sshUser, authType, password, privateKey, remoteDbHost, remoteDbPort, localPort } = req.body || {};

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
 * Connect and establish SSH Tunnel with synchronous PostgreSQL verification (Protected)
 */
sshTunnelRouter.post('/connect', authorizeSshTunnel, async (req: Request, res: Response) => {
  try {
    const { sshHost, sshPort, sshUser, authType, password, privateKey, remoteDbHost, remoteDbPort, localPort } = req.body || {};

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
sshTunnelRouter.post('/disconnect', authorizeSshTunnel, async (_req: Request, res: Response) => {
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
