import { Router, type Request, type Response } from 'express';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { systemKeysService } from '../services/systemKeys.service.js';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { emailService } from '../services/email.service.js';
import { db } from '../db.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { isMaskedSecret, sanitizeLogString } from '../utils/crypto.js';
import { scheduleSystemReboot } from '../services/systemLifecycle.service.js';

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
 * Helper to produce UI state unified directly from runtime resolvers (Single Source of Truth)
 */
function buildPublicSecretsWithRuntimeKeys() {
  const state = systemSecretsService.getPublicSecretsState();
  const runtimeStatuses = systemKeysService.getKeyStatuses();
  const encKey = runtimeStatuses.keys.encryptionKey;
  const otaRec = systemSecretsService.getSecretRecord('ota.signing_key') || systemSecretsService.getSecretRecord('ota_signing_key');
  const hasVaultOta = Boolean(systemSecretsService.getSecret('ota.signing_key') || systemSecretsService.getSecret('ota_signing_key'));

  state.systemKeys = {
    allConfigured: runtimeStatuses.allConfigured,
    vaultConfigured: encKey.isConfigured,
    vaultSource: encKey.source,
    keys: {
      encryptionKey: {
        keyName: 'ENCRYPTION_KEY',
        isConfigured: encKey.isConfigured,
        source: encKey.source,
        inVault: false,
        maskedValue: encKey.maskedValue || '(AES-256-GCM Root Key Aktif)',
        description: encKey.description,
        keyId: encKey.keyId,
        version: encKey.version,
        rotatable: false,
      },
      otaSigningKey: {
        keyName: 'ota.signing_key',
        isConfigured: hasVaultOta,
        source: 'vault',
        inVault: hasVaultOta,
        maskedValue: hasVaultOta ? '(Ed25519 Vault Korumalı)' : '(Tanımlanmamış)',
        description: 'Firmware imzalama anahtarı Security Vault içinde dahili sır olarak yönetilir.',
        keyId: otaRec?.keyId || 'root_ed25519_v1',
        version: otaRec?.version || 1,
        rotatable: hasVaultOta,
      },
    },
  };
  state.migrationStatus = systemSecretsService.getMigrationStatus();
  return state;
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

    const state = buildPublicSecretsWithRuntimeKeys();
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

  let dbPasswordChanged = false;
  try {
    // 1. Database connection changes are preflighted before any active configuration is mutated.
    if (database && typeof database === 'object') {
      const previousDb = systemSecretsService.getDatabaseConfig();
      const incomingPassword = typeof database.password === 'string' ? database.password : '';
      const candidateDb: DatabaseConfigPayload = {
        host: String(database.host ?? previousDb.host).trim(),
        port: database.port !== undefined && database.port !== null && database.port !== ''
          ? Number(database.port)
          : previousDb.port,
        database: String(database.database ?? previousDb.database).trim(),
        user: String(database.user ?? previousDb.user).trim(),
        password: incomingPassword && !isMaskedSecret(incomingPassword)
          ? incomingPassword.trim()
          : previousDb.password,
        sslMode: (['disable', 'require', 'prefer', 'verify-full'].includes(String(database.sslMode))
          ? String(database.sslMode)
          : previousDb.sslMode || 'disable') as 'disable' | 'require' | 'prefer' | 'verify-full',
      };

      if (isNaN(candidateDb.port) || candidateDb.port < 1 || candidateDb.port > 65535) {
        return res.status(400).json({ success: false, error: 'Veritabanı port numarası 1 ile 65535 arasında geçerli bir sayı olmalıdır.' });
      }
      if (!candidateDb.host || !candidateDb.database || !candidateDb.user || !candidateDb.password) {
        return res.status(400).json({ success: false, error: 'Bağlantı değişikliği için host, veritabanı, kullanıcı ve parola gereklidir.' });
      }
      if (!['disable', 'require', 'prefer', 'verify-full'].includes(candidateDb.sslMode)) {
        return res.status(400).json({ success: false, error: 'Geçersiz veritabanı SSL modu.' });
      }

      // Changing host/port/database can silently point production at a different dataset.
      // This credential-rotation path intentionally supports only the existing database endpoint.
      if (
        candidateDb.host !== previousDb.host ||
        candidateDb.port !== previousDb.port ||
        candidateDb.database !== previousDb.database
      ) {
        return res.status(409).json({
          success: false,
          error: 'Bu ekran yalnızca mevcut veritabanı için kullanıcı/parola ve SSL ayarlarını güvenli biçimde döndürür. Host, port veya veritabanı adını değiştirmek veri kaynağını değiştirebilir; bunun için doğrulanmış yedek, taşıma/şema kontrolü ve ayrı bakım planı gerekir. Hiçbir ayar değiştirilmedi.',
        });
      }

      const passwordChanged = Boolean(
        incomingPassword && !isMaskedSecret(incomingPassword) && candidateDb.password !== previousDb.password,
      );
      const databaseChanged =
        candidateDb.user !== previousDb.user ||
        candidateDb.sslMode !== previousDb.sslMode ||
        passwordChanged;

      if (databaseChanged) {
        if (passwordChanged && candidateDb.user === previousDb.user) {
          return res.status(409).json({
            success: false,
            error: 'Geri dönüşü güvenli tutmak için mevcut PostgreSQL rolünün parolasını yerinde değiştirmeyin. Aynı veritabanında yeni bir rol hazırlayıp yeni rol/parola ile tekrar deneyin; eski rolü doğrulama tamamlanana kadar koruyun.',
          });
        }

        setupService.validateDatabaseHost(candidateDb.host, candidateDb.port);

        // A role switch is reversible only while the previous credentials still work.
        if (candidateDb.user !== previousDb.user) {
          const rollbackProbe = await setupService.testConnection({
            ...previousDb,
            sslMode: previousDb.sslMode as DatabaseConfigPayload['sslMode'],
          }, { allowCompletedSetup: true });
          if (!rollbackProbe.success) {
            return res.status(409).json({
              success: false,
              error: 'Önceki veritabanı rolüyle geri dönüş bağlantısı doğrulanamadı; yeni rol henüz etkinleştirilmedi. Önceki rolü yeniden kullanılabilir hâle getirin ve tekrar deneyin.',
            });
          }
        }

        // Probe the candidate using a short-lived pool. This does not mutate the active URL or pool.
        const probe = await setupService.testConnection(candidateDb, { allowCompletedSetup: true });
        if (!probe.success) {
          return res.status(422).json({
            success: false,
            error: 'Yeni veritabanı bağlantısı doğrulanamadı; mevcut ayarlar korunmuştur.',
            details: sanitizeLogString(probe.message || 'Bağlantı testi başarısız.'),
            errorCode: probe.errorCode,
          });
        }

        // Never switch the application to an empty/uninitialized database by mistake.
        const requiredTables = ['users', 'devices', 'telemetry_readings'];
        const missingTables = requiredTables.filter((table) => !probe.tablesStatus?.[table]);
        if (missingTables.length > 0) {
          return res.status(422).json({
            success: false,
            error: 'Hedef veritabanında NexusNode şeması doğrulanamadı; mevcut ayarlar korunmuştur.',
            details: `Eksik zorunlu tablolar: ${missingTables.join(', ')}. Yeni veritabanını uygulamaya bağlamadan önce verileri ve şemayı kontrollü biçimde taşıyın.`,
          });
        }

        const requiredPrivileges = [
          'schema_usage', 'schema_create',
          'users_select', 'users_insert', 'users_update',
          'devices_select', 'devices_insert', 'devices_update',
          'telemetry_select', 'telemetry_insert', 'sequences_usage',
        ];
        const missingPrivileges = requiredPrivileges.filter((key) => probe.permissionsStatus?.[key] !== true);
        if (missingPrivileges.length > 0) {
          return res.status(422).json({
            success: false,
            error: 'Yeni veritabanı kullanıcısının NexusNode için gerekli yetkileri doğrulanamadı; mevcut ayarlar korunmuştur.',
            details: `Eksik veya doğrulanamayan yetkiler: ${missingPrivileges.join(', ')}. PostgreSQL tarafında gerekli şema, tablo ve sequence yetkilerini verip yeniden deneyin.`,
          });
        }

        try {
          await systemSecretsService.updateDatabaseSecrets(candidateDb, operatorName);
          const effectiveDb = systemSecretsService.getDatabaseConfig();
          const effectivePayload: DatabaseConfigPayload = {
            host: effectiveDb.host,
            port: effectiveDb.port,
            database: effectiveDb.database,
            user: effectiveDb.user,
            password: effectiveDb.password,
            sslMode: effectiveDb.sslMode as any || 'disable',
          };

          setupService.saveRuntimeSecretConfig(effectivePayload, setupService.isSetupCompleted());
          // Persist only non-password connection metadata; the encrypted Vault remains authoritative for passwords.
          db.savePostgresUrl(setupService.buildConnectionString({ ...effectivePayload, password: '' }));
          db.recyclePgPool();
          const connected = await db.initPostgresRepository(true);
          if (!connected) {
            throw new Error('Yeni bağlantı kaydedildi ancak uygulama bağlantı havuzu hazır duruma gelemedi.');
          }

          if (passwordChanged) {
            dbPasswordChanged = true;
            await db.terminateAllSessions('Veritabanı parolası Kasa üzerinden güncellendi');
            res.clearCookie('nexus_session_token');
            scheduleSystemReboot('Veritabanı parolası güncellendi - Sistem yeniden başlatılıyor', 1500);
          }
        } catch (applyError: any) {
          // Best-effort rollback: restore the previous Vault/runtime metadata and reconnect to the old target.
          try {
            await systemSecretsService.updateDatabaseSecrets({
              host: previousDb.host,
              port: previousDb.port,
              database: previousDb.database,
              user: previousDb.user,
              password: previousDb.password,
              sslMode: previousDb.sslMode,
            }, operatorName);
            setupService.saveRuntimeSecretConfig({
              host: previousDb.host,
              port: previousDb.port,
              database: previousDb.database,
              user: previousDb.user,
              password: previousDb.password,
              sslMode: previousDb.sslMode as any,
            }, setupService.isSetupCompleted());
            db.savePostgresUrl(setupService.buildConnectionString({
              host: previousDb.host,
              port: previousDb.port,
              database: previousDb.database,
              user: previousDb.user,
              password: '',
              sslMode: previousDb.sslMode as any,
            }));
            db.recyclePgPool();
            const rollbackConnected = await db.initPostgresRepository(true);
            if (!rollbackConnected) {
              throw new Error('Önceki veritabanı bağlantısı geri yüklendi ancak uygulama havuzu doğrulanamadı.');
            }
          } catch (rollbackError: any) {
            systemLogger.error('database', `DB bağlantı değişikliği geri alınamadı; elle müdahale gerekiyor: ${sanitizeLogString(rollbackError?.message || rollbackError)}`);
            return res.status(503).json({
              success: false,
              error: 'Bağlantı değişikliği başarısız oldu ve otomatik geri dönüş doğrulanamadı. Üretim değişikliklerini durdurun ve sunucu yapılandırmasını inceleyin.',
            });
          }
          return res.status(503).json({
            success: false,
            error: 'Yeni bağlantı etkinleştirilemedi. Önceki bağlantı ayarları geri yüklendi.',
          });
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
      message: dbPasswordChanged
        ? 'Veritabanı parolası başarıyla güncellendi. Güvenlik gereği tüm aktif oturumlar kapatıldı ve sistem yeniden başlatılıyor.'
        : 'Güvenlik ve secret parametreleri başarıyla güncellendi.',
      rebooting: dbPasswordChanged ? true : undefined,
      sessionsRevoked: dbPasswordChanged ? true : undefined,
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

    const result = await setupService.testConnection(testPayload, { allowCompletedSetup: true });
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

    const updatedState = buildPublicSecretsWithRuntimeKeys();

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

