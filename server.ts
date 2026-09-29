import 'express-async-errors';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';

// Services & Database
import { systemLogger } from './src/server/services/systemLogger.service.js';
import { initWebSocketServer } from './src/server/services/websocket.js';
import { initSimulator } from './src/server/services/simulator.js';
import { startOtaWorker } from './src/server/services/otaWorker.js';
import { startNoDataWorker } from './src/server/services/noDataWorker.js';
import { startCommandExpiryWorker } from './src/server/services/command.service.js';
import { getVaultStatus } from './src/server/utils/crypto.js';


// Route Handlers
import { authRouter, profileRouter } from './src/server/routes/auth.js';
import { adminTenantsRouter } from './src/server/routes/admin/tenants.js';
import { devicesRouter, deviceCommandsRouter } from './src/server/routes/devices.js';
import { commandsRouter } from './src/server/routes/commands.js';
import { networkRouter } from './src/server/routes/network.js';
import { telemetryRouter } from './src/server/routes/telemetry.js';
import {
  alarmsRouter,
  rulesRouter,
  notificationsRouter,
  notificationQueueRouter,
  dispatchLogsRouter,
  notificationServicesRouter,
  auditLogsRouter,
  dashboardRouter,
} from './src/server/routes/alarms.js';
import { automationsRouter } from './src/server/routes/automations.js';
import {
  systemRouter,
  adminRouter,
  databaseRouter,
  timescaleRouter,
  simulatorRouter,
} from './src/server/routes/system.js';
import { firmwareRouter } from './src/server/routes/firmware.js';
import { otaRouter } from './src/server/routes/ota.js';
import { compilerRouter } from './src/server/routes/compiler.js';
import { systemLogsRouter } from './src/server/routes/systemLogs.js';
import { setupRouter } from './src/server/routes/setup.js';
import { sshTunnelRouter } from './src/server/routes/sshTunnel.js';
import { serverStatusRouter } from './src/server/routes/serverStatus.js';
import { secretsRouter } from './src/server/routes/secrets.js';

// Global Process Crash Shields
let isShuttingDown = false;
function gracefulCrashExit(errType: string, err: any) {
  if (isShuttingDown) return;
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_CRASH_EXIT !== 'true') {
    isShuttingDown = true;
    console.error(`[CRITICAL PROCESS CRASH] ${errType} encountered in production. Initiating graceful shutdown...`);
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
}

process.on('uncaughtException', (err: any) => {
  const errMsg = err?.message || String(err);
  const isTransientDbOrSocketError =
    errMsg.includes('Connection terminated unexpectedly') ||
    errMsg.includes('ECONNREFUSED') ||
    errMsg.includes('ECONNRESET') ||
    errMsg.includes('ETIMEDOUT') ||
    errMsg.includes('socket hang up') ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ECONNRESET' ||
    err?.code === '57P01' ||
    err?.code === '08006' ||
    err?.code === '08001';

  if (isTransientDbOrSocketError) {
    console.warn('[Process Shield] Anlık veritabanı/ağ soketi kesintisi yakalandı (Node ayakta tutuluyor):', errMsg);
    try {
      systemLogger.warn('database', `Veritabanı soket kesintisi yakalandı (${errMsg}). Otomatik yeniden bağlanma devrede.`);
    } catch {}
    return;
  }

  console.error('[CRITICAL][uncaughtException]:', errMsg, err?.stack || '');
  try {
    systemLogger.critical('server', `Yakalanmamış Sistem Hatası (uncaughtException): ${errMsg}`, {
      stack: err?.stack,
      name: err?.name,
      code: err?.code,
    });
  } catch {}

  gracefulCrashExit('uncaughtException', err);
});

process.on('unhandledRejection', (reason: any) => {
  const reasonMsg = reason?.message || String(reason);
  console.error('[CRITICAL][unhandledRejection]:', reasonMsg, reason?.stack || '');
  try {
    systemLogger.error('server', `Yakalanmamış Promise Reddi (unhandledRejection): ${reasonMsg}`, {
      stack: reason?.stack,
      name: reason?.name,
    });
  } catch {}
  if (process.env.STRICT_UNHANDLED_REJECTION === 'true') {
    gracefulCrashExit('unhandledRejection', reason);
  }
});

const app = express();
// Configure Trust Proxy: Trust loopback/reverse proxy by default or TRUST_PROXY env setting
const trustProxyConfig = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', trustProxyConfig === 'true' ? true : trustProxyConfig === 'false' ? false : trustProxyConfig);
const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || '3000', 10);
const server = http.createServer(app);

// Global Middleware & Body Parsers
app.use(cookieParser());

// Early request body size guard for public endpoints to prevent memory parsing DoS
app.use('/api/system-logs/client-error', (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 8192) {
    return res.status(413).json({ error: 'Payload Too Large: İstemci hata bildirim boyutu 8KB sınırını aşıyor.' });
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/x-www-form-urlencoded', 'application/octet-stream'], limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

import { isOriginAllowed } from './src/server/utils/corsOrigins.js';

// CORS & Preflight Handling (Explicit Secure Allowlist)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin) {
    // Only allow credentials and reflect origin if it matches our explicit allowlist
    const isAllowed = isOriginAllowed(origin);
    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      // Do not allow credentials for unknown origins. Explicitly deny CORS access.
      res.header('Access-Control-Allow-Origin', 'null');
    }
  } else {
    // Non-browser clients (IoT devices, curl) don't send Origin.
    // Allow public API access but do not enable credentials (cookies) in this context.
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token, x-api-key, x-token, x-device-id, x-device-ip, x-mac-address, x-setup-token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).send('OK');
  }
  next();
});

// Global Health Check Endpoints (/health/live, /health/ready, /health)
app.use(systemRouter);

// PostgreSQL Availability Guard
// Critical Requirement: PostgreSQL/TimescaleDB is the single source of truth.
// If PostgreSQL is not connected or in READY state, block non-setup API calls with 503.
import { db } from './src/server/db.js';
import { DatabaseState } from './src/types.js';
import { isRealAdminUser } from './src/server/database/postgres.js';
import { setupService } from './src/server/services/setup.service.js';

app.use('/api', (req, res, next) => {
  // Allow OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Allowed endpoints even when DB is not ready or during configuration
  if (
    req.path.startsWith('/setup') ||
    req.path.startsWith('/auth/setup-status') ||
    req.path.startsWith('/auth/complete-setup') ||
    req.path.startsWith('/auth/verify-setup-token') ||
    req.path.startsWith('/system/ssh-tunnel') ||
    req.path.startsWith('/ssh-tunnel') ||
    req.path === '/system/status' ||
    req.path.startsWith('/server') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/database') ||
    req.path.startsWith('/system-logs')
  ) {
    return next();
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const dbState = db.getDatabaseState();
  const isPgReady = Boolean(db.postgresRepo?.isReady());
  const isStrictMaintenance = process.env.STRICT_MAINTENANCE_LOCK === 'true';

  // Strict Fail-Closed Enforcement in Production:
  // In production (or when strict maintenance lock is active), the system strictly requires PostgreSQL to be READY.
  // In development mode, if PostgreSQL is ready it is authoritative; otherwise local engine facilitates dev preview.
  const isSystemReady = (isProduction || isStrictMaintenance)
    ? (isPgReady && dbState === DatabaseState.READY)
    : true;

  if (!isSystemReady) {
    const isMaintenance = dbState === DatabaseState.MAINTENANCE || dbState === DatabaseState.DB_UNAVAILABLE;
    return res.status(503).json({
      success: false,
      code: isMaintenance ? 'DB_MAINTENANCE' : 'DB_UNAVAILABLE',
      state: dbState,
      error: isMaintenance
        ? 'NexusNode IoT PostgreSQL veritabanı bağlantısı kurulamadı veya sistem bakım modunda.'
        : 'NexusNode IoT PostgreSQL veritabanı bağlantısı henüz hazır değil veya kurulum tamamlanmadı.',
      message: 'PostgreSQL veritabanı hazır olmadığı için bu işlem gerçekleştirilemiyor. Lütfen veritabanı bağlantınızı kontrol edin veya kurulum sihirbazını tamamlayın.',
    });
  }
  next();
});

// Mount Modular API Routes
app.use('/api/setup/ssh-tunnel', sshTunnelRouter);
app.use('/api/system/ssh-tunnel', sshTunnelRouter);
app.use('/api/setup', setupRouter);
app.use('/api', systemRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
  app.use('/api/admin/tenants', adminTenantsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/network', networkRouter);
app.use('/api', commandsRouter);
app.use('/api/v1', commandsRouter);
app.use('/api/v1', deviceCommandsRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/v1/telemetry', telemetryRouter);
app.use('/api/alarms', alarmsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/notification-queue', notificationQueueRouter);
app.use('/api/dispatch-logs', dispatchLogsRouter);
app.use('/api/notification-services', notificationServicesRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/database', databaseRouter);
app.use('/api/timescale', timescaleRouter);
app.use('/api/simulator', simulatorRouter);
app.use('/api/firmwares', firmwareRouter);
app.use('/api/ota', otaRouter);
app.use('/api/compiler', compilerRouter);
app.use('/api/system-logs', systemLogsRouter);
app.use('/api/system/logs', systemLogsRouter);
app.use('/api/server', serverStatusRouter);
app.use('/api/server-status', serverStatusRouter);
app.use('/api/system/secrets', secretsRouter);

// Diagnostic HTTP status observer for 5xx responses across the system
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500 && !req.path.startsWith('/api/system-logs')) {
      const duration = Date.now() - start;
      systemLogger.error(
        'server',
        `[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${duration}ms)`,
        {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          durationMs: duration,
        },
        'http_response_watcher'
      );
    }
  });
  next();
});

// API 404 Handler: Ensure non-existent /api routes return JSON error, not SPA index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API uç noktası bulunamadı (404): ${req.method} ${req.originalUrl}`,
  });
});

// API Global Error Handler: Ensure API crashes return JSON and are securely recorded in system error log
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errMsg = err?.message || String(err);
  const isDbErr = errMsg.includes('PostgreSQL') || errMsg.includes('veritabanı') || errMsg.includes('ECONNREFUSED');
  const statusCode = err.status || err.statusCode || (isDbErr ? 503 : 500);

  // Automatically record runtime API error in systemLogger
  try {
    systemLogger.error(
      'api',
      `[API Çalışma Hatası ${statusCode}] ${req.method} ${req.originalUrl}: ${errMsg}`,
      {
        error: errMsg,
        stack: err?.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        statusCode,
      },
      'express_global_error_handler'
    );
  } catch (loggerErr) {
    console.error('[SystemLogger Recording Failure]:', loggerErr);
  }

  if (req.path.startsWith('/api/')) {
    console.error('[API Error]:', err);
    const isProd = process.env.NODE_ENV === 'production';
    const errorResponse: Record<string, any> = {
      success: false,
      error: isDbErr ? 'Veritabanı Hizmet Dışı' : 'Sunucu hatası',
    };
    if (!isProd) {
      errorResponse.details = errMsg;
    }
    res.status(statusCode).json(errorResponse);
  } else {
    next(err);
  }
});

// Initialize WebSocket, OTA Worker & Background Simulation Engines when Database is READY (PostgreSQL in Production, or Local WAL in Dev)
let backgroundWorkersStarted = false;
export function startBackgroundWorkers() {
  if (backgroundWorkersStarted) return;
  const isProduction = process.env.NODE_ENV === 'production';
  const isPgReady = Boolean(db.postgresRepo?.isReady());
  const isReady = isProduction ? (isPgReady && db.getDatabaseState() === DatabaseState.READY) : (db.getDatabaseState() === DatabaseState.READY);

  if (!isReady) {
    console.log('[Workers] Veritabanı hazır (READY) olmadığı için arka plan servisleri bekletiliyor.');
    return;
  }
  backgroundWorkersStarted = true;
  console.log('[Workers] Veritabanı READY durumunda. Arka plan servisleri başlatılıyor (Simulator, OTA, NoData, CommandExpiry)...');
  initSimulator();
  startOtaWorker();
  startNoDataWorker();
  startCommandExpiryWorker();
}

// Start the authenticated WebSocket upgrade/security layer with the HTTP server.
// Database-dependent workers remain gated by READY, but /ws must always reject
// unauthenticated or untrusted-origin upgrades instead of falling through to SPA HTTP 200.
initWebSocketServer(server);

// Automatically start background workers whenever the DB state transitions to READY
db.onStateChange((newState) => {
  if (newState === DatabaseState.READY) {
    startBackgroundWorkers();
  }
});

// If already ready, start background workers immediately
if (db.getDatabaseState() === DatabaseState.READY) {
  startBackgroundWorkers();
}


// Serve Vite in dev mode or static bundled files in production
async function setupViteOrStatic() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  if (isProd) {
    const vaultStatus = getVaultStatus();
    if (!vaultStatus.configured) {
      console.error(`====================================================`);
      console.error(`[FATAL SECURITY ERROR] Secret Vault Şifreleme Anahtarı Eksik!`);
      console.error(`Üretim (Production) modunda ENCRYPTION_KEY ortam değişkeni veya`);
      console.error(`/run/secrets/encryption_key Docker secret dosyası tanımlanmalıdır.`);
      console.error(`Şifreli veriler ile anahtarın aynı veri hacmi (volume) içinde bulunması engellenmiştir.`);
      console.error(`====================================================`);
      systemLogger.critical('security', 'Üretim ortamında Secret Vault anahtarı (ENCRYPTION_KEY / Docker secret) eksik olduğu için sunucu başlatılamadı.');
      if (process.env.DISABLE_VAULT_EXIT !== 'true') {
        process.exit(1);
      }
    } else {
      console.log(`[Security] Secret Vault AES-256-GCM aktif (Kaynak: ${vaultStatus.source}).`);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${PORT} kullanımda (EADDRINUSE). Yeniden başlatma bekleniyor...`);
      process.exit(1);
    } else {
      console.error('[Server] HTTP sunucu hatası:', err);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` IoT Telemetri & Alarm Sunucusu Port ${PORT} Üzerinde Aktif!`);
    console.log(` WebSocket & REST API: http://0.0.0.0:${PORT}`);
    console.log(` Modüler Mimari (Routes / Services / DB) Başlatıldı.`);
    console.log(`====================================================`);
  });

  // Background non-blocking database initialization
  (async () => {
    console.log("[Startup] Veritabanı bağlantısı arka planda doğrulanıyor...");
    try {
      const startupTimeout = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) ? 200 : 15000;
      await db.waitForInitialization(startupTimeout);
      if (db.postgresRepo?.isReady() && db.getDatabaseState() === DatabaseState.READY) {
        console.log("[Startup] PostgreSQL hazır ve şema doğrulandı. API ve arka plan servisleri aktif.");
        startBackgroundWorkers();
      } else {
        console.warn(`[Startup] PostgreSQL henüz hazır değil (Durum: ${db.getDatabaseState()}). Kurulum modu aktif.`);
      }
    } catch (err: any) {
      console.warn("[Startup] Veritabanı başlatma uyarısı:", err?.message || err);
    }
  })();
}

setupViteOrStatic();

// Graceful Shutdown Handler
const gracefulShutdown = (signal: string) => {
  console.log(`\n[${signal}] Kapatma sinyali alındı. Sunucu güvenli şekilde durduruluyor...`);
  
  // Close the HTTP server so it stops accepting new connections
  server.close(() => {
    console.log('HTTP sunucusu kapatıldı.');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('Kapatma işlemi zaman aşımına uğradı, süreç zorla sonlandırılıyor.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
