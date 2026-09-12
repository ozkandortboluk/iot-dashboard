import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db.js';
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

const startTime = Date.now();

// System Router
const systemRouter = Router();

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
  const isPostgresReady = !!db.postgresRepo?.isReady();
  const retryStats = typeof db.getRetryQueueStats === 'function' ? db.getRetryQueueStats() : undefined;
  const poolStats = db.postgresRepo?.getPoolStats() || undefined;

  if (isPostgresReady) {
    return res.status(200).json({
      status: 'ready',
      ready: true,
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
    database: {
      status: 'disconnected',
      engine: 'PostgreSQL / TimescaleDB',
      ready: false,
      pool: poolStats,
      error: 'PostgreSQL / TimescaleDB ana veri tabanına henüz ulaşılamıyor veya bağlantı hazır değil.',
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
  const isPostgresReady = !!db.postgresRepo?.isReady();
  const retryStats = typeof db.getRetryQueueStats === 'function' ? db.getRetryQueueStats() : undefined;
  const poolStats = db.postgresRepo?.getPoolStats() || undefined;

  const statusCode = isPostgresReady ? 200 : 503;
  return res.status(statusCode).json({
    status: isPostgresReady ? 'healthy' : 'degraded',
    live: true,
    ready: isPostgresReady,
    database: {
      status: isPostgresReady ? 'connected' : 'disconnected',
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
  res.json({
    activeConnections: getWebSocketClientsCount(),
    requestsPerSec: Number((Math.random() * 12 + 4).toFixed(1)),
    telemetryIngestedTotal: telemetryIngestedCount,
    dbType: 'SQLite (Development/Local)',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    simulatorActive,
  });
});

systemRouter.get('/system/postgres-schema', authenticateUser, requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="iot_timescaledb_schema.sql"');
  res.send(db.getPostgresSchemaSQL());
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

// Admin Stats & Quotas
const adminRouter = Router();

adminRouter.get('/database-stats', authenticateUser, requireAdmin, async (req, res) => {
  res.json(await db.getDatabaseStats());
});

adminRouter.post('/test-firestore-quota', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.testAndResetFirestoreQuota();
  res.json(result);
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

databaseRouter.post('/backup', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.createBackup();
  if (result.success) {
    res.json({ message: 'Veritabanı yedeği başarıyla oluşturuldu.', result });
  } else {
    res.status(500).json({ error: 'Yedekleme oluşturulamadı.' });
  }
});

databaseRouter.get('/backups', authenticateUser, requireAdmin, (req, res) => {
  res.json({ backups: db.listBackups() });
});

databaseRouter.post('/restore', authenticateUser, requireAdmin, (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Yedek dosya adı belirtilmedi.' });
  }
  const ok = db.restoreBackup(filename);
  if (ok) {
    res.json({ message: 'Veritabanı yedeği başarıyla geri yüklendi.' });
  } else {
    res.status(400).json({ error: 'Yedek geri yüklenemedi veya dosya bulunamadı.' });
  }
});

databaseRouter.get('/config', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getPostgresConfig());
});

databaseRouter.post('/config', authenticateUser, requireAdmin, (req, res) => {
  const { engine, postgresUrl } = req.body;
  if (!engine || !['postgres', 'timescaledb', 'local'].includes(engine)) {
    return res.status(400).json({ error: 'Geçersiz veritabanı motoru seçimi.' });
  }
  db.setActiveEngine(engine, postgresUrl);
  res.json({
    success: true,
    message: `Aktif veritabanı motoru "${engine}" olarak güncellendi.`,
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
  const { category, days } = req.body;
  if (!category) return res.status(400).json({ error: 'Kategori belirtilmedi.' });
  const result = await db.executeCategoryCleanup(category, days ? Number(days) : undefined);
  res.json(result);
});

// TimescaleDB Router
const timescaleRouter = Router();

timescaleRouter.get('/stats', authenticateUser, (req, res) => {
  res.json(db.getTimescaleStats());
});

timescaleRouter.post('/compress-now', authenticateUser, requireAdmin, async (req, res) => {
  const result = await db.compressTimescaleChunksNow();
  res.json(result);
});

timescaleRouter.post('/policies', authenticateUser, requireAdmin, (req, res) => {
  const result = db.updateTimescalePolicies(req.body);
  res.json(result);
});

timescaleRouter.get('/time-bucket', authenticateUser, async (req, res) => {
  const { deviceId, metric, bucket = '5m', startTime, endTime } = req.query;
  try {
    const result = await db.queryTimeBucketTelemetryAsync({
      deviceId: deviceId as string,
      metric: metric as string,
      bucket: (bucket as any) || '5m',
      startTime: startTime as string,
      endTime: endTime as string,
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
  const { deviceId, metric, bucket = '5m', format = 'json', startTime, endTime } = req.query;
  try {
    const data = await db.queryTimeBucketTelemetryAsync({
      deviceId: deviceId as string,
      metric: metric as string,
      bucket: (bucket as any) || '5m',
      startTime: startTime as string,
      endTime: endTime as string,
    });

    if (format === 'csv') {
      const csvHeader = 'Timestamp,Device ID,Metric,Average,Minimum,Maximum,Sample Count\n';
      const csvRows = data.map((d) => `"${d.timeBucket}","${d.deviceId}","${d.metric}",${d.avgValue},${d.minValue},${d.maxValue},${d.readingCount}`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="timescaledb_export_${Date.now()}.csv"`);
      return res.send(csvHeader + csvRows);
    }

    res.json({
      exportedAt: new Date().toISOString(),
      recordCount: data.length,
      bucket,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Veri dışa aktarılamadı: ' + (err.message || '') });
  }
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

simulatorRouter.post('/toggle', authenticateUser, requireAdmin, (req, res) => {
  setSimulatorActive(!simulatorActive);
  broadcast('simulator:updated', {
    simulatorActive,
    simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
  });
  res.json({
    simulatorActive,
    message: `Cihaz verisi simülatörü ${simulatorActive ? 'AÇILDI' : 'KAPATILDI'}.`,
  });
});

simulatorRouter.post('/config', authenticateUser, requireAdmin, (req, res) => {
  setSimulatorConfig(req.body);
  broadcast('simulator:updated', {
    simulatorActive,
    simulatorIntervalMs,
    anomalyProbability,
    activeScenario,
  });
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
