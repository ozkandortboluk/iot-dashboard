import 'express-async-errors';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';

// Services & Database
import { systemLogger } from './src/server/services/systemLogger.service.js';
import { systemSecretsService } from './src/server/services/systemSecrets.service.js';
import { initWebSocketServer } from './src/server/services/websocket.js';
import { initSimulator } from './src/server/services/simulator.js';
import { stopWebSocketServer } from './src/server/services/websocket.js';
import { setSimulatorActive } from './src/server/services/simulator.js';
import { startOtaWorker, stopOtaWorker } from './src/server/services/otaWorker.js';
import { startNoDataWorker, stopNoDataWorker } from './src/server/services/noDataWorker.js';
import { startCommandExpiryWorker, stopCommandExpiryWorker } from './src/server/services/command.service.js';
import { recycleSharedPgPool } from './src/server/database/connection.js';
import { getVaultStatus } from './src/server/utils/crypto.js';
import { validateProductionSecurityPolicy, ensureRuntimeSecuritySecrets } from './src/server/utils/startupSecurityPolicy.js';
import { isProductionVpsEnvironment } from './src/server/config/runtimeEnvironment.js';
import { resolveTrustProxy } from './src/server/config/trustProxyPolicy.js';
import { sshTunnelService } from './src/server/services/sshTunnel.service.js';

// Bootstrap runtime security secrets early in dev/test only
ensureRuntimeSecuritySecrets();


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

export async function performGracefulShutdown(reason: string, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Graceful Shutdown] ${reason} - Sunucu güvenli şekilde durduruluyor...`);

  // RUN-05: Absolute deadline for entire shutdown chain to prevent zombie hangs
  const forceExitDeadline = setTimeout(() => {
    console.warn(`[Graceful Shutdown] Kapanış zaman aşımına uğradı (4s deadline). Zorla çıkılıyor.`);
    process.exit(exitCode);
  }, 4000);
  forceExitDeadline.unref();

  // 1. Stop background workers, timers, and tunnels
  try { stopNoDataWorker(); } catch {}
  try { stopCommandExpiryWorker(); } catch {}
  try { stopOtaWorker(); } catch {}
  try { setSimulatorActive(false); } catch {}
  try { db.autoHealer?.stopWatchdog(); } catch {}
  try { await sshTunnelService.disconnectTunnel(); } catch {}

  // 2. Close WebSocket server & disconnect all client sockets
  try { stopWebSocketServer(); } catch {}

  // 3. Concurrently close HTTP listener and recycle PostgreSQL pool
  const serverClosePromise = new Promise((resolve) => {
    server.close(() => {
      console.log('[Graceful Shutdown] HTTP dinleyici kapatıldı.');
      resolve(true);
    });
  });

  const poolClosePromise = (async () => {
    try {
      await recycleSharedPgPool();
      console.log('[Graceful Shutdown] PostgreSQL bağlantı havuzu kapatıldı.');
    } catch {}
  })();

  await Promise.race([
    Promise.all([serverClosePromise, poolClosePromise]),
    new Promise((r) => setTimeout(r, 2000)),
  ]);

  clearTimeout(forceExitDeadline);
  console.log(`[Graceful Shutdown] Kapanış zinciri tamamlandı. Çıkış kodu: ${exitCode}`);
  process.exit(exitCode);
}

function gracefulCrashExit(errType: string, err: any) {
  performGracefulShutdown(`CRITICAL PROCESS CRASH (${errType})`, 1);
}

process.on('uncaughtException', (err: any) => {
  const errMsg = err?.message || String(err);
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

  gracefulCrashExit('unhandledRejection', reason);
});

const app = express();
// Configure Trust Proxy: Trust container reverse proxy (1 hop / loopback + private docker subnets)
const parsedTrustProxy = resolveTrustProxy(process.env.TRUST_PROXY, isProductionVpsEnvironment());
app.set('trust proxy', parsedTrustProxy);

// Fast 503 Service Unavailable rejection for new incoming requests when shutting down
app.use((_req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({
      success: false,
      error: 'Sunucu kapanıyor (503 Service Unavailable)',
      message: 'Sunucu durdurma sürecindedir, yeni istek kabul edilmiyor.',
    });
  }
  next();
});

// Security Headers Middleware (OLD-219: CSP, HSTS, X-Content-Type-Options, etc.)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const isVpsProd = isProductionVpsEnvironment();

  if (isVpsProd) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content-Security-Policy (Allow iframe embedding in AI Studio while securing standalone VPS production)
  const frameAncestors = isVpsProd
    ? "'self'"
    : "'self' https: https://*.google.com https://*.googleusercontent.com https://*.run.app http://localhost:* http://127.0.0.1:*";

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
    "style-src 'self' 'unsafe-inline' https:; " +
    "img-src 'self' data: blob: https:; " +
    "font-src 'self' data: https:; " +
    "connect-src 'self' ws: wss: http: https:; " +
    `frame-ancestors ${frameAncestors};`
  );
  next();
});

// Distributed Request & Error Tracing Middleware (OLD-171)
app.use((req, res, next) => {
  const incomingTrace = (req.headers['x-trace-id'] || req.headers['x-request-id']) as string;
  const traceId = incomingTrace && typeof incomingTrace === 'string' && incomingTrace.trim().length > 0
    ? incomingTrace.trim()
    : `trc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  (req as any).traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('X-Request-Id', traceId);
  next();
});

function resolveServerPort(): number {
  // 1. Check CLI args: --port <port> or -p <port> or --port=<port>
  const portArgIdx = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsed = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const portEqualArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (portEqualArg) {
    const parsed = parseInt(portEqualArg.split('=')[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Check explicit SERVER_PORT or DEFAULT_APP_PORT
  if (process.env.SERVER_PORT) {
    const parsed = parseInt(process.env.SERVER_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const parsed = parseInt(process.env.DEFAULT_APP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 3. In Cloud Run / Dev Sandbox, if PORT is 8080 (same as NGINX_PORT),
  // the applet must NOT listen on 8080 (which is Nginx); it must listen on port 3000!
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) {
      if (process.env.NGINX_PORT && String(parsed) === String(process.env.NGINX_PORT)) {
        return 3000;
      }
      if (parsed === 8080 && process.env.NODE_ENV !== 'production') {
        return 3000;
      }
      return parsed;
    }
  }

  return 3000;
}

const PORT = resolveServerPort();
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
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token, x-session-token, x-api-key, x-token, x-device-id, x-device-ip, x-mac-address, x-setup-token, x-client-platform, x-request-token');
  res.header('Access-Control-Expose-Headers', 'x-auth-token, x-session-token');
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
app.use('/api/database/timescale', timescaleRouter);
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

// Comprehensive HTTP Request Observer for System-Wide Audit & Performance Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Avoid circular logger loops, successful static asset noise, or excessive health probe noise unless error
    const isSystemLogPath = req.path.startsWith('/api/system-logs') || req.path.startsWith('/api/system/logs');
    const isHealthProbe = req.path === '/api/health/live' || req.path === '/api/health/ready' || req.path === '/health';
    const isStaticAsset =
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path === '/favicon.svg' ||
      req.path === '/favicon.ico' ||
      req.path === '/site.webmanifest' ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/public/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@') ||
      req.path.startsWith('/node_modules/') ||
      /\.(js|jsx|ts|tsx|css|scss|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map|json|html)$/i.test(req.path);

    if (isSystemLogPath) return;
    if (isStaticAsset && res.statusCode < 400) return;

    const duration = Date.now() - start;
    const clientIp = String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
    const traceId = (req as any).traceId;
    const userId = (req as any).user?.id || (req as any).userId;

    const logDetails = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      ip: clientIp,
      durationMs: duration,
      traceId,
      userId,
      userAgent: req.headers['user-agent'],
    };

    if (res.statusCode >= 500) {
      systemLogger.error(
        'http',
        `[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${duration}ms)`,
        logDetails,
        'express_http_observer'
      );
    } else if (res.statusCode >= 400) {
      systemLogger.warn(
        'http',
        `[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${duration}ms)`,
        logDetails,
        'express_http_observer'
      );
    } else {
      // 2xx and 3xx responses (Skip silent health probes unless slow > 500ms)
      if (!isHealthProbe || duration > 500) {
        systemLogger.info(
          'http',
          `[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${duration}ms)`,
          logDetails,
          'express_http_observer'
        );
      }
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
  const isProd = isProductionVpsEnvironment();

  if (isProd) {
    const vaultStatus = getVaultStatus();
    if (!vaultStatus.configured) {
      console.error(`====================================================`);
      console.error(`[FATAL SECURITY ERROR] Secret Vault Şifreleme Anahtarı Eksik veya Okunamıyor!`);
      if (vaultStatus.error) {
        console.error(`Erişim Hatası: ${vaultStatus.error}`);
        console.error(`Docker Secret dosya okuma izinlerini (mode 0640 / GID 1000) kontrol ediniz (Konteyner kullanıcısı: node, UID: 1000, GID: 1000).`);
      } else {
        console.error(`Üretim (Production) modunda /run/secrets/encryption_key Docker Secret dosyası tanımlanmalıdır.`);
      }
      console.error(`====================================================`);
      systemLogger.critical('security', `Üretim ortamında Secret Vault anahtarı (/run/secrets/encryption_key) ${vaultStatus.error ? 'okunamadığı (' + vaultStatus.error + ')' : 'eksik olduğu'} için sunucu fail-closed olarak durduruldu.`);
      process.exit(1);
    } else {
      console.log(`[Security] Secret Vault AES-256-GCM aktif (Kaynak: ${vaultStatus.source}).`);
    }

    // Preserve existing production keys: migrate from existing environment/files into Vault without regeneration
    try {
      const migrationResult = await systemSecretsService.migrateLegacySecrets();
      if (migrationResult.migratedCount > 0) {
        console.log(`[Security Migration] ${migrationResult.migratedCount} mevcut anahtar Vault kasasına taşındı ve korundu (${migrationResult.keys.join(', ')}).`);
      }
    } catch (err: any) {
      console.warn('[Startup] Legacy secrets migration warning:', err?.message || err);
    }

    const policyResult = validateProductionSecurityPolicy();
    if (!policyResult.valid) {
      console.error(`====================================================`);
      console.error(`[FATAL SECURITY POLICY ERROR] Startup Denied!`);
      policyResult.errors.forEach(e => console.error(e));
      console.error(`====================================================`);
      systemLogger.critical('security', `Üretim güvenlik politikası ihlali nedeniyle sunucu başlatılamadı: ${policyResult.errors.join('; ')}`);
      process.exit(1);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
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
  performGracefulShutdown(`Sinyal alındı (${signal})`, 0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
