import { Router, type Request, type Response } from 'express';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { emailService } from '../services/email.service.js';
import { db } from '../db.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { isMaskedSecret, sanitizeLogString } from '../utils/crypto.js';

export const secretsRouter = Router();

/**
 * Helper to enforce IP rate limiting on Vault management API routes
 */
function checkVaultRateLimit(req: Request, res: Response, actionKey: string, limitPerMin = 30): boolean {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimit = rateLimiterService.checkIpRateLimit(`vault_api:${actionKey}:${clientIp}`, limitPerMin);
  if (!rateLimit.allowed) {
    res.status(429).json({
      success: false,
      error: 'Çok fazla kütüphane/kasa isteğinde bulunuldu. Lütfen biraz bekleyip tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return false;
  }
  return true;
}

/**
 * Validates key format for custom secrets (alphanumeric, underscore, hyphen, dot; 2-64 chars; no path manipulation)
 */
function isValidSecretKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return false;
  if (trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'encryption_key' ||
    lower === 'encryptionkey' ||
    lower.includes('master_key') ||
    lower.includes('vault_key') ||
    lower.includes('root_key')
  ) {
    return false;
  }
  return true;
}

/**
 * GET /api/system/secrets
 * Retrieves full public summary of system secrets (ALL SENSITIVE FIELDS MASKED).
 * Strictly requires Admin authentication & authorization.
 */
secretsRouter.get('/', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'get_secrets', 60)) return;

  try {
    // If PostgreSQL is ready, perform background sync with PostgreSQL vault
    if (db.postgresRepo?.isReady()) {
      await systemSecretsService.syncWithPostgres(db.postgresRepo);
    }

    const state = systemSecretsService.getPublicSecretsState();
    return res.json({
      success: true,
      data: state,
    });
  } catch (err: any) {
    const cleanMessage = sanitizeLogString(err?.message || 'Sistem güvenlik parametreleri alınamadı.');
    systemLogger.error('security', `Secret bilgileri alınamadı: ${cleanMessage}`);
    return res.status(500).json({
      success: false,
      error: 'Sistem güvenlik parametreleri alınamadı.',
    });
  }
});

/**
 * PUT /api/system/secrets
 * Updates system secrets (database, email, notifications) safely without leaking plaintext.
 * Strictly requires Admin authentication & authorization with input validation and rate limiting.
 */
secretsRouter.put('/', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'put_secrets', 20)) return;

  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';

  const { database, email, notifications } = req.body || {};

  try {
    // 1. Update Database Secrets if provided
    if (database && typeof database === 'object') {
      if (database.port !== undefined && database.port !== null && database.port !== '') {
        const numPort = Number(database.port);
        if (isNaN(numPort) || numPort < 1 || numPort > 65535) {
          return res.status(400).json({ success: false, error: 'Veritabanı port numarası 1 ile 65535 arasında geçerli bir sayı olmalıdır.' });
        }
      }
      if (database.host) {
        setupService.validateDatabaseHost(String(database.host), Number(database.port || 5432));
      }
      if (database.sslMode && !['disable', 'require', 'verify-full'].includes(String(database.sslMode))) {
        return res.status(400).json({ success: false, error: 'Geçersiz veritabanı SSL modu.' });
      }

      await systemSecretsService.updateDatabaseSecrets(database, operatorName);

      // Also propagate to setupService runtime config so DB pool can re-connect
      const currentDb = systemSecretsService.getDatabaseConfig();
      if (currentDb.isConfigured) {
        const payload: DatabaseConfigPayload = {
          host: currentDb.host,
          port: currentDb.port,
          database: currentDb.database,
          user: currentDb.user,
          password: currentDb.password,
          sslMode: (currentDb.sslMode as any) || 'disable',
        };
        try {
          setupService.saveRuntimeSecretConfig(payload, setupService.isSetupCompleted());
          db.savePostgresUrl(setupService.buildConnectionString(payload));
        } catch (dbErr: any) {
          systemLogger.warn('database', `Runtime DB yapılandırması güncellenemedi: ${sanitizeLogString(dbErr?.message || dbErr)}`);
        }
      }
    }

    // 2. Update Email Secrets if provided
    if (email && typeof email === 'object') {
      if (email.provider && !['resend', 'smtp', 'simulated'].includes(String(email.provider))) {
        return res.status(400).json({ success: false, error: 'E-posta servis sağlayıcısı "resend", "smtp" veya "simulated" olmalıdır.' });
      }
      if (email.fromEmail && typeof email.fromEmail === 'string' && email.fromEmail.trim().length > 0 && !email.fromEmail.includes('@')) {
        return res.status(400).json({ success: false, error: 'Geçerli bir gönderici e-posta adresi giriniz.' });
      }
      if (email.smtpPort !== undefined && email.smtpPort !== null && email.smtpPort !== '') {
        const numPort = Number(email.smtpPort);
        if (isNaN(numPort) || numPort < 1 || numPort > 65535) {
          return res.status(400).json({ success: false, error: 'SMTP port numarası 1 ile 65535 arasında geçerli bir sayı olmalıdır.' });
        }
      }

      await systemSecretsService.updateEmailSecrets(email, operatorName);

      // Propagate to db.updateServiceConfig
      const updatePayload: any = {
        email: {
          provider: email.provider,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          resendApiKey: isMaskedSecret(email.resendApiKey) ? undefined : email.resendApiKey,
          smtpHost: email.smtpHost,
          smtpPort: email.smtpPort ? Number(email.smtpPort) : undefined,
          smtpSecure: email.smtpSecure,
          smtpUser: email.smtpUser,
          smtpPass: isMaskedSecret(email.smtpPass) ? undefined : email.smtpPass,
          appBaseUrl: email.appBaseUrl,
        },
      };
      db.updateServiceConfig(updatePayload);
    }

    // 3. Update Notification Secrets if provided
    if (notifications && typeof notifications === 'object') {
      await systemSecretsService.updateNotificationSecrets(notifications, operatorName);

      const notifPayload: any = {};
      if (notifications.telegram) notifPayload.telegram = notifications.telegram;
      if (notifications.whatsapp) notifPayload.whatsapp = notifications.whatsapp;
      if (notifications.webhook) notifPayload.webhook = notifications.webhook;
      db.updateServiceConfig(notifPayload);
    }

    systemLogger.info('security', `Sistem secret parametreleri güncellendi (Kullanıcı: ${operatorName})`);

    const updatedState = systemSecretsService.getPublicSecretsState();
    return res.json({
      success: true,
      message: 'Güvenlik ve secret parametreleri başarıyla güncellendi.',
      data: updatedState,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Secret parametreleri kaydedilemedi.');
    systemLogger.error('security', `Secret parametreleri güncellenirken hata: ${cleanErr}`);
    return res.status(400).json({
      success: false,
      error: cleanErr,
    });
  }
});

/**
 * POST /api/system/secrets/custom
 * Adds or updates an extensible custom secret.
 * Strictly requires Admin authentication & authorization, custom key validation, and rate limiting.
 */
secretsRouter.post('/custom', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'post_custom_secret', 20)) return;

  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';

  const { key, label, description, category, value } = req.body || {};

  if (!isValidSecretKey(key)) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz secret anahtarı (key). Anahtar 2-64 karakter uzunluğunda olmalı, yalnızca harf, rakam, alt çizgi, tire ve nokta içermeli; path traversal (..) içermemelidir.',
    });
  }

  if (category && !['third_party', 'custom'].includes(String(category))) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz secret kategorisi. "third_party" veya "custom" olmalıdır.',
    });
  }

  try {
    const cleanKey = String(key).trim().toLowerCase();

    await systemSecretsService.setCustomSecret(
      {
        key: cleanKey,
        label: label ? String(label).trim().slice(0, 100) : cleanKey,
        description: description ? String(description).trim().slice(0, 255) : undefined,
        category: category || 'custom',
        value: value ? String(value) : '',
      },
      operatorName
    );

    systemLogger.info('security', `Özel secret eklendi/güncellendi: ${cleanKey} (Kullanıcı: ${operatorName})`);

    return res.json({
      success: true,
      message: `"${cleanKey}" adlı secret başarıyla kaydedildi.`,
      data: systemSecretsService.getPublicSecretsState().customSecrets,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Özel secret kaydedilemedi.');
    return res.status(400).json({
      success: false,
      error: cleanErr,
    });
  }
});

/**
 * DELETE /api/system/secrets/custom/:key
 * Deletes a custom secret.
 * Strictly requires Admin authentication & authorization, param validation, and rate limiting.
 */
secretsRouter.delete('/custom/:key', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'del_custom_secret', 20)) return;

  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';
  const { key } = req.params;

  if (!isValidSecretKey(key)) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz secret anahtarı.',
    });
  }

  try {
    const cleanKey = key.trim().toLowerCase();
    const deleted = await systemSecretsService.deleteSecret(cleanKey);
    if (!deleted) {
      return res.status(404).json({ success: false, error: `"${cleanKey}" adlı secret bulunamadı.` });
    }

    systemLogger.info('security', `Özel secret silindi: ${cleanKey} (Kullanıcı: ${operatorName})`);

    return res.json({
      success: true,
      message: `"${cleanKey}" adlı secret silindi.`,
      data: systemSecretsService.getPublicSecretsState().customSecrets,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Secret silinemedi.');
    return res.status(500).json({
      success: false,
      error: cleanErr,
    });
  }
});

/**
 * POST /api/system/secrets/test-database
 * Tests database connectivity using either provided parameters or stored vault secrets.
 * Strictly requires Admin authentication & authorization, input validation, and rate limiting.
 */
secretsRouter.post('/test-database', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'test_database', 10)) return;

  try {
    const body = req.body || {};
    const stored = systemSecretsService.getDatabaseConfig();

    const host = String(body.host || stored.host || '').trim();
    const port = Number(body.port || stored.port || 5432);
    const database = String(body.database || stored.database || '').trim();
    const user = String(body.user || stored.user || '').trim();

    // Masked password protection: if provided password contains masked pattern, use stored vault password
    const rawPassword = body.password ? String(body.password) : '';
    const password = rawPassword && !isMaskedSecret(rawPassword) ? rawPassword : stored.password;

    const validSslModes = ['disable', 'require', 'prefer', 'verify-full'] as const;
    type SslModeType = typeof validSslModes[number];
    const rawSslMode = String(body.sslMode || stored.sslMode || 'disable');
    const sslMode: SslModeType = validSslModes.includes(rawSslMode as any) ? (rawSslMode as SslModeType) : 'disable';

    if (!host || !database || !user) {
      return res.status(400).json({
        success: false,
        message: 'Host, veritabanı adı ve kullanıcı adı alanları gereklidir.',
      });
    }

    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        message: 'Port numarası 1 ile 65535 arasında geçerli bir sayı olmalıdır.',
      });
    }

    setupService.validateDatabaseHost(host, port);

    const testPayload: DatabaseConfigPayload = {
      host,
      port,
      database,
      user,
      password,
      sslMode,
    };

    const result = await setupService.testConnection(testPayload);
    return res.json({
      success: result.success,
      message: result.message ? sanitizeLogString(result.message) : undefined,
      latencyMs: result.latencyMs,
      timescaleAvailable: result.timescaleAvailable,
      timescaleVersion: result.timescaleVersion,
      pgVersion: result.pgVersion,
      errorCode: result.errorCode,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Veritabanı bağlantı testi başarısız oldu.');
    return res.status(400).json({
      success: false,
      message: cleanErr,
    });
  }
});

const testEmailCooldownMap: Map<string, number> = new Map();

/**
 * Checks and enforces a strict 20-second cooldown between consecutive test email sends per IP/Admin
 */
function checkTestEmailCooldown(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const COOLDOWN_MS = 20000; // 20 seconds cooldown
  const lastSent = testEmailCooldownMap.get(ip) || 0;
  const elapsed = now - lastSent;
  if (elapsed < COOLDOWN_MS) {
    const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }
  testEmailCooldownMap.set(ip, now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * POST /api/system/secrets/test-email
 * Tests email sending using either provided parameters or stored vault secrets.
 * Strictly requires Admin authentication & authorization, input validation, rate limiting (3/5min) and a 20s cooldown.
 */
secretsRouter.post('/test-email', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // 1. Strict Rate Limit: Max 3 requests per minute per IP
  const rateCheck = rateLimiterService.checkIpRateLimit(`vault_api:test_email:${clientIp}`, 3);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Test e-postası gönderme kotasına ulaşıldı (En fazla 5 dakikada 3 istek). Lütfen bekleyip tekrar deneyin.',
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
  }

  // 2. Cooldown Enforcement: Minimum 20 seconds between consecutive test email dispatches
  const cooldownCheck = checkTestEmailCooldown(clientIp);
  if (!cooldownCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: `Test e-postaları arasında en az 20 saniye beklenmelidir. Lütfen ${cooldownCheck.retryAfterSeconds} saniye sonra tekrar deneyiniz.`,
      retryAfterSeconds: cooldownCheck.retryAfterSeconds,
    });
  }

  const { testRecipient } = req.body || {};
  const recipient = String(testRecipient || '').trim();

  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return res.status(400).json({
      success: false,
      error: 'Lütfen test e-postasının gönderileceği geçerli bir alıcı e-posta adresi giriniz.',
    });
  }

  try {
    const result = await emailService.sendTestEmail({ to: recipient });
    return res.json({
      success: result.success,
      provider: result.provider,
      messageId: result.messageId,
      error: result.error ? sanitizeLogString(result.error) : undefined,
      simulated: result.simulated,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Test e-postası gönderilemedi.');
    return res.status(500).json({
      success: false,
      error: cleanErr,
    });
  }
});

/**
 * POST /api/system/secrets/migrate-keys
 * Safely imports existing production keys and secrets from environment and legacy files
 * into Central Security Vault (AES-256-GCM) with ZERO key re-generation and ZERO data loss.
 * Strictly requires Admin authentication & authorization with IP rate limiting.
 */
secretsRouter.post('/migrate-keys', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  if (!checkVaultRateLimit(req, res, 'migrate_keys', 10)) return;

  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';

  try {
    const result = await systemSecretsService.migrateLegacySecrets();
    systemLogger.info('security', `Admin operatörü (${operatorName}) tarafından mevcut sistem anahtarları Vault kasasına aktarıldı (${result.migratedCount} adet anahtar).`);

    const updatedState = systemSecretsService.getPublicSecretsState();

    return res.json({
      success: true,
      message: result.migratedCount > 0
        ? `${result.migratedCount} adet mevcut üretim anahtarı (değerleri korunarak) Vault kasasına başarıyla aktarıldı.`
        : 'Tüm mevcut sistem anahtarları zaten Vault kasasında güvenle korunmaktadır. Hiçbir anahtar değiştirilmedi.',
      migratedCount: result.migratedCount,
      keys: result.keys,
      data: updatedState,
    });
  } catch (err: any) {
    const cleanErr = sanitizeLogString(err?.message || 'Sistem anahtarları kasaya aktarılamadı.');
    systemLogger.error('security', `Kasa aktarım hatası: ${cleanErr}`);
    return res.status(500).json({
      success: false,
      error: cleanErr,
    });
  }
});

