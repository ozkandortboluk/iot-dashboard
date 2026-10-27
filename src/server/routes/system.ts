import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db.js';
import { DatabaseState } from '../../types.js';
import { codexAdminRouter } from '../../codex/admin/router.js';
import { broadcast, getWebSocketClientsCount } from '../services/websocket.js';
import {
  simulatorActive,
  simulatorIntervalMs,
  anomalyProbability,
  activeScenario,
  telemetryIngestedCount,
  setSimulatorActive,
  setSimulatorConfig,
  scheduleSimulationStep,
} from '../services/simulator.js';
import { simulationTelemetryController } from '../controllers/simulationTelemetry.controller.js';
import { simulationTelemetryService } from '../services/simulationTelemetry.service.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { validateSchemaHarmony, CANONICAL_SCHEMA_METADATA, SchemaAuditor } from '../database/schema.js';
import { verifyDrizzleSchemaAlignment } from '../../db/schema.js';
import { DataMaintenanceService } from '../database/dataMaintenance.js';
import { emailService } from '../services/email.service.js';
import { getRuntimeConfig } from '../config/runtimeEnvironment.js';
import { isSshTunnelAllowed } from '../database/connection.js';
import { sshTunnelService } from '../services/sshTunnel.service.js';
import { verifyMasterEncryptionKey, verifyPassword, sanitizeLogString } from '../utils/crypto.js';
import { setupService } from '../services/setup.service.js';
import {
  readBackupDestinationStatus,
  selectBackupDestination,
  enableBackupDestination,
  disableBackupDestination,
} from '../services/backupDestination.service.js';
import {
  APP_NAME,
  APP_VERSION,
  APP_RELEASE_TAG,
  RELEASE_DATE,
  GITHUB_REPO,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_URL,
  GITHUB_VERSION,
  GITHUB_RELEASE_TAG,
} from '../../config/version.js';

const startTime = Date.now();

// System Router
const systemRouter = Router();

// Optional Codex admin plugin route; remove this mount and settings filters to detach the plugin.
systemRouter.use('/system/codex', codexAdminRouter);

// Health Check Endpoints: Liveness (/health/live) & Readiness (/health/ready)
systemRouter.get(['/health/live', '/health/liveness'], (req, res) => {
  res.status(200).json({
    status: 'alive',
    live: true,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

systemRouter.get(['/health/ready', '/health/readiness'], (req, res) => {
  const dbState = db.getDatabaseState();
  const isPostgresReady = !!db.postgresRepo?.isReady() && dbState === DatabaseState.READY;
  const retryStats = typeof db.getRetryQueueStats === 'function' ? db.getRetryQueueStats() : undefined;
  const poolStats = db.postgresRepo?.getPoolStats() || undefined;

  if (isPostgresReady) {
    return res.status(200).json({
      status: 'ready',
      ready: true,
      state: dbState,
      database: {
        status: 'connected',
        engine: 'PostgreSQL / TimescaleDB',
        ready: true,
        pool: poolStats,
      },
      retryQueue: {
        pendingPacketCount: retryStats?.pendingPacketCount || 0,
        pendingReadingCount: retryStats?.pendingReadingCount || 0,
        microBatch: retryStats?.microBatch,
      },
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(503).json({
    status: 'not_ready',
    ready: false,
    state: dbState,
    database: {
      status: dbState === DatabaseState.DB_CONNECTING || dbState === DatabaseState.DB_INITIALIZING ? 'initializing' : 'disconnected',
      engine: 'PostgreSQL / TimescaleDB',
      ready: false,
      pool: poolStats,
      error: 'PostgreSQL / TimescaleDB ana veri tabanına henüz ulaşılamıyor veya kurulum/şema hazır değil.',
    },
    retryQueue: {
      pendingPacketCount: retryStats?.pendingPacketCount || 0,
      pendingReadingCount: retryStats?.pendingReadingCount || 0,
      microBatch: retryStats?.microBatch,
      durable: true,
    },
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

systemRouter.get('/health', (req, res) => {
  const dbState = db.getDatabaseState();
  const isPostgresReady = !!db.postgresRepo?.isReady() && dbState === DatabaseState.READY;
  const retryStats = typeof db.getRetryQueueStats === 'function' ? db.getRetryQueueStats() : undefined;
  const poolStats = db.postgresRepo?.getPoolStats() || undefined;

  const statusCode = isPostgresReady ? 200 : 503;
  return res.status(statusCode).json({
    status: isPostgresReady ? 'healthy' : (dbState === DatabaseState.SETUP ? 'setup_required' : 'degraded'),
    live: true,
    ready: isPostgresReady,
    state: dbState,
    database: {
      status: isPostgresReady ? 'connected' : (dbState === DatabaseState.SETUP ? 'setup' : 'disconnected'),
      engine: 'PostgreSQL / TimescaleDB',
      ready: isPostgresReady,
      pool: poolStats,
    },
    retryQueue: {
      pendingPacketCount: retryStats?.pendingPacketCount || 0,
      pendingReadingCount: retryStats?.pendingReadingCount || 0,
      microBatch: retryStats?.microBatch,
    },
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// Runtime Diagnostics Endpoint (Requirement 13)
systemRouter.get('/runtime', (req, res) => {
  const config = getRuntimeConfig();
  const isTunnelActive = isSshTunnelAllowed() && sshTunnelService.isConnected();
  const isPgReady = Boolean(db.postgresRepo?.isReady());
  const databaseTransport = isTunnelActive ? 'ssh-tunnel' : (isPgReady ? 'postgres-direct' : 'in-memory');

  if (config.isVps) {
    // An Authorization header or cookie is not proof of authentication.
    // Keep public VPS diagnostics minimal regardless of caller-supplied headers.
    return res.json({
      environment: 'vps',
      isVps: true,
      isAiStudio: false,
      production: true,
      sshTunnelAllowed: false,
    });
  }

  const cookieMode = config.isVps || config.isAiStudio ? 'same-origin-secure' : 'local-development';

  return res.json({
    environment: config.environment,
    isVps: false,
    isAiStudio: config.isAiStudio,
    production: config.isProductionRuntime,
    sshTunnelAllowed: isSshTunnelAllowed(),
    cookieMode,
    databaseTransport,
  });
});

// System Version & GitHub Sync Diagnostic Endpoint (v1.49.2)
systemRouter.get(['/system/version', '/version'], (req, res) => {
  const config = getRuntimeConfig();
  const environment = config.isVps ? 'vps' : (config.isAiStudio ? 'aistudio' : 'development');

  let syncStatus: 'synced' | 'ahead' | 'behind' = 'synced';
  if (APP_VERSION > GITHUB_VERSION) {
    syncStatus = 'ahead';
  } else if (APP_VERSION < GITHUB_VERSION) {
    syncStatus = 'behind';
  }

  return res.json({
    appName: APP_NAME,
    version: APP_VERSION,
    releaseTag: APP_RELEASE_TAG,
    releaseDate: RELEASE_DATE,
    environment,
    isVps: config.isVps,
    isAiStudio: config.isAiStudio,
    github: {
      repo: GITHUB_REPO,
      repoUrl: GITHUB_REPO_URL,
      releasesUrl: GITHUB_RELEASES_URL,
      version: GITHUB_VERSION,
      releaseTag: GITHUB_RELEASE_TAG,
      syncStatus,
    },
  });
});

// System Status Endpoint for Frontend / Diagnostics
systemRouter.get(['/system/status', '/system-status'], (req, res) => {
  const dbState = db.getDatabaseState();
  const isPgConfigured = !!(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    process.env.DB_HOST ||
    process.env.POSTGRES_HOST ||
    db.getPostgresUrl()
  );
  const isPostgresReady = !!db.postgresRepo?.isReady() && dbState === DatabaseState.READY;
  const isPostgresConnected = !!db.postgresRepo?.getIsConnected();
  const isSchemaEnsured = !!db.postgresRepo?.getIsSchemaEnsured();
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalReady = !isProduction && dbState === DatabaseState.READY;
  const isReady = isProduction ? isPostgresReady : (isPostgresReady || isLocalReady);
  const poolStats = db.postgresRepo?.getPoolStats() || undefined;

  let dbEngine: 'postgres' | 'local' | 'disconnected' = 'local';
  let dbEngineLabel = 'Yerel Depolama (In-Memory / WAL)';
  let dbStatus: 'connected' | 'connecting' | 'disconnected' | 'error' | 'setup_required' = 'connected';
  let dbStatusLabel = 'Yerel Mod Aktif';
  let dbStatusColor: 'emerald' | 'amber' | 'rose' | 'slate' = 'amber';
  let dbMessage = 'Yerel WAL bellek içi veritabanı aktif.';

  if (isPgConfigured) {
    if (isPostgresReady) {
      dbEngine = 'postgres';
      dbEngineLabel = 'PostgreSQL / TimescaleDB';
      dbStatus = 'connected';
      dbStatusLabel = 'PostgreSQL Bağlı & Aktif';
      dbStatusColor = 'emerald';
      dbMessage = 'PostgreSQL ana veritabanı aktif, şema doğrulanmış ve tüm sorgulara hazır.';
    } else if (dbState === DatabaseState.DB_CONNECTING || dbState === DatabaseState.DB_INITIALIZING) {
      dbEngine = 'postgres';
      dbEngineLabel = 'PostgreSQL / TimescaleDB';
      dbStatus = 'connecting';
      dbStatusLabel = 'PostgreSQL Bağlanıyor...';
      dbStatusColor = 'amber';
      dbMessage = 'PostgreSQL sunucusuna bağlantı kuruluyor ve şema kontrolleri yapılıyor...';
    } else if (dbState === DatabaseState.SETUP) {
      dbEngine = 'postgres';
      dbEngineLabel = 'PostgreSQL / TimescaleDB';
      dbStatus = 'setup_required';
      dbStatusLabel = 'İlk Kurulum Bekleniyor';
      dbStatusColor = 'amber';
      dbMessage = 'Sistem ilk kurulum sihirbazını bekliyor.';
    } else {
      dbEngine = 'disconnected';
      dbEngineLabel = 'PostgreSQL (Bağlantı/Şema Hatası)';
      dbStatus = 'error';
      dbStatusLabel = 'PostgreSQL Bağlı Değil / Hata';
      dbStatusColor = 'rose';
      dbMessage = 'PostgreSQL sunucusuna erişilemiyor veya veritabanı hazır değil. Giriş işlemleri başarısız olabilir.';
    }
  }

  res.json({
    status: isReady ? 'healthy' : (dbState === DatabaseState.SETUP ? 'setup_required' : 'maintenance'),
    databaseState: dbState,
    isReady: isReady,
    activeEngine: isPostgresReady ? (db.getActiveEngine() || 'postgres') : (isPgConfigured ? 'postgres' : 'local'),
    dbEngine,
    dbEngineLabel,
    dbStatus,
    dbStatusLabel,
    dbStatusColor,
    dbMessage,
    isPostgresConfigured: isPgConfigured,
    isPostgresConnected,
    isPostgresReady,
    isSchemaEnsured,
    pool: poolStats,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// OpenAPI & API Documentation (Public)
systemRouter.get('/openapi.json', (req, res) => {
  const openApiPath = path.join(process.cwd(), 'openapi.json');
  if (fs.existsSync(openApiPath)) {
    return res.sendFile(openApiPath);
  }
  res.status(404).json({ error: 'OpenAPI specification not found.' });
});

systemRouter.get('/docs', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>IoT Telemetri & Alarm Platformu API Dokümantasyonu</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
      <style>
        body { margin: 0; background: #0f172a; }
        .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
        .swagger-ui .topbar { display: none; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
      <script>
        window.onload = () => {
          window.ui = SwaggerUIBundle({
            url: '/api/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [SwaggerUIBundle.presets.apis],
          });
        };
      </script>
    </body>
    </html>
  `);
});

systemRouter.get('/system/stats', authenticateUser, (req, res) => {
  const engineConfig = db.getPostgresConfig();
  const dbType = engineConfig?.isPostgresConnected 
    ? (engineConfig.activeEngine === 'timescaledb' ? 'PostgreSQL / TimescaleDB' : 'PostgreSQL')
    : 'Yalıtılmış Mod (Disconnected)';

  res.json({
    activeConnections: getWebSocketClientsCount(),
    requestsPerSec: Number((Math.random() * 12 + 4).toFixed(1)),
    telemetryIngestedTotal: telemetryIngestedCount,
    dbType: dbType,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    simulatorActive,
  });
});

systemRouter.get('/system/postgres-schema', authenticateUser, requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="iot_timescaledb_schema.sql"');
  res.send(db.getPostgresSchemaSQL());
});

systemRouter.get('/system/canonical-schema', authenticateUser, requireAdmin, (req, res) => {
  res.json({
    success: true,
    schemaContract: db.getCanonicalSchemaMetadata(),
    ddl: db.getPostgresSchemaSQL()
  });
});

systemRouter.get('/system/schema-harmony', authenticateUser, requireAdmin, (req, res) => {
  const harmony = validateSchemaHarmony();
  const drizzleAlignment = verifyDrizzleSchemaAlignment();

  res.json({
    success: true,
    isHarmonized: harmony.isHarmonized && drizzleAlignment.isAligned,
    harmony,
    drizzleAlignment,
    timestamp: new Date().toISOString()
  });
});

// System Event Logs
systemRouter.get('/system/events', authenticateUser, requireAdmin, (req, res) => {
  const level = req.query.level as any;
  const category = req.query.category as any;
  const search = req.query.search as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

  const result = systemLogger.getEvents({ level, category, search, limit });
  res.json(result);
});

systemRouter.post('/system/events/clear', authenticateUser, requireAdmin, async (req, res) => {
  systemLogger.clearEvents();
  res.json({ success: true, message: 'Sistem olay günlükleri başarıyla temizlendi.' });
});

// Email Server Configuration (Resend & SMTP)
systemRouter.get('/system/email-config', authenticateUser, requireAdmin, (_req, res) => {
  try {
    const config = emailService.getEmailConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: 'E-posta yapılandırması alınamadı: ' + (err?.message || err) });
  }
});

systemRouter.put('/system/email-config', authenticateUser, requireAdmin, (req, res) => {
  try {
    const updated = emailService.updateEmailConfig(req.body);
    res.json({
      success: true,
      message: 'E-posta sunucu ayarları başarıyla kaydedildi.',
      config: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'E-posta yapılandırması güncellenemedi: ' + (err?.message || err) });
  }
});

systemRouter.post('/system/email-config/test', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const to = (req.body.to || '').trim();
    if (!to || !to.includes('@')) {
      return res.status(400).json({ error: 'Geçerli bir test alıcı e-posta adresi giriniz.' });
    }
    const result = await emailService.sendTestEmail({ to });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Test e-postası gönderilemedi: ' + (err?.message || err) });
  }
});

// Authoritative Factory Reset & Selective Data Wipe Handlers
async function handleFactoryReset(req: AuthenticatedRequest, res: any) {
  try {
    const adminUser = req.user || { id: 'usr_admin', name: 'Sistem Yöneticisi' };
    const {
      adminPassword,
      encryptionKey,
      confirmText,
      wipeDevices,
      wipeTelemetry,
      wipeUsers,
      wipeDashboards,
      wipeAlarms,
      wipeAutomations,
      wipeFirmwares,
      wipeServiceTokens,
      wipeDeviceCommands,
      wipeSystemSettings,
      wipeAuditLogs,
      wipeAll,
      wipeToUnconfigured,
    } = req.body;

    // 1. Strict Administrator Re-Authentication
    // Primary & recommended method: Admin Password verification (never exposing root master key to browser).
    // Backward-compatible fallback: encryptionKey verification.
    let isAuthorized = false;
    let authFailureReason = '';

    if (adminPassword && typeof adminPassword === 'string') {
      const fullAdmin = await db.getUserById(adminUser.id);
      const hashToCheck = fullAdmin?.password_hash || (adminUser as any).password_hash;
      if (hashToCheck && verifyPassword(adminPassword, hashToCheck)) {
        isAuthorized = true;
      } else {
        authFailureReason = 'Girilen yönetici parolası hatalı.';
      }
    } else if (encryptionKey && typeof encryptionKey === 'string') {
      const keyVerification = verifyMasterEncryptionKey(encryptionKey);
      if (keyVerification.valid) {
        isAuthorized = true;
      } else {
        authFailureReason = keyVerification.reason || 'Geçersiz Kasa Şifreleme Anahtarı.';
      }
    } else {
      authFailureReason = 'Sıfırlama işlemi için yönetici parolanız gereklidir.';
    }

    if (!isAuthorized) {
      await db.addAuditLog(
        adminUser.id,
        adminUser.name,
        `Sistem Sıfırlama Denemesi REDDEDİLDİ: ${authFailureReason}`,
        'high'
      );
      systemLogger.critical('security', `[FactoryReset] Yetkisiz sıfırlama denemesi: ${authFailureReason}`);
      return res.status(403).json({
        success: false,
        error: authFailureReason,
        code: 'UNAUTHORIZED_RESET',
      });
    }

    // 2. Validate confirmation text based on reset scope
    const rawConfirm = (confirmText || '').trim();
    const trUpper = rawConfirm.toLocaleUpperCase('tr-TR');
    const enUpper = rawConfirm.toUpperCase();

    if (wipeToUnconfigured) {
      const validPhrases = [
        'SIFIRDAN BAŞLAT',
        'SIFIRDAN BASLAT',
        'SIFIRDAN KURULUM',
        'ILK HALINE DONDUR',
        'İLK HALİNE DÖNDÜR',
        'SIFIRLA',
        'SIFIRDAN',
      ];
      const isValid = validPhrases.some((p) => p === trUpper || p === enUpper);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Sistemi tamamen ilk kurulmamış haline döndürmek için onay metnini ("SIFIRDAN KURULUM" veya "SIFIRLA") yazmanız gerekmektedir.',
          code: 'CONFIRMATION_TEXT_REQUIRED',
        });
      }
    } else if (wipeAll) {
      const validPhrases = ['FABRİKA AYARLARI', 'FABRIKA AYARLARI', 'SIFIRLA'];
      const isValid = validPhrases.some((p) => p === trUpper || p === enUpper);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Tüm sistemi sıfırlamak için onay metnini ("FABRİKA AYARLARI" veya "SIFIRLA") yazmanız gerekmektedir.',
          code: 'CONFIRMATION_TEXT_REQUIRED',
        });
      }
    }

    // 3. Execute Factory Reset in db (PostgreSQL + In-Memory)
    const result = await db.executeFactoryReset({
      wipeDevices: Boolean(wipeDevices || wipeToUnconfigured),
      wipeTelemetry: Boolean(wipeTelemetry || wipeToUnconfigured),
      wipeUsers: Boolean(wipeUsers || wipeToUnconfigured),
      wipeDashboards: Boolean(wipeDashboards || wipeToUnconfigured),
      wipeAlarms: Boolean(wipeAlarms || wipeToUnconfigured),
      wipeAutomations: Boolean(wipeAutomations || wipeToUnconfigured),
      wipeFirmwares: Boolean(wipeFirmwares || wipeToUnconfigured),
      wipeServiceTokens: Boolean(wipeServiceTokens || wipeToUnconfigured),
      wipeDeviceCommands: Boolean(wipeDeviceCommands || wipeToUnconfigured),
      wipeSystemSettings: Boolean(wipeSystemSettings || wipeToUnconfigured),
      wipeAuditLogs: Boolean(wipeAuditLogs || wipeToUnconfigured),
      wipeAll: Boolean(wipeAll || wipeToUnconfigured),
      wipeToUnconfigured: Boolean(wipeToUnconfigured),
    }, adminUser);

    // 4. If wipeToUnconfigured, reset setup wizard to initial clean state
    if (wipeToUnconfigured) {
      setupService.resetSetup(false);
      res.clearCookie('session_token');
      res.clearCookie('auth_token');
      res.clearCookie('nexus_token');
      res.clearCookie('nexus_session');
      res.clearCookie('nexus_setup_session');
      try {
        broadcast('system:mode_changed', { mode: 'SETUP', setupRequired: true, wipeToUnconfigured: true });
      } catch {}
    }

    res.json({
      success: true,
      wipeToUnconfigured: Boolean(wipeToUnconfigured),
      message: wipeToUnconfigured
        ? 'Sistem tamamen ilk kurulmamış (sıfırdan kurulum) haline döndürüldü. Kurulum sihirbazı başlatılıyor...'
        : 'Sistem sıfırlama işlemi başarıyla tamamlandı. Seçilen veri katmanları temizlendi.',
      result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Sistem sıfırlanırken bir hata oluştu: ' + (err?.message || err),
    });
  }
}

// Admin pre-validation endpoint for checking administrator password or master encryption key
systemRouter.post('/system/verify-encryption-key', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const { adminPassword, encryptionKey } = req.body;
    if (adminPassword && typeof adminPassword === 'string') {
      const adminUser = req.user!;
      const fullAdmin = await db.getUserById(adminUser.id);
      const hashToCheck = fullAdmin?.password_hash || (adminUser as any).password_hash;
      const valid = hashToCheck ? verifyPassword(adminPassword, hashToCheck) : false;
      return res.json({
        valid,
        reason: valid ? undefined : 'Girilen yönetici parolası hatalı.',
      });
    }

    if (encryptionKey && typeof encryptionKey === 'string') {
      const verification = verifyMasterEncryptionKey(encryptionKey);
      return res.json({
        valid: verification.valid,
        reason: verification.reason,
      });
    }

    return res.status(400).json({
      valid: false,
      reason: 'Lütfen yönetici parolanızı giriniz.',
    });
  } catch (err: any) {
    return res.status(500).json({
      valid: false,
      reason: err?.message || 'Doğrulama servisi hatası.',
    });
  }
});

systemRouter.post('/system/factory-reset', authenticateUser, requireAdmin, handleFactoryReset);

// Admin Stats & Quotas
const adminRouter = Router();

adminRouter.get('/database-stats', authenticateUser, requireAdmin, async (req, res) => {
  res.json(await db.getDatabaseStats());
});

adminRouter.post('/test-firestore-quota', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.testAndResetFirestoreQuota();
  res.json(result);
});

// Service Token Management (Admin Only)
adminRouter.post('/service-tokens', authenticateUser, requireAdmin, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const { name, userId, tenantId, scopes, expiresInDays } = req.body;

  const targetUserId = userId || user.id;
  const targetTenantId = tenantId || user.tenantId || user.id;

  const created = await db.createServiceTokenAsync({
    name: name || 'AI Studio Integration Token',
    userId: targetUserId,
    tenantId: targetTenantId,
    scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ['devices:read', 'telemetry:read'],
    expiresInDays: typeof expiresInDays === 'number' ? expiresInDays : 365,
  });

  res.json({
    success: true,
    token: created.token, // Plaintext returned ONLY ONCE upon creation
    metadata: created.metadata,
    message: 'Servis jetonu başarıyla oluşturuldu. Bu jeton yalnızca bir kez gösterilmektedir.',
  });
});

adminRouter.get('/service-tokens', authenticateUser, requireAdmin, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const tenantIdQuery = (req.query.tenantId as string) || (user.role === 'admin' ? undefined : user.tenantId || user.id);

  const tokens = await db.listServiceTokensAsync(tenantIdQuery);
  res.json({ success: true, serviceTokens: tokens });
});

adminRouter.delete('/service-tokens/:id', authenticateUser, requireAdmin, async (req, res) => {
  const tokenId = req.params.id;
  if (!tokenId) {
    return res.status(400).json({ error: 'Jeton ID gereklidir.' });
  }

  const success = await db.revokeServiceTokenAsync(tokenId);
  if (!success) {
    return res.status(404).json({ error: 'Servis jetonu bulunamadı veya iptal edilemedi.' });
  }

  res.json({ success: true, message: 'Servis jetonu başarıyla iptal edildi.' });
});

adminRouter.post('/service-tokens/:id/revoke', authenticateUser, requireAdmin, async (req, res) => {
  const tokenId = req.params.id;
  if (!tokenId) {
    return res.status(400).json({ error: 'Jeton ID gereklidir.' });
  }

  const success = await db.revokeServiceTokenAsync(tokenId);
  if (!success) {
    return res.status(404).json({ error: 'Servis jetonu bulunamadı veya iptal edilemedi.' });
  }

  res.json({ success: true, message: 'Servis jetonu başarıyla iptal edildi.' });
});

// Database Management Router
const databaseRouter = Router();

databaseRouter.get('/status', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getDatabaseHealth());
});

// Database Auto-Healer Endpoints
databaseRouter.get('/auto-repair/health', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const report = await db.autoHealer.runHealthCheckAndAutoRepair();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: 'Sağlık raporu alınamadı: ' + (err?.message || err) });
  }
});

databaseRouter.post('/auto-repair/run', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const report = await db.autoHealer.runHealthCheckAndAutoRepair();
    res.json({ success: true, message: 'Otomatik veritabanı onarım ve denetim döngüsü tamamlandı.', report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Otomatik onarım çalıştırılamadı: ' + (err?.message || err) });
  }
});

databaseRouter.get('/pool-stats', authenticateUser, requireAdmin, async (req, res) => {
  const stats = await db.getDatabasePerformanceStats();
  res.json(stats);
});

databaseRouter.get('/growth-analytics', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const analytics = await db.getDatabaseGrowthAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: 'Büyüme analitiği alınamadı: ' + (err?.message || err) });
  }
});

// Administrator-only full disaster-recovery target selector. No secrets and no host command execution.
databaseRouter.get('/dr/destination', authenticateUser, requireAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(readBackupDestinationStatus());
});
databaseRouter.put('/dr/destination', authenticateUser, requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'destination')) {
      return res.status(400).json({ error: 'Yalnızca hedef seçimi kabul edilir.' });
    }
    return res.json(selectBackupDestination(body.destination));
  } catch (e: any) {
    if (typeof e?.message === 'string' && (e.message.startsWith('Geçersiz') || e.message.startsWith('Bu hedef'))) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(503).json({ error: 'Hedef seçimi saklanamadı; mevcut seçim değişmedi.' });
  }
});

databaseRouter.post('/dr/destination/enable', authenticateUser, requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { destination } = req.body || {};
    return res.json(enableBackupDestination(destination));
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Hedef etkinleştirilemedi.' });
  }
});

databaseRouter.post('/dr/destination/disable', authenticateUser, requireAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { destination } = req.body || {};
    return res.json(disableBackupDestination(destination));
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Hedef devre dışı bırakılamadı.' });
  }
});

// Scheduled Backups & Disaster Recovery Endpoints
databaseRouter.get('/scheduled-backups/config', authenticateUser, requireAdmin, (req, res) => {
  try {
    res.json({
      config: db.getScheduledBackupConfig(),
      snapshots: db.listDetailedSnapshots(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Zamanlanmış yedekleme yapılandırması alınamadı: ' + (err?.message || err) });
  }
});

databaseRouter.post('/scheduled-backups/config', authenticateUser, requireAdmin, (req, res) => {
  try {
    const updated = db.updateScheduledBackupConfig(req.body);
    res.json({
      success: true,
      message: 'Zamanlanmış yedekleme ayarları güncellendi.',
      config: updated,
      snapshots: db.listDetailedSnapshots(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Yapılandırma kaydı başarısız: ' + (err?.message || err) });
  }
});

databaseRouter.post('/scheduled-backups/trigger-now', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.triggerSnapshot('manual');
    res.json({
      success: true,
      message: `Anlık snapshot yedeği başarıyla alındı (${snapshot.filename}).`,
      snapshot,
      snapshots: db.listDetailedSnapshots(),
      config: db.getScheduledBackupConfig(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Snapshot tetikleme başarısız: ' + (err?.message || err) });
  }
});

databaseRouter.delete('/scheduled-backups/:filename', authenticateUser, requireAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    const ok = db.deleteBackupFile(filename);
    if (ok) {
      res.json({ success: true, message: `Snapshot yedeği silindi: ${filename}`, snapshots: db.listDetailedSnapshots() });
    } else {
      res.status(404).json({ success: false, error: 'Yedek dosyası bulunamadı veya silinemedi.' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Silme işlemi hatası: ' + (err?.message || err) });
  }
});

databaseRouter.get('/scheduled-backups/download/:filename', authenticateUser, requireAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = db.getBackupFilePath(filename);
    if (!filePath) {
      return res.status(404).json({ error: 'İstenen snapshot dosyası sunucuda bulunamadı.' });
    }
    res.download(filePath, filename);
  } catch (err: any) {
    res.status(500).json({ error: 'İndirme hatası: ' + (err?.message || err) });
  }
});

databaseRouter.get('/scheduled-backups/verify/:filename', authenticateUser, requireAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = db.getBackupFilePath(filename);
    if (!filePath) {
      return res.status(404).json({ success: false, error: 'İstenen snapshot dosyası bulunamadı.' });
    }
    const verification = db.verifyBackupFile(filename);
    res.json({
      success: true,
      filename,
      verification,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Doğrulama hatası: ' + (err?.message || err) });
  }
});

databaseRouter.post('/backup', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.createBackup();
  if (result.success) {
    res.json({ message: 'Veritabanı yedeği başarıyla oluşturuldu.', result });
  } else {
    res.status(500).json({ error: result.error || 'Yedekleme oluşturulamadı.' });
  }
});

databaseRouter.get('/backups', authenticateUser, requireAdmin, (req, res) => {
  res.json({ backups: db.listBackups() });
});

databaseRouter.post('/restore', authenticateUser, requireAdmin, async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Yedek dosya adı belirtilmedi.' });
  }
  const ok = await db.restoreBackup(filename);
  if (ok) {
    res.json({ message: 'Veritabanı yedeği başarıyla geri yüklendi.' });
  } else {
    res.status(400).json({ error: 'Yedek geri yüklenemedi veya dosya bulunamadı.' });
  }
});

databaseRouter.get('/config', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getPostgresConfig());
});

databaseRouter.post('/config', authenticateUser, requireAdmin, async (req, res) => {
  const { engine, postgresUrl } = req.body;
  const targetEngine = engine || db.getActiveEngine() || 'timescaledb';
  if (!targetEngine || !['postgres', 'timescaledb', 'local'].includes(targetEngine)) {
    return res.status(400).json({ error: 'Geçersiz veritabanı motoru seçimi.' });
  }

  // P0.12 Enforce production database policy
  if (process.env.NODE_ENV === 'production' && targetEngine === 'local') {
    return res.status(403).json({ error: 'Production ortamında local veritabanı kullanımına izin verilmemektedir. Sadece PostgreSQL / TimescaleDB kullanılabilir.' });
  }

  if (postgresUrl && targetEngine !== 'local') {
    const probe = await db.testPostgresConnection(postgresUrl);
    if (!probe.success) {
      return res.status(422).json({
        success: false,
        error: 'Yeni bağlantı doğrulanamadı; mevcut bağlantı yapılandırması korunmuştur.',
        details: sanitizeLogString(probe.message || 'Bağlantı testi başarısız.'),
      });
    }
  }

  // A successful probe already committed the candidate URL; do not re-save a raw URL/password here.
  db.setActiveEngine(targetEngine);
  res.json({
    success: true,
    message: `Veritabanı yapılandırması güncellendi.`,
    config: db.getPostgresConfig(),
  });
});

databaseRouter.post('/postgres/save-url', authenticateUser, requireAdmin, async (req, res) => {
  const { postgresUrl } = req.body;
  if (!postgresUrl || typeof postgresUrl !== 'string' || !postgresUrl.trim()) {
    return res.status(400).json({ error: 'Geçersiz veritabanı bağlantı adresi.' });
  }
  const trimmed = postgresUrl.trim();
  const probe = await db.testPostgresConnection(trimmed);
  if (!probe.success) {
    return res.status(422).json({
      success: false,
      error: 'Bağlantı doğrulanamadı; kayıtlı bağlantı değiştirilmedi.',
      details: sanitizeLogString(probe.message || 'Bağlantı testi başarısız.'),
    });
  }
  res.json({
    success: true,
    message: 'Bağlantı doğrulandı ve güvenli biçimde kaydedildi.',
    config: db.getPostgresConfig(),
  });
});

databaseRouter.post('/postgres/test', authenticateUser, requireAdmin, async (req, res) => {
  const { postgresUrl } = req.body;
  const result = await db.testPostgresConnection(postgresUrl);
  res.json(result);
});

databaseRouter.post('/postgres/migrate', authenticateUser, requireAdmin, async (req, res) => {
  const { postgresUrl } = req.body;
  const result = await db.executePostgresMigration(postgresUrl);
  res.json(result);
});

databaseRouter.post('/postgres/sync-all', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.syncAllToPostgres();
  res.json(result);
});

databaseRouter.get('/postgres/setup-guide', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getPostgresSetupGuide());
});

// Canonical Schema Metadata & Schema Auditor Endpoints
databaseRouter.get('/canonical-schema', authenticateUser, requireAdmin, (req, res) => {
  res.json({
    canonicalVersion: CANONICAL_SCHEMA_METADATA.version,
    engine: CANONICAL_SCHEMA_METADATA.engine,
    extensions: CANONICAL_SCHEMA_METADATA.extensions,
    tables: CANONICAL_SCHEMA_METADATA.tables,
    functions: CANONICAL_SCHEMA_METADATA.functions,
    views: CANONICAL_SCHEMA_METADATA.views,
  });
});

databaseRouter.get('/audit', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const auditResult = await db.postgresRepo.auditSchema();
    const drizzleHarmony = verifyDrizzleSchemaAlignment();
    const migrationHarmony = validateSchemaHarmony();

    res.json({
      success: true,
      audit: auditResult,
      alignment: {
        drizzleMatchesCanonical: drizzleHarmony.isAligned,
        migrationMatchesCanonical: migrationHarmony.isHarmonized,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Şema denetimi başarısız oldu: ${err?.message || err}`,
    });
  }
});

databaseRouter.post('/auto-heal', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const healResult = await db.postgresRepo.autoHealSchema();
    res.json({
      success: healResult.success,
      stage: healResult.stage,
      status: healResult.status,
      verificationPassed: healResult.verificationPassed,
      isHealthy: healResult.isHealthy,
      actionsTaken: healResult.actionsTaken,
      beforeReport: healResult.beforeReport,
      afterReport: healResult.afterReport,
      errors: healResult.errors,
      remainingDiscrepancies: healResult.remainingDiscrepancies,
      summaryMessage: healResult.summaryMessage,
      orphanReports: healResult.orphanReports || [],
      message: healResult.summaryMessage || (healResult.actionsTaken.length > 0 
        ? `${healResult.actionsTaken.length} adet şema düzeltmesi başarıyla uygulandı ve doğrulandı.`
        : 'Veritabanı şeması zaten Canonical Schema ile %100 uyumlu.'),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: 'FAIL',
      verificationPassed: false,
      isHealthy: false,
      error: `Otomatik şema onarımı başarısız oldu: ${err?.message || err}`,
    });
  }
});

// Separate Data Maintenance Endpoints (Zero Data Loss Architecture: Schema Repair != Data Cleanup)
databaseRouter.get('/maintenance/violations', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const pool = db.getPgPool();
    if (!pool) {
      return res.json({ success: true, violations: [], count: 0, message: 'PostgreSQL havuzu aktif değil.' });
    }
    const violations = await DataMaintenanceService.scanDataIntegrityViolations(pool);
    res.json({
      success: true,
      violations,
      count: violations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

databaseRouter.post('/maintenance/resolve', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const pool = db.getPgPool();
    if (!pool) {
      return res.status(503).json({ success: false, error: 'PostgreSQL bağlantısı mevcut değil.' });
    }
    const { table, column, referencedTable, referencedColumn, resolutionStrategy, targetParentId, constraintName } = req.body;
    if (!table || !column || !resolutionStrategy) {
      return res.status(400).json({ success: false, error: 'table, column ve resolutionStrategy parametreleri zorunludur.' });
    }
    const adminUserId = req.user?.id || 'usr_admin';
    const action: 'quarantine' | 'reassign_to_admin' | 'purge_with_snapshot' =
      resolutionStrategy === 'REASSIGN_TO_PARENT'
        ? 'reassign_to_admin'
        : resolutionStrategy === 'DELETE_PURGE'
        ? 'purge_with_snapshot'
        : 'quarantine';

    const result = await DataMaintenanceService.executeMaintenanceJob(pool, {
      table,
      constraintName: constraintName || `fk_${table}_${column}`,
      action,
      targetColumn: column,
      referencedTable,
      referencedColumn,
      targetParentId,
      adminUserId,
    });
    res.json({
      success: result.success,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

databaseRouter.get('/maintenance/quarantine', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const pool = db.getPgPool();
    if (!pool) {
      return res.json({ success: true, items: [] });
    }
    const items = await DataMaintenanceService.getQuarantineRecords(pool);
    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Database Explorer & Management Endpoints
databaseRouter.get('/explorer/tables', authenticateUser, requireAdmin, async (req, res) => {
  const counts = await db.getTableCountsAsync();
  const engineConfig = db.getPostgresConfig();
  const tables = [
    { id: 'users', name: 'Kullanıcılar (users)', count: counts.users || 0 },
    { id: 'devices', name: 'Cihazlar (devices)', count: counts.devices || 0 },
    { id: 'telemetry_readings', name: 'Telemetri Verileri (telemetry_readings)', count: counts.telemetry_readings || 0 },
    { id: 'threshold_rules', name: 'Eşik Kuralları (threshold_rules)', count: counts.threshold_rules || 0 },
    { id: 'active_alarms', name: 'Aktif Alarmlar (active_alarms)', count: counts.active_alarms || 0 },
    { id: 'notifications', name: 'Bildirimler (notifications)', count: counts.notifications || 0 },
    { id: 'audit_logs', name: 'Denetim Günlükleri (audit_logs)', count: counts.audit_logs || 0 },
    { id: 'device_commands', name: 'Cihaz Komutları (device_commands)', count: counts.device_commands || 0 },
    { id: 'dispatch_logs', name: 'Gönderim Günlükleri (dispatch_logs)', count: counts.dispatch_logs || 0 },
    { id: 'dashboard_layouts', name: 'Dashboard Düzenleri (dashboard_layouts)', count: counts.dashboard_layouts || 0 },
  ];
  res.json({ tables, isPostgresConnected: engineConfig?.isPostgresConnected || false, activeEngine: engineConfig?.activeEngine });
});

databaseRouter.get('/explorer/data', authenticateUser, requireAdmin, async (req, res) => {
  const table = (req.query.table as string) || 'users';
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const search = (req.query.search as string) || '';
  const result = await db.getTableDataExplorer(table, page, limit, search);
  res.json(result);
});

databaseRouter.post('/explorer/record', authenticateUser, requireAdmin, async (req, res) => {
  const { table, record } = req.body;
  if (!table || !record) return res.status(400).json({ error: 'Tablo adı ve kayıt bilgisi zorunludur.' });
  const result = await db.insertTableRecord(table, record);
  res.json(result);
});

databaseRouter.put('/explorer/record', authenticateUser, requireAdmin, async (req, res) => {
  const { table, id, updates } = req.body;
  if (!table || !id || !updates) return res.status(400).json({ error: 'Tablo adı, kayıt ID ve güncelleme verisi zorunludur.' });
  const result = await db.updateTableRecord(table, id, updates);
  res.json(result);
});

databaseRouter.delete('/explorer/record', authenticateUser, requireAdmin, async (req, res) => {
  const { table, id } = req.body;
  if (!table || !id) return res.status(400).json({ error: 'Tablo adı ve kayıt ID zorunludur.' });
  const result = await db.deleteTableRecord(table, id);
  res.json(result);
});

databaseRouter.post('/explorer/sql', authenticateUser, requireAdmin, async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'Çalıştırılacak SQL ifadesi belirtilmedi.' });
  const result = await db.executeCustomSqlQuery(sql);
  res.json(result);
});

// Data Retention & Cleanup Endpoints
databaseRouter.get('/retention', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getRetentionPolicies());
});

databaseRouter.put('/retention', authenticateUser, requireAdmin, (req, res) => {
  const updated = db.updateRetentionPolicies(req.body);
  res.json(updated);
});

databaseRouter.post('/retention', authenticateUser, requireAdmin, (req, res) => {
  const updated = db.updateRetentionPolicies(req.body);
  res.json(updated);
});

databaseRouter.post('/retention/cleanup', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.executeDataRetentionCleanup(false);
  res.json(result);
});

databaseRouter.post('/retention/cleanup-simulated', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.executeSimulatedDataCleanup();
  res.json(result);
});

databaseRouter.post('/retention/cleanup-category', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { category, days } = req.body || {};
    if (!category) return res.status(400).json({ error: 'Kategori belirtilmedi.' });
    const result = await db.executeCategoryCleanup(category, days ? Number(days) : undefined);
    res.json(result);
  } catch (err: any) {
    console.error('[retention/cleanup-category error]', err?.message || err);
    res.status(500).json({ error: err.message || 'Kategori temizliği sırasında hata oluştu.' });
  }
});

databaseRouter.post('/factory-reset', authenticateUser, requireAdmin, handleFactoryReset);

// TimescaleDB Router
const timescaleRouter = Router();

timescaleRouter.get('/stats', authenticateUser, async (req, res) => {
  try {
    const stats = await db.getTimescaleStatsAsync();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: 'TimescaleDB istatistikleri alınamadı: ' + (err.message || '') });
  }
});

timescaleRouter.post('/compress-now', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const result = await db.compressTimescaleChunksNow();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'TimescaleDB sıkıştırma işlemi başarısız: ' + (err.message || '') });
  }
});

timescaleRouter.post('/policies', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const result = await db.updateTimescalePolicies(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'TimescaleDB politikaları güncellenemedi: ' + (err.message || '') });
  }
});

timescaleRouter.get('/time-bucket', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const { deviceId, metric, bucket = '5m', startTime, endTime } = req.query;

  const isAdmin = user.role === 'admin';
  const userDevices = db.getDevices(user.id, user.id);
  const userDeviceIds = userDevices.map((d) => d.id);

  const targetDeviceId = deviceId as string | undefined;

  if (!isAdmin) {
    if (targetDeviceId && targetDeviceId !== 'all') {
      if (!userDeviceIds.includes(targetDeviceId)) {
        return res.status(403).json({ error: 'Bu cihaza ve verilerine erişim yetkiniz bulunmamaktadır.' });
      }
    } else if (userDeviceIds.length === 0) {
      return res.json([]);
    }
  }

  try {
    const result = await db.queryTimeBucketTelemetryAsync({
      deviceId: targetDeviceId,
      metric: metric as string,
      bucket: (bucket as any) || '5m',
      startTime: startTime as string,
      endTime: endTime as string,
      allowedDeviceIds: !isAdmin ? userDeviceIds : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'TimescaleDB zaman dilimi sorgusu başarısız oldu: ' + (err.message || '') });
  }
});

timescaleRouter.get('/continuous-aggregates', authenticateUser, (req, res) => {
  const stats = db.getTimescaleStats();
  res.json(stats.continuousAggregates);
});

timescaleRouter.get('/export', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const { deviceId, metric, bucket = '5m', format = 'json', mode = 'bucket', startTime, endTime, limit = '5000' } = req.query;

  const isAdmin = user.role === 'admin';
  const userDevices = db.getDevices(user.id, user.id);
  const userDeviceIds = userDevices.map((d) => d.id);

  const targetDeviceId = deviceId as string | undefined;

  if (!isAdmin) {
    if (targetDeviceId && targetDeviceId !== 'all') {
      if (!userDeviceIds.includes(targetDeviceId)) {
        return res.status(403).json({ error: 'Bu cihaza ve verilerine erişim yetkiniz bulunmamaktadır.' });
      }
    } else if (userDeviceIds.length === 0) {
      if (format === 'csv') {
        const bom = '\uFEFF';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="telemetry_export_${Date.now()}.csv"`);
        return res.send(bom + 'Timestamp,Device ID,Metric,Value,Unit,Status\n');
      }
      return res.json({
        exportedAt: new Date().toISOString(),
        recordCount: 0,
        mode,
        data: [],
      });
    }
  }

  try {
    const bom = '\uFEFF';

    if (mode === 'raw') {
      const rawData = await db.getTelemetryAsync(
        targetDeviceId && targetDeviceId !== 'all' ? targetDeviceId : undefined,
        metric && metric !== 'all' ? (metric as string) : undefined,
        Math.min(Number(limit) || 5000, 20000),
        !isAdmin ? user.id : undefined,
        !isAdmin ? user.id : undefined
      );

      const filteredRawData = !isAdmin
        ? rawData.filter((d: any) => userDeviceIds.includes(d.deviceId))
        : rawData;

      if (format === 'csv') {
        const csvHeader = 'Timestamp,Device ID,Device Name,Metric,Value,Unit,Status\n';
        const csvRows = filteredRawData
          .map((d: any) =>
            `"${d.timestamp}","${d.deviceId}","${d.deviceName || ''}","${d.metric}",${d.value},"${d.unit || ''}","${d.status || 'normal'}"`
          )
          .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="telemetry_raw_export_${Date.now()}.csv"`);
        return res.send(bom + csvHeader + csvRows);
      }

      return res.json({
        exportedAt: new Date().toISOString(),
        recordCount: filteredRawData.length,
        mode: 'raw',
        data: filteredRawData,
      });
    }

    const data = await db.queryTimeBucketTelemetryAsync({
      deviceId: targetDeviceId,
      metric: metric as string,
      bucket: (bucket as any) || '5m',
      startTime: startTime as string,
      endTime: endTime as string,
      allowedDeviceIds: !isAdmin ? userDeviceIds : undefined,
    });

    if (format === 'csv') {
      const csvHeader = 'Timestamp,Device ID,Metric,Average,Minimum,Maximum,Sample Count\n';
      const csvRows = data.map((d) => `"${d.timeBucket}","${d.deviceId}","${d.metric}",${d.avgValue},${d.minValue},${d.maxValue},${d.readingCount}`).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="timescaledb_export_${Date.now()}.csv"`);
      return res.send(bom + csvHeader + csvRows);
    }

    res.json({
      exportedAt: new Date().toISOString(),
      recordCount: data.length,
      bucket,
      mode: 'bucket',
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Veri dışa aktarılamadı: ' + (err.message || '') });
  }
});

/**
 * Generic System Settings API
 * GET /api/system/settings - Retrieve all persistent system settings
 * GET /api/system/settings/:key - Retrieve single system setting
 * POST /api/system/settings/:key - Set system setting with Last-Write-Wins (LWW) resolution
 */
systemRouter.get(['/system/settings', '/settings'], authenticateUser, (req, res) => {
  const settings = { ...db.getAllSystemSettings() };
  delete settings.service_config; // Ensure sensitive server configuration is not leaked
  delete settings.codex_monitor_config; // Codex permissions are exposed only through the admin-only endpoint.
  res.json({
    success: true,
    settings,
  });
});

systemRouter.get(['/system/settings/:key', '/settings/:key'], authenticateUser, (req, res) => {
  const { key } = req.params;
  if (['service_config', 'codex_monitor_config'].includes(key) && (req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Bu ayara erişim yetkiniz bulunmamaktadır.' });
  }
  const value = db.getSystemSetting(key);
  if (value === null || value === undefined) {
    return res.status(404).json({ error: `Ayar '${key}' bulunamadı.` });
  }
  res.json({
    success: true,
    key,
    value,
  });
});

systemRouter.post(['/system/settings/:key', '/settings/:key'], authenticateUser, requireAdmin, async (req, res) => {
  const { key } = req.params;
  if (key === 'codex_monitor_config') {
    return res.status(400).json({ error: 'Codex ayarları için /api/system/codex/config uç noktasını kullanın.' });
  }
  const { value, updatedAt } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: 'value parametresi zorunludur.' });
  }

  const effectiveTime = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();
  const saved = await db.saveSystemSetting(key, value, effectiveTime);

  if (!saved) {
    return res.status(409).json({
      success: false,
      message: 'Bu ayar daha yeni bir zaman damgasıyla güncellenmiş durumda (LWW koruması).',
      currentValue: db.getSystemSetting(key),
    });
  }

  res.json({
    success: true,
    key,
    value,
    updatedAt: effectiveTime,
    message: `'${key}' sistem ayarı başarıyla kaydedildi.`,
  });
});

// Simulator Router
const simulatorRouter = Router();

// Primary Simulation Ingestion API (POST /api/simulator/v1/telemetry and POST /api/simulator/telemetry)
simulatorRouter.post('/v1/telemetry', (req, res) => simulationTelemetryController.ingest(req, res));
simulatorRouter.post('/telemetry', (req, res) => simulationTelemetryController.ingest(req, res));
simulatorRouter.post('/v1/telemetry/legacy', (req, res) => simulationTelemetryController.ingestLegacy(req, res));

// Manual Test Telemetry Injection (Authenticated Admin Session ONLY - NO device API key required)
const handleSimulatorInject = async (req: any, res: any) => {
  const { deviceId, metric, value, unit, readings } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId parametresi zorunludur.' });
  }

  const dev = db.getDevices().find((d) => d.id === deviceId || d.apiKey === deviceId);
  if (!dev) {
    return res.status(404).json({ error: 'Belirtilen cihaz bulunamadı.' });
  }

  // 1. KURAL / GÜVENLİK KORUMASI: Manuel test verisi yalnızca SANAL cihazlara gönderilebilir!
  if (!dev.isSimulated) {
    return res.status(403).json({
      error: 'physical_device_not_allowed_in_simulator',
      message: 'Manuel test verisi yalnızca sanal cihazlara gönderilebilir. Fiziksel saha donanımlarına sahte test verisi enjekte edilemez.',
    });
  }

  const metricsToProcess: { metric: string; value: number; unit?: string }[] = [];
  if (Array.isArray(readings) && readings.length > 0) {
    for (const r of readings) {
      if (r.metric && r.value !== undefined && !isNaN(Number(r.value))) {
        metricsToProcess.push({
          metric: String(r.metric),
          value: Number(r.value),
          unit: r.unit || '',
        });
      }
    }
  } else if (metric && value !== undefined && !isNaN(Number(value))) {
    metricsToProcess.push({
      metric: String(metric),
      value: Number(value),
      unit: unit || (metric === 'temperature' ? '°C' : metric === 'humidity' ? '%' : 'birim'),
    });
  }

  if (metricsToProcess.length === 0) {
    return res.status(400).json({ error: 'Geçerli bir metrik adı ve sayısal değer belirtilmedi.' });
  }

  const generatedReadings = [];
  for (const m of metricsToProcess) {
    const rawPayload = `[SIM_INJECT] Device: ${dev.name} | ${m.metric}:${m.value} ${m.unit || ''}`;
    const reading = await db.addTelemetryReading({
      deviceId: dev.id,
      deviceName: dev.name,
      metric: m.metric,
      value: m.value,
      unit: m.unit || '',
      status: 'normal',
      rawPayload,
      source: 'manual_test',
      environment: 'sandbox',
      simulationRunId: `manual_${Date.now().toString(36)}`,
    });
    generatedReadings.push(reading);

    if (!dev.metrics) dev.metrics = {};
    dev.metrics[m.metric] = m.value;
    dev.metrics[m.metric.toLowerCase()] = m.value;
  }

  db.updateDevice(dev.id, {
    metrics: dev.metrics,
    lastSeen: new Date().toISOString(),
    status: 'online',
  });

  // Broadcast strictly to simulation channel
  if (generatedReadings.length === 1) {
    broadcast('telemetry:simulation:new', generatedReadings[0]);
  } else if (generatedReadings.length > 1) {
    broadcast('telemetry:simulation:batch', generatedReadings);
  }

  res.status(201).json({
    success: true,
    message: 'Test telemetrisi sanal cihaza ve simülasyon motoruna başarıyla enjekte edildi.',
    deviceId: dev.id,
    deviceName: dev.name,
    injectedCount: generatedReadings.length,
    readings: generatedReadings,
  });
};

simulatorRouter.post('/v1/inject', authenticateUser, requireAdmin, handleSimulatorInject);
simulatorRouter.post('/inject', authenticateUser, requireAdmin, handleSimulatorInject);

simulatorRouter.get('/status', (req, res) => {
  res.json({
    simulatorActive,
    simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
    telemetryIngestedCount,
    activeConnectionsCount: getWebSocketClientsCount(),
  });
});

simulatorRouter.post('/toggle', authenticateUser, requireAdmin, async (req, res) => {
  setSimulatorActive(!simulatorActive);
  const now = new Date().toISOString();
  const simConfig = {
    active: simulatorActive,
    simulatorActive,
    intervalMs: simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
    updatedAt: now,
  };
  await db.saveSystemSetting('simulator_config', simConfig, now);
  broadcast('simulator:updated', simConfig);
  res.json({
    simulatorActive,
    message: `Cihaz verisi simülatörü ${simulatorActive ? 'AÇILDI' : 'KAPATILDI'}.`,
  });
});

simulatorRouter.post('/config', authenticateUser, requireAdmin, async (req, res) => {
  setSimulatorConfig(req.body);
  const now = new Date().toISOString();
  const simConfig = {
    active: simulatorActive,
    simulatorActive,
    intervalMs: simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
    updatedAt: now,
  };
  await db.saveSystemSetting('simulator_config', simConfig, now);
  broadcast('simulator:updated', simConfig);
  res.json({
    success: true,
    simulatorActive,
    simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
    message: 'Simülatör ayarları güncellendi.',
  });
});

simulatorRouter.post('/batch', authenticateUser, requireAdmin, async (req, res) => {
  const { count = 10, deviceId, metric, value, unit } = req.body;
  const numCount = Math.min(200, Math.max(1, Number(count)));
  
  // Yalnızca sanal cihazlara simülasyon batch verisi üretilir
  const simulatedDevices = db.getDevices().filter(
    (d) => d.isSimulated === true && d.dataFlowActive !== false && d.status !== 'maintenance'
  );

  if (deviceId) {
    const targetDev = db.getDevices().find((d) => d.id === deviceId || d.apiKey === deviceId);
    if (!targetDev) {
      return res.status(404).json({ error: 'Belirtilen cihaz bulunamadı.' });
    }
    if (!targetDev.isSimulated) {
      return res.status(403).json({
        error: 'physical_device_not_allowed_in_simulator',
        message: 'Toplu simülasyon testi yalnızca sanal cihazlara gönderilebilir.',
      });
    }
  }

  if (!simulatedDevices.length) {
    return res.status(400).json({ error: 'Sistemde aktif sanal test cihazı bulunamadı. Lütfen önce bir sanal cihaz oluşturun.' });
  }

  const generatedReadings = [];
  for (let i = 0; i < numCount; i++) {
    const dev = deviceId
      ? simulatedDevices.find((d) => d.id === deviceId) || simulatedDevices[0]
      : simulatedDevices[Math.floor(Math.random() * simulatedDevices.length)];
    const m = metric || (dev.type === 'sensor' ? 'temperature' : dev.type === 'server' ? 'cpu' : 'power');
    const u = unit || (m === 'temperature' ? '°C' : m === 'power' ? 'kW' : '%');
    const val = value !== undefined ? Number(value) : Number((20 + Math.random() * 60).toFixed(1));

    const rawPayload = `BATCH_GEN, ${dev.apiKey}, ${dev.name}, ${m}:${val}`;
    const reading = await db.addTelemetryReading({
      deviceId: dev.id,
      deviceName: dev.name,
      metric: m,
      value: val,
      unit: u,
      status: 'normal',
      rawPayload,
      source: 'simulator',
      environment: 'sandbox',
    });
    generatedReadings.push(reading);
  }

  if (generatedReadings.length > 0) {
    broadcast('telemetry:simulation:batch', generatedReadings);
  }

  res.json({
    success: true,
    generatedCount: generatedReadings.length,
    readings: generatedReadings,
    message: `${generatedReadings.length} adet sanal telemetri paketi başarıyla üretildi ve yayınlandı.`,
  });
});

export {
  systemRouter,
  adminRouter,
  databaseRouter,
  timescaleRouter,
  simulatorRouter,
};
