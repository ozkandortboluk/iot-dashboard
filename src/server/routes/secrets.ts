import { Router, type Request, type Response } from 'express';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { setupService, type DatabaseConfigPayload } from '../services/setup.service.js';
import { emailService } from '../services/email.service.js';
import { db } from '../db.js';
import { systemLogger } from '../services/systemLogger.service.js';

export const secretsRouter = Router();

/**
 * GET /api/system/secrets
 * Retrieves full public summary of system secrets (ALL SENSITIVE FIELDS MASKED).
 * Strictly requires Admin authorization.
 */
secretsRouter.get('/', authenticateUser, requireAdmin, async (_req: Request, res: Response) => {
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
    systemLogger.error('security', `Secret bilgileri alınamadı: ${err?.message || err}`);
    return res.status(500).json({
      success: false,
      error: 'Sistem güvenlik parametreleri alınamadı.',
    });
  }
});

/**
 * PUT /api/system/secrets
 * Updates system secrets (database, email, notifications) safely without leaking plaintext.
 * Strictly requires Admin authorization.
 */
secretsRouter.put('/', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';

  const { database, email, notifications } = req.body || {};

  try {
    // 1. Update Database Secrets if provided
    if (database && typeof database === 'object') {
      if (database.host) {
        setupService.validateDatabaseHost(database.host, database.port);
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
          systemLogger.warn('database', `Runtime DB yapılandırması güncellenemedi: ${dbErr?.message || dbErr}`);
        }
      }
    }

    // 2. Update Email Secrets if provided
    if (email && typeof email === 'object') {
      await systemSecretsService.updateEmailSecrets(email, operatorName);

      // Propagate to db.updateServiceConfig
      const updatePayload: any = {
        email: {
          provider: email.provider,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          resendApiKey: email.resendApiKey,
          smtpHost: email.smtpHost,
          smtpPort: email.smtpPort ? Number(email.smtpPort) : undefined,
          smtpSecure: email.smtpSecure,
          smtpUser: email.smtpUser,
          smtpPass: email.smtpPass,
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
    systemLogger.error('security', `Secret parametreleri güncellenirken hata: ${err?.message || err}`);
    return res.status(400).json({
      success: false,
      error: err?.message || 'Secret parametreleri kaydedilemedi.',
    });
  }
});

/**
 * POST /api/system/secrets/custom
 * Adds or updates an extensible custom secret
 */
secretsRouter.post('/custom', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';

  const { key, label, description, category, value } = req.body || {};

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, error: 'Secret anahtarı (key) zorunludur.' });
  }

  try {
    await systemSecretsService.setCustomSecret(
      {
        key,
        label: label || key,
        description,
        category: category || 'custom',
        value: value || '',
      },
      operatorName
    );

    systemLogger.info('security', `Özel secret eklendi/güncellendi: ${key} (Kullanıcı: ${operatorName})`);

    return res.json({
      success: true,
      message: `"${key}" adlı secret başarıyla kaydedildi.`,
      data: systemSecretsService.getPublicSecretsState().customSecrets,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Özel secret kaydedilemedi.',
    });
  }
});

/**
 * DELETE /api/system/secrets/custom/:key
 * Deletes a custom secret
 */
secretsRouter.delete('/custom/:key', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const user = authReq.user;
  const operatorName = user ? `${user.name || user.email} (${user.id})` : 'admin';
  const { key } = req.params;

  try {
    const deleted = await systemSecretsService.deleteSecret(key);
    if (!deleted) {
      return res.status(404).json({ success: false, error: `"${key}" adlı secret bulunamadı.` });
    }

    systemLogger.info('security', `Özel secret silindi: ${key} (Kullanıcı: ${operatorName})`);

    return res.json({
      success: true,
      message: `"${key}" adlı secret silindi.`,
      data: systemSecretsService.getPublicSecretsState().customSecrets,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Secret silinemedi.',
    });
  }
});

/**
 * POST /api/system/secrets/test-database
 * Tests database connectivity using either provided parameters or stored vault secrets
 */
secretsRouter.post('/test-database', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const stored = systemSecretsService.getDatabaseConfig();

    const host = body.host || stored.host;
    const port = Number(body.port || stored.port || 5432);
    const database = body.database || stored.database;
    const user = body.user || stored.user;
    const password = body.password && !body.password.includes('••••') ? body.password : stored.password;
    const sslMode = body.sslMode || stored.sslMode || 'disable';

    if (!host || !database || !user) {
      return res.status(400).json({
        success: false,
        message: 'Host, veritabanı adı ve kullanıcı adı alanları gereklidir.',
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
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err?.message || 'Veritabanı bağlantı testi başarısız oldu.',
    });
  }
});

/**
 * POST /api/system/secrets/test-email
 * Tests email sending using either provided parameters or stored vault secrets
 */
secretsRouter.post('/test-email', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const { testRecipient } = req.body || {};
  const recipient = (testRecipient || '').trim();

  if (!recipient || !recipient.includes('@')) {
    return res.status(400).json({
      success: false,
      error: 'Lütfen test e-postasının gönderileceği geçerli bir alıcı adresi giriniz.',
    });
  }

  try {
    const result = await emailService.sendTestEmail(recipient);
    return res.json({
      success: result.success,
      provider: result.provider,
      messageId: result.messageId,
      error: result.error,
      simulated: result.simulated,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Test e-postası gönderilemedi.',
    });
  }
});
