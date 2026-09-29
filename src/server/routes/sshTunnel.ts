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
 * - If Setup/Recovery Token is valid: Allow access (for wizard, cloud preview setup, and disaster recovery).
 * - Or if user has a valid authenticated Admin session: Allow access.
 * - Otherwise: Reject with 401 Unauthorized. DB outage or setup status does NOT grant anonymous access.
 */
async function requireSshTunnelAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Valid local Setup/Recovery Token grants access
  if (isRequestSetupAuthenticated(req, true)) {
    return next();
  }

  // 2. Otherwise verify authenticated Admin session
  return authenticateUser(req, res, () => {
    return requireAdmin(req, res, next);
  });
}

/**
 * Policy guard: verifies that SSH tunneling is enabled in this environment.
 * Prevents unauthorized or disabled SSH tunnel operations across all modification routes.
 */
function guardSshTunnelPolicy(req: Request, res: Response, next: NextFunction) {
  if (!isSshTunnelAllowed()) {
    return res.status(403).json({
      success: false,
      code: 'SSH_TUNNEL_DISALLOWED',
      error: 'SSH Tüneli bu ortamda devre dışı bırakılmıştır.',
      message: 'ENABLE_SSH_TUNNEL=false veya sunucu politikası nedeniyle SSH tüneli kullanılamaz.',
    });
  }
  return next();
}

/**
 * POST /api/system/ssh-tunnel/probe-fingerprint & POST /api/setup/ssh-tunnel/probe-fingerprint
 * Safely inspects the remote SSH server's public key fingerprint WITHOUT sending any user credentials.
 */
sshTunnelRouter.post('/probe-fingerprint', requireSshTunnelAuth, guardSshTunnelPolicy, async (req: Request, res: Response) => {
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
      transportConnected: state.status === 'connected',
      dbAuthenticated: isDbConnected,
      schemaReady: isDbConnected && databaseState === 'READY',
      setupComplete: databaseState !== 'SETUP',
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
sshTunnelRouter.post('/test', requireSshTunnelAuth, guardSshTunnelPolicy, async (req: Request, res: Response) => {
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
sshTunnelRouter.post('/connect', requireSshTunnelAuth, guardSshTunnelPolicy, async (req: Request, res: Response) => {
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
sshTunnelRouter.post('/disconnect', requireSshTunnelAuth, guardSshTunnelPolicy, async (_req: Request, res: Response) => {
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
