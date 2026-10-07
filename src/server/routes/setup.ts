import { Router, type Request, type Response } from 'express';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { systemKeysService } from '../services/systemKeys.service.js';
import { setSessionCookie } from './auth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { requireSetupAuth, isRequestSetupAuthenticated, extractSetupToken } from '../middleware/setupAuth.js';

export const setupRouter = Router();

function getClientIp(req: Request): string {
  if (req.ip) return req.ip;
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return socketIp;
  return '127.0.0.1';
}

/**
 * GET /api/setup/status
 * Public status endpoint for the First Run Setup Wizard
 */
setupRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const isAuth = isRequestSetupAuthenticated(req);
    const status = await setupService.getStatus(isAuth);
    const keysStatus = systemKeysService.getKeyStatuses();
    return res.json({
      success: true,
      ...status,
      setupToken: undefined,
      keysStatus,
    });
  } catch (err: any) {
    systemLogger.error('server', `Setup durumu alınırken hata: ${err?.message || err}`);
    return res.status(500).json({
      success: false,
      error: 'Kurulum durumu okunamadı.',
    });
  }
});

/**
 * GET /api/setup/keys-status
 * Inspects system root security key status (ENCRYPTION_KEY)
 * Requires Setup Authentication.
 */
setupRouter.get('/keys-status', requireSetupAuth, (req: Request, res: Response) => {
  try {
    const keysStatus = systemKeysService.getKeyStatuses();
    return res.json({
      success: true,
      ...keysStatus,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Sistem anahtarları durumu okunamadı.',
    });
  }
});

/**
 * POST /api/setup/generate-keys
 * Generates ONLY missing system root security key (ENCRYPTION_KEY)
 * Strictly preserves existing keys to avoid data corruption.
 * Requires Setup Authentication.
 */
setupRouter.post('/generate-keys', requireSetupAuth, async (req: Request, res: Response) => {
  try {
    const result = await systemKeysService.generateMissingKeys();
    return res.json({
      success: true,
      ...result,
      keysStatus: systemKeysService.getKeyStatuses(),
    });
  } catch (err: any) {
    systemLogger.error('security', `Sistem anahtarları otomatik üretilirken hata: ${err?.message || err}`);
    return res.status(500).json({
      success: false,
      message: 'Güvenlik anahtarları üretilirken bir hata oluştu.',
    });
  }
});

/**
 * POST /api/setup/verify-token
 * Validates the Setup Security Token and sets setup session cookie.
 */
setupRouter.post('/verify-token', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_token_verify:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Çok fazla doğrulama denemesi. Lütfen biraz bekleyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  if (setupService.isSetupCompleted()) {
    return res.status(403).json({
      success: false,
      code: 'SETUP_LOCKED',
      message: 'NexusNode IoT kurulumu zaten tamamlanmış ve kilitlenmiştir.',
    });
  }

  const token = req.body?.token || extractSetupToken(req);
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'TOKEN_REQUIRED',
      message: 'Lütfen kurulum güvenlik anahtarını (Setup Token) giriniz.',
    });
  }

  const isValid = setupService.validateSetupToken(token);
  if (!isValid) {
    systemLogger.warn('security', `Başarısız kurulum güvenlik anahtarı denemesi (IP: ${clientIp})`);
    return res.status(401).json({
      success: false,
      code: 'INVALID_SETUP_TOKEN',
      message: 'Geçersiz kurulum güvenlik anahtarı. Lütfen sunucu konsolu veya data/.setup_token dosyasındaki anahtarı kontrol ediniz.',
    });
  }

  // Set secure setup session cookie for subsequent browser wizard calls
  res.cookie('nexus_setup_session', token.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  });

  return res.json({
    success: true,
    authenticated: true,
    message: 'Kurulum güvenlik anahtarı başarıyla doğrulandı.',
  });
});

/**
 * POST /api/setup/test-database
 * Tests real PostgreSQL connection with specified credentials.
 * Zero password leaking. Requires Setup Authentication.
 */
setupRouter.post('/test-database', requireSetupAuth, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_test:${clientIp}`, 20);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla test isteği gönderildi. Lütfen biraz bekleyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { host, port, database, user, password, sslMode } = req.body;

  if (!host || !database || !user) {
    return res.status(400).json({
      success: false,
      message: 'Lütfen host, veritabanı adı ve kullanıcı adı alanlarını doldurun.',
    });
  }

  const config: DatabaseConfigPayload = {
    host: String(host).trim(),
    port: parseInt(String(port), 10) || 5432,
    database: String(database).trim(),
    user: String(user).trim(),
    password: password ? String(password) : (setupService.getRuntimeConfig()?.password || systemSecretsService.getDatabasePassword() || ''),
    sslMode: sslMode || 'disable',
  };

  try {
    const result = await setupService.testConnection(config);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Veritabanı bağlantı testi sırasında beklenmeyen bir hata oluştu.',
    });
  }
});

/**
 * POST /api/setup/quick-init-docker
 * 1-Click automated Docker TimescaleDB setup (test, config, schema, migrations)
 * Requires Setup Authentication.
 */
setupRouter.post('/quick-init-docker', requireSetupAuth, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_quick:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla istek gönderildi.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { password } = req.body || {};
  try {
    const result = await setupService.quickInitDocker(password);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err?.message || 'Hızlı Docker veritabanı kurulumu başarısız oldu.',
    });
  }
});

/**
 * POST /api/setup/configure-database
 * Saves valid database credentials to secure runtime secret storage and restarts pool.
 * Requires Setup Authentication.
 */
setupRouter.post('/configure-database', requireSetupAuth, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_cfg:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla istek gönderildi.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { host, port, database, user, password, sslMode } = req.body;

  if (!host || !database || !user) {
    return res.status(400).json({
      success: false,
      message: 'Lütfen host, veritabanı adı ve kullanıcı adı alanlarını eksiksiz girin.',
    });
  }

  const config: DatabaseConfigPayload = {
    host: String(host).trim(),
    port: parseInt(String(port), 10) || 5432,
    database: String(database).trim(),
    user: String(user).trim(),
    password: password ? String(password) : '',
    sslMode: sslMode || 'disable',
  };

  try {
    const result = await setupService.configureDatabase(config);
    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Veritabanı konfigürasyonu kaydedilemedi.';
    const statusCode = msg.includes('Kurulum zaten tamamlanmış') ? 403 : 400;
    return res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
});

/**
 * POST /api/setup/initialize
 * Runs TimescaleDB check, migrations, and canonical schema verification with ZERO DATA LOSS.
 * Requires Setup Authentication.
 */
setupRouter.post('/initialize', requireSetupAuth, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_init:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla istek gönderildi.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  try {
    const result = await setupService.initializeDatabase();
    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Veritabanı ilklendirme işlemi başarısız oldu.';
    const statusCode = msg.includes('Kurulum zaten tamamlanmış') ? 403 : 500;
    return res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
});

/**
 * POST /api/setup/create-admin
 * Creates the primary administrator, hashes password, and finalizes setup mode.
 * Requires Setup Authentication.
 */
setupRouter.post('/create-admin', requireSetupAuth, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_admin:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla istek gönderildi.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { username, name, email, password, passwordConfirm, companyName } = req.body;

  try {
    const result = await setupService.createAdministrator({
      username,
      name,
      email,
      password,
      passwordConfirm,
      companyName,
      ip: clientIp,
    });

    // Set secure session cookie
    if (result.token) {
      setSessionCookie(res, result.token);
    }

    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Yönetici hesabı oluşturulamadı.';
    const statusCode = msg.includes('Kurulum zaten tamamlanmış') || msg.includes('zaten bir yönetici') ? 403 : 400;
    return res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
});

/**
 * POST /api/setup/reset
 * Resets setup lock and state, generates a fresh setup token.
 * Optionally preserves configured DB credentials if preserveConfig is true.
 * Requires the server-side setup token and works even in a locked recovery state.
 */
setupRouter.post('/reset', requireSetupAuth, (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const preserveConfig = req.body?.preserveConfig === true || req.body?.preserveConfig === 'true';

  try {
    const result = setupService.resetSetup(preserveConfig);

    systemLogger.info('security', `Kurulum sıfırlandı (IP: ${clientIp}, preserveConfig: ${preserveConfig})`);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Kurulum sıfırlanamadı.',
      message: err?.message || err,
    });
  }
});

/**
 * POST /api/setup/resume
 * Recovers an interrupted setup wizard session and ensures locks are cleared if admin is missing.
 * Requires the server-side setup token and works for interrupted setup states.
 */
setupRouter.post('/resume', requireSetupAuth, (req: Request, res: Response) => {
  const clientIp = getClientIp(req);

  try {
    const result = setupService.resumeSetup();

    systemLogger.info('security', `Kurulum devam ettirildi (IP: ${clientIp})`);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Kurulum devam ettirilemedi.',
      message: err?.message || err,
    });
  }
});

/**
 * POST /api/setup/recover-admin
 * Single-use console recovery token endpoint for recreating admin user safely
 */
setupRouter.post('/recover-admin', async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`recover_admin:${clientIp}`, 5);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla kurtarma isteği. Lütfen bekleyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { recoveryToken, name, email, password } = req.body || {};
  if (!recoveryToken || !name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Kurtarma anahtarı, ad, e-posta ve şifre alanları zorunludur.',
    });
  }

  try {
    const result = await setupService.recoverAdministrator({
      recoveryToken: String(recoveryToken).trim(),
      name: String(name).trim(),
      email: String(email).trim(),
      password: String(password),
      ip: clientIp,
    });

    if (result.token) {
      setSessionCookie(res, result.token);
    }

    return res.json(result);
  } catch (err: any) {
    systemLogger.warn('security', `Başarısız yönetici kurtarma denemesi (IP: ${clientIp}): ${err?.message || err}`);
    return res.status(400).json({
      success: false,
      message: err?.message || 'Yönetici hesabı kurtarılamadı.',
    });
  }
});
