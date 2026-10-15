import { Router, type Request, type Response, type NextFunction } from 'express';
import { sshTunnelService, type SSHTunnelConfig } from '../services/sshTunnel.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { isSshTunnelAllowed } from '../database/connection.js';
import { aiStudioBootstrapAuthService } from '../services/aiStudioBootstrapAuth.service.js';
import { isVps } from '../config/runtimeEnvironment.js';
import { isVps } from '../config/runtimeEnvironment.js';
import { isVps } from '../config/runtimeEnvironment.js';
import { setupService } from '../services/setup.service.js';
import { isRequestSetupAuthenticated, extractSetupToken } from '../middleware/setupAuth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { isVps } from '../config/runtimeEnvironment.js';

export const sshTunnelRouter = Router();

/**
 * Guard policy: ensures SSH tunnel operations are permitted by runtime configuration.
 */
function guardSshTunnelPolicy(_req: Request, res: Response, next: NextFunction) {
  try {
    if (!isSshTunnelAllowed()) {
      return res.status(403).json({
        success: false,
        code: 'SSH_TUNNEL_DISALLOWED',
        message: 'SSH tünel ve veritabanı yönlendirme özellikleri bu ortamda devre dışıdır.',
      });
    }
    return next();
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `SSH politika denetim hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: 'SSH güvenlik politikası denetlenirken hata oluştu.',
    });
  }
}

/**
 * Auth middleware for SSH tunnel operations.
 * Makes setup token optional in development / non-VPS environments (!isVps()),
 * while preserving strict validation in production VPS (isVps()).
 */
async function requireSshTunnelAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Valid local Setup/Recovery Token grants access
  if (isRequestSetupAuthenticated(req)) {
    return next();
  }

  const setupToken = extractSetupToken(req);
  if (setupToken) {
    const isComplete = setupService.isSetupCompleted();
    const isValidSetup = !isComplete && setupService.validateSetupToken(setupToken);
    const isValidRecovery = isComplete && setupService.validateRecoveryToken(setupToken);
    if (isValidSetup || isValidRecovery) {
      return next();
    }
  }

  // 2. AI Studio Pre-Login Bootstrap Token grants access
  const bootstrapToken = aiStudioBootstrapAuthService.extractBootstrapToken(req);
  if (bootstrapToken && aiStudioBootstrapAuthService.validateBootstrapToken(bootstrapToken)) {
    return next();
  }

  // In development / AI Studio / non-VPS environments, setup token is NOT mandatory!
  if (!isVps()) {
    return next();
  }

  return res.status(401).json({
    success: false,
    code: 'SSH_TUNNEL_AUTH_REQUIRED',
    message: 'SSH tüneli işlemleri için kurulum veya kurtarma anahtarı gereklidir.',
  });
}

/**
 * POST /api/system/ssh-tunnel/bootstrap-token
 * Issues ephemeral bootstrap token for pre-login SSH setup using Setup/Recovery credentials.
 */
sshTunnelRouter.post('/bootstrap-token', guardSshTunnelPolicy, async (req: Request, res: Response) => {
  try {
    // Rate limit check
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateCheck = rateLimiterService?.checkIpRateLimit
      ? rateLimiterService.checkIpRateLimit(`ssh_bootstrap_${clientIp}`, 30)
      : { allowed: true };

    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyiniz.',
      });
    }

    if (!aiStudioBootstrapAuthService.isBootstrapAllowed()) {
      return res.status(403).json({
        success: false,
        code: 'SSH_BOOTSTRAP_DISALLOWED',
        message: 'Bu ortamda ön bağlantı anahtarı oluşturulamaz.',
      });
    }

    const setupToken = extractSetupToken(req);
    if (!setupToken) {
      return res.status(401).json({
        success: false,
        code: 'SSH_BOOTSTRAP_AUTH_REQUIRED',
        message: 'Kurulum veya kurtarma anahtarı gereklidir.',
      });
    }

    const isComplete = setupService.isSetupCompleted();
    const isValidSetup = !isComplete && setupService.validateSetupToken(setupToken);
    const isValidRecovery = isComplete && setupService.validateRecoveryToken(setupToken);

    if (!isValidSetup && !isValidRecovery) {
      return res.status(401).json({
        success: false,
        code: 'SSH_BOOTSTRAP_INVALID_TOKEN',
        message: 'Geçersiz kurulum veya kurtarma anahtarı.',
      });
    }

    const bootstrapToken = aiStudioBootstrapAuthService.createBootstrapToken();
    if (!bootstrapToken) {
      return res.status(500).json({
        success: false,
        message: 'Ön bağlantı anahtarı oluşturulamadı.',
      });
    }

    return res.json({
      success: true,
      bootstrapToken,
      expiresInMinutes: 30,
    });
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `Bootstrap token hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `Ön bağlantı anahtarı oluşturulurken hata oluştu: ${err?.message}`,
    });
  }
});

/**
 * GET /api/system/ssh-tunnel/status
 */
sshTunnelRouter.get('/status', guardSshTunnelPolicy, requireSshTunnelAuth, (_req: Request, res: Response) => {
  try {
    const state = sshTunnelService.getState();
    return res.json({
      success: true,
      ...state,
    });
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `SSH Tünel durumu okunamadı: ${err?.message}`);
    return res.status(500).json({
      success: false,
      error: 'SSH tünel durumu alınamadı.',
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/test
 */
sshTunnelRouter.post('/test', guardSshTunnelPolicy, requireSshTunnelAuth, async (req: Request, res: Response) => {
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
      localPort: Number(localPort) || 5432,
    };

    const result = await sshTunnelService.testConnection(config);
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `SSH Tünel test hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH testi sırasında beklenmeyen hata: ${err?.message || err}`,
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/connect
 */
sshTunnelRouter.post('/connect', guardSshTunnelPolicy, requireSshTunnelAuth, async (req: Request, res: Response) => {
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
      localPort: Number(localPort) || 5432,
    };

    const result = await sshTunnelService.connectTunnel(config);
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `SSH Tünel başlatma hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH tüneli başlatılamadı: ${err?.message || err}`,
    });
  }
});

/**
 * POST /api/system/ssh-tunnel/disconnect
 */
sshTunnelRouter.post('/disconnect', guardSshTunnelPolicy, requireSshTunnelAuth, async (_req: Request, res: Response) => {
  try {
    const result = await sshTunnelService.disconnectTunnel();
    return res.json(result);
  } catch (err: any) {
    systemLogger.error('ssh-tunnel', `SSH Tünel kapatma hatası: ${err?.message}`);
    return res.status(500).json({
      success: false,
      message: `SSH tüneli kapatılırken hata oluştu: ${err?.message || err}`,
    });
  }
});
