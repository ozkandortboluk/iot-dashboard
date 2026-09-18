import { Router, type Request, type Response } from 'express';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { setSessionCookie } from './auth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { systemLogger } from '../services/systemLogger.service.js';

export const setupRouter = Router();

function getClientIp(req: Request): string {
  return req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * GET /api/setup/status
 * Public status endpoint for the First Run Setup Wizard
 */
setupRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await setupService.getStatus();
    return res.json({
      success: true,
      ...status,
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
 * POST /api/setup/test-database
 * Tests real PostgreSQL connection with specified credentials.
 * Zero password leaking.
 */
setupRouter.post('/test-database', async (req: Request, res: Response) => {
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
    password: password ? String(password) : (setupService.getRuntimeConfig()?.password || process.env.POSTGRES_PASSWORD || (String(host).trim() === 'timescaledb' || String(host).trim() === 'localhost' ? 'nexus_iot_secure_pass_2026' : '')),
    sslMode: sslMode || 'disable',
  };

  try {
    const result = await setupService.testConnection(config);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Veritabanı bağlantı testi sırasında beklenmeyen bir hata oluştu.',
    });
  }
});

/**
 * POST /api/setup/quick-init-docker
 * 1-Click automated Docker TimescaleDB setup (test, config, schema, migrations)
 */
setupRouter.post('/quick-init-docker', async (req: Request, res: Response) => {
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
 * POST /api/setup/standalone-init
 * Fast standalone administrator initialization (preview/file-backed mode)
 */
setupRouter.post('/standalone-init', async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup_standalone:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla istek gönderildi.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { username, name, email, password, passwordConfirm, companyName } = req.body || {};
  try {
    const result = await setupService.initializeStandalone({
      username,
      name,
      email,
      password,
      passwordConfirm,
      companyName,
      ip: clientIp,
    });

    if (result.token) {
      setSessionCookie(res, result.token);
    }

    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Bağımsız mod yönetici hesabı oluşturulamadı.';
    const statusCode = msg.includes('Kurulum zaten tamamlanmış') || msg.includes('zaten bir yönetici') ? 403 : 400;
    return res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
});

/**
 * POST /api/setup/configure-database
 * Saves valid database credentials to secure runtime secret storage and restarts pool.
 */
setupRouter.post('/configure-database', async (req: Request, res: Response) => {
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
 */
setupRouter.post('/initialize', async (req: Request, res: Response) => {
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
 */
setupRouter.post('/create-admin', async (req: Request, res: Response) => {
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
