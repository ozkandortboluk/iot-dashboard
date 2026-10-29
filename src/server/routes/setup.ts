import { Router, type Request, type Response } from 'express';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { systemKeysService } from '../services/systemKeys.service.js';
import { setSessionCookie } from './auth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { requireSetupAuth, isRequestSetupAuthenticated, extractSetupToken } from '../middleware/setupAuth.js';
import { db } from '../db.js';
import { isRealAdminUser } from '../database/postgres.js';
import { scheduleSystemReboot } from '../services/systemLifecycle.service.js';

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
 * Resets setup lock and state.
 * Optionally preserves configured DB credentials if preserveConfig is true.
 * If setup is completed, strictly requires active Admin session or Recovery Token.
 * Setup token is never returned in HTTP responses.
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
 * If setup is completed, strictly requires active Admin session or Recovery Token.
 * Setup token is never returned in HTTP responses.
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

/**
 * POST /api/setup/emergency-database-config
 * Disaster-recovery endpoint for updating database configuration & password when in MAINTENANCE mode.
 * Strictly requires either:
 * 1) Valid single-use or stored Recovery Token (from data/.recovery_token)
 * 2) Valid active Admin session
 * 3) Valid Admin email + password matching local admin account
 */
setupRouter.post('/emergency-database-config', (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    code: 'EMERGENCY_DATABASE_CONFIG_DISABLED',
    message: 'Emergency database changes are disabled. Use Administration > System Secrets to safely change the database role or password, and keep the previous role available during rollback.',
  });
});
/*
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`emergency_db:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({ success: false, error: 'Çok fazla istek. Lütfen bekleyin.', retryAfterSeconds: rateLimit.retryAfterSeconds });
  }

  const {
    recoveryToken,
    adminEmail,
    adminPassword,
    host,
    port,
    database,
    user,
    password,
    sslMode,
  } = req.body || {};

  let authenticated = false;

  // 1. Check recovery token (body, header, or cookie)
  const candidateToken = recoveryToken || extractSetupToken(req);
  if (candidateToken && typeof candidateToken === 'string') {
    authenticated = setupService.validateRecoveryToken(candidateToken.trim());
  }

  // 2. Check active admin session
  if (!authenticated) {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.nexus_session_token;
    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) || cookieToken;
    if (token) {
      try {
        const session = (await db.verifySessionAsync?.(token)) || db.verifySession(token);
        if (session && session.user.role === 'admin') {
          authenticated = true;
        }
      } catch {}
    }
  }

  // 3. Check admin credentials (email + password)
  if (!authenticated && adminEmail && adminPassword) {
    try {
      const authResult = await db.authenticate(String(adminEmail).trim(), String(adminPassword));
      if (authResult && authResult.user.role === 'admin') {
        authenticated = true;
      }
    } catch {}
  }

  if (!authenticated) {
    return res.status(401).json({
      success: false,
      code: 'EMERGENCY_AUTH_REQUIRED',
      message: 'Güvenlik doğrulaması başarısız. Lütfen kurtarma anahtarınızı (Recovery Token) veya yönetici bilgilerinizi giriniz.',
      hint: 'Sunucudaki "data/.recovery_token" dosyasındaki anahtarı giriniz.',
    });
  }

  if (password === undefined || password === null) {
    return res.status(400).json({
      success: false,
      message: 'Veritabanı şifresi alanı zorunludur.',
    });
  }

  const currentRuntime = (setupService.getRuntimeConfig() as any) || {};
  const effectiveConfig: DatabaseConfigPayload = {
    host: String(host || currentRuntime.host || 'timescaledb').trim(),
    port: parseInt(String(port || currentRuntime.port || 5432), 10) || 5432,
    database: String(database || currentRuntime.database || 'iot_dashboard').trim(),
    user: String(user || currentRuntime.user || 'iot_user').trim(),
    password: String(password),
    sslMode: sslMode || currentRuntime.sslMode || 'disable',
  };

  try {
    // Test PostgreSQL candidate connection with SELECT 1;
    const testResult = await setupService.testConnection(effectiveConfig, { allowCompletedSetup: true });
    if (!testResult.success) {
      return res.status(400).json({
        success: false,
        message: `Veritabanı bağlantısı doğrulanamadı: ${testResult.message}`,
        errorCode: testResult.errorCode,
      });
    }

    // Persist to server runtime secret file
    setupService.saveRuntimeSecretConfig(effectiveConfig, true);

    // Update vault secrets
    await systemSecretsService.updateDatabaseSecrets(effectiveConfig, 'emergency-maintenance-ui').catch(() => {});

    // Try updating secret file on host if present
    const secretPaths = [
      '/opt/nexusnode-iot/secrets/postgres_password',
      path.resolve(process.cwd(), 'secrets', 'postgres_password'),
    ];
    for (const sPath of secretPaths) {
      try {
        if (fs.existsSync(sPath)) {
          fs.writeFileSync(sPath, effectiveConfig.password, 'utf8');
        }
      } catch {}
    }

    // Recycle shared pool & re-init database repository
    await recycleSharedPgPool().catch(() => {});
    db.savePostgresUrl(setupService.buildConnectionString({ ...effectiveConfig, password: '' }));
    db.recyclePgPool();
    await db.initPostgresRepository(true).catch(() => {});

    // Deactivate local fallback if it was active
    setupService.setLocalFallbackActive(false);

    // Invalidate all active user sessions across PostgreSQL and WAL to prevent stale/unauthorized access with old credentials
    await db.terminateAllSessions('Acil durum veritabanı ayarları güncellendi');
    res.clearCookie('nexus_session_token');

    // Schedule graceful reboot so all connection pools, background workers, and container processes reload with the new database configuration
    scheduleSystemReboot('Acil durum veritabanı ayarları güncellendi - Sistem yeniden başlatılıyor', 1500);

    systemLogger.info(
      'database',
      `Acil durum veritabanı ayarları başarıyla güncellendi (Host: ${effectiveConfig.host}, DB: ${effectiveConfig.database}, User: ${effectiveConfig.user}) (IP: ${clientIp})`
    );

    return res.json({
      success: true,
      message: 'Veritabanı bağlantısı başarıyla doğrulandı ve kaydedildi! Tüm aktif oturumlar kapatıldı, sistem yeniden başlatılıyor.',
      systemMode: 'READY',
      rebooting: true,
      sessionsRevoked: true,
      dbConfig: {
        host: effectiveConfig.host,
        port: effectiveConfig.port,
        database: effectiveConfig.database,
        user: effectiveConfig.user,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Veritabanı konfigürasyonu kaydedilemedi: ${err?.message || err}`,
    });
  }
});

*/
/**
 * POST /api/setup/enable-local-fallback
 * Enables offline local SQLite/WAL fallback mode when PostgreSQL is unreachable.
 * Requires Recovery Token, Active Admin Session, or Admin Email + Password.
 */
setupRouter.post('/enable-local-fallback', async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`local_fallback:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({ success: false, error: 'Çok fazla istek. Lütfen bekleyin.' });
  }

  const { recoveryToken, adminEmail, adminPassword } = req.body || {};
  let authenticated = false;

  const candidateToken = recoveryToken || extractSetupToken(req);
  if (candidateToken && typeof candidateToken === 'string') {
    authenticated = setupService.validateRecoveryToken(candidateToken.trim());
  }

  if (!authenticated) {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.nexus_session_token;
    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) || cookieToken;
    if (token) {
      try {
        const session = (await db.verifySessionAsync?.(token)) || db.verifySession(token);
        if (session && session.user.role === 'admin') {
          authenticated = true;
        }
      } catch {}
    }
  }

  if (!authenticated && adminEmail && adminPassword) {
    try {
      const authResult = await db.authenticate(String(adminEmail).trim(), String(adminPassword));
      if (authResult && authResult.user.role === 'admin') {
        authenticated = true;
      }
    } catch {}
  }

  // If system has no admin, allow fallback for disaster recovery
  if (!authenticated && !db.getUsers().some(isRealAdminUser)) {
    authenticated = true;
  }

  if (!authenticated) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Yerel Moda geçmek için kurtarma anahtarı (Recovery Token) veya yönetici bilgileri gereklidir.',
    });
  }

  setupService.setLocalFallbackActive(true);
  systemLogger.info('system', `Acil durum yerel modu (WAL/SQLite) aktif edildi (IP: ${clientIp})`);

  return res.json({
    success: true,
    message: 'Yerel Mod başarıyla etkinleştirildi. Sisteme erişebilirsiniz.',
    systemMode: 'READY',
  });
});
