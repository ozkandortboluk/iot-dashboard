import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

// Services & Database
import { initWebSocketServer } from './src/server/services/websocket.js';
import { initSimulator } from './src/server/services/simulator.js';
import { startOtaWorker } from './src/server/services/otaWorker.js';
import { startNoDataWorker } from './src/server/services/noDataWorker.js';
import { startCommandExpiryWorker } from './src/server/services/command.service.js';


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

const app = express();
app.set('trust proxy', true);
const PORT = 3000;
const server = http.createServer(app);

// Global Middleware & Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/x-www-form-urlencoded', 'application/octet-stream'], limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// CORS & Preflight Handling
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token, x-api-key, x-token, x-device-id, x-device-ip, x-mac-address');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).send('OK');
  }
  next();
});

// Global Health Check Endpoints (/health/live, /health/ready, /health)
app.use(systemRouter);

// Mount Modular API Routes
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

// API 404 Handler: Ensure non-existent /api routes return JSON error, not SPA index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API uç noktası bulunamadı (404): ${req.method} ${req.originalUrl}`,
  });
});

// Initialize WebSocket, OTA Worker & Background Simulation Engines
initWebSocketServer(server);
initSimulator();
startOtaWorker();
startNoDataWorker();
startCommandExpiryWorker();


// Serve Vite in dev mode or static bundled files in production
async function setupViteOrStatic() {
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` IoT Telemetri & Alarm Sunucusu Port ${PORT} Üzerinde Aktif!`);
    console.log(` WebSocket & REST API: http://0.0.0.0:${PORT}`);
    console.log(` Modüler Mimari (Routes / Services / DB) Başlatıldı.`);
    console.log(`====================================================`);
  });
}

setupViteOrStatic();
