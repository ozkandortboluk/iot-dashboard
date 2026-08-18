import fs from 'node:fs';
import path from 'node:path';
import type {
  TelemetryReading,
  ActiveAlarm,
  NotificationQueueItem,
  Device,
  ThresholdRule,
} from '../../types.js';

export interface MetricHistory {
  hourly: { time: string; value: number; count: number }[];
  daily: { time: string; value: number; count: number }[];
  monthly: { time: string; value: number; count: number }[];
}

export class TelemetryRepository {
  private retryQueue: TelemetryReading[] = [];
  private isFlushingRetryQueue = false;
  private retryWorkerTimer: NodeJS.Timeout | null = null;
  private queueFilePath = path.join(process.cwd(), 'data', 'telemetry-retry.ndjson');

  constructor(private db: any) {
    this.loadPersistentQueue();
    this.startRetryWorker();
  }

  // Load uncommitted retry items from durable NDJSON file on disk
  private loadPersistentQueue() {
    try {
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(this.queueFilePath)) {
        const content = fs.readFileSync(this.queueFilePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        let loaded = 0;
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as TelemetryReading;
            if (parsed && parsed.deviceId && parsed.metric) {
              this.retryQueue.push(parsed);
              loaded++;
            }
          } catch {
            // ignore malformed line
          }
        }
        if (loaded > 0) {
          console.log(`[Persistent Queue / WAL] Diskten ${loaded} adet bekleyen telemetri kaydı başarıyla yüklendi (${this.queueFilePath}).`);
        }
      }
    } catch (err: any) {
      console.warn(`[Persistent Queue Load Error]: ${err?.message || err}`);
    }
  }

  // Durable Disk-backed Enqueue (Write-Ahead Log style)
  private enqueueToRetryQueue(reading: TelemetryReading) {
    this.retryQueue.push(reading);
    try {
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.appendFileSync(this.queueFilePath, JSON.stringify(reading) + '\n', 'utf8');
    } catch (err: any) {
      console.warn(`[Persistent Queue Append Error]: ${err?.message || err}`);
    }
  }

  // Synchronize remaining queue items to disk atomically
  private saveDiskQueue() {
    try {
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (this.retryQueue.length === 0) {
        if (fs.existsSync(this.queueFilePath)) {
          fs.writeFileSync(this.queueFilePath, '', 'utf8');
        }
      } else {
        const ndjson = this.retryQueue.map((item) => JSON.stringify(item)).join('\n') + '\n';
        const tmpFile = `${this.queueFilePath}.tmp`;
        fs.writeFileSync(tmpFile, ndjson, 'utf8');
        fs.renameSync(tmpFile, this.queueFilePath);
      }
    } catch (err: any) {
      console.warn(`[Persistent Queue Sync Error]: ${err?.message || err}`);
    }
  }

  // Auto-retry worker runs every 5 seconds to flush pending telemetry queue
  private startRetryWorker() {
    if (this.retryWorkerTimer) return;
    this.retryWorkerTimer = setInterval(() => {
      this.flushRetryQueue().catch(() => {});
    }, 5000);
  }

  public async flushRetryQueue(): Promise<{ flushedCount: number; remainingCount: number }> {
    if (this.isFlushingRetryQueue || this.retryQueue.length === 0) {
      return { flushedCount: 0, remainingCount: this.retryQueue.length };
    }
    if (!this.db.postgresRepo?.isReady()) {
      return { flushedCount: 0, remainingCount: this.retryQueue.length };
    }

    this.isFlushingRetryQueue = true;
    let flushedCount = 0;
    let itemsToFlush: TelemetryReading[] = [];
    try {
      itemsToFlush = [...this.retryQueue];
      this.retryQueue = [];

      if (itemsToFlush.length > 0) {
        if (typeof this.db.postgresRepo.saveTelemetryBatch === 'function') {
          flushedCount = await this.db.postgresRepo.saveTelemetryBatch(itemsToFlush);
        } else {
          for (const item of itemsToFlush) {
            await this.db.postgresRepo.saveTelemetry(item);
            flushedCount++;
          }
        }
        console.log(`[Telemetry Persistence] ${flushedCount} adet sıradaki telemetri kaydı PostgreSQL / TimescaleDB'ye başarıyla aktarıldı.`);
        this.saveDiskQueue();
      }
    } catch (err: any) {
      console.warn(`[Telemetry Persistence Batch Retry Warning] PostgreSQL toplu yazma hatası: ${err?.message || err}. Yeniden denenecek.`);
      if (itemsToFlush.length > 0) {
        this.retryQueue.unshift(...itemsToFlush);
        this.saveDiskQueue();
      }
    } finally {
      this.isFlushingRetryQueue = false;
    }

    return { flushedCount, remainingCount: this.retryQueue.length };
  }

  public getRetryQueueStats() {
    let diskSizeBytes = 0;
    try {
      if (fs.existsSync(this.queueFilePath)) {
        diskSizeBytes = fs.statSync(this.queueFilePath).size;
      }
    } catch {}

    return {
      pendingRetryCount: this.retryQueue.length,
      isFlushing: this.isFlushingRetryQueue,
      persistentQueuePath: this.queueFilePath,
      diskSizeBytes,
      durable: true,
    };
  }

  // Ingestion Engine
  private RAW_TELEMETRY_MAX_BUFFER = 10000; // Expanded high-frequency ring buffer

  public async writeTelemetryToPostgres(reading: TelemetryReading): Promise<boolean> {
    const dev = (this.db.data.devices || []).find((d: Device) => d.id === reading.deviceId);
    const isSimulated = dev?.isSimulated || false;
    const saveSimulatedDataToDb = dev?.saveSimulatedDataToDb || false;

    // Do not write virtual device telemetry to DB unless saveSimulatedDataToDb is explicitly active
    if (isSimulated && !saveSimulatedDataToDb) {
      return true;
    }

    if (this.db.postgresRepo?.isReady()) {
      try {
        const writeRes = await this.db.postgresRepo.saveTelemetry(reading);
        const rowCount = typeof writeRes?.rowCount === 'number' ? writeRes.rowCount : 1;
        if (rowCount > 0) {
          return true;
        }
        console.warn(`[Telemetry Write Warning] PostgreSQL 0 satır güncellendi (${reading.deviceId}/${reading.metric}). Sıraya alındı.`);
        this.enqueueToRetryQueue(reading);
        return false;
      } catch (err: any) {
        console.warn(`[Telemetry Write Error] PostgreSQL INSERT hatası (${reading.deviceId}/${reading.metric}): ${err?.message || err}. Otomatik tekrar sırasına eklendi.`);
        this.enqueueToRetryQueue(reading);
        return false;
      }
    }

    const activeEngine = typeof this.db.getActiveEngine === 'function' ? this.db.getActiveEngine() : 'postgres';
    if (activeEngine === 'postgres' || activeEngine === 'timescaledb') {
      console.warn(`[Telemetry Write Warning] PostgreSQL aktif ancak bağlı değil. Kayıt tekrar sırasına alındı (${reading.deviceId}/${reading.metric}).`);
      this.enqueueToRetryQueue(reading);
      return false;
    }
    return true;
  }

  // Async Telemetry Ingestion with Write Acknowledgment (Zero Data Loss)
  public async addTelemetryReadingAsync(reading: Omit<TelemetryReading, 'id' | 'timestamp'>): Promise<{
    reading: TelemetryReading;
    persisted: boolean;
    engine: string;
    rowCount?: number;
    queuedForRetry?: boolean;
    error?: string;
  }> {
    const fullReading: TelemetryReading = {
      ...reading,
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    if (!this.db.data.telemetry) this.db.data.telemetry = [];
    this.db.data.telemetry.push(fullReading);

    // High-performance sliding ring buffer (10,000 raw points in memory)
    if (this.db.data.telemetry.length > this.RAW_TELEMETRY_MAX_BUFFER) {
      this.db.data.telemetry = this.db.data.telemetry.slice(-this.RAW_TELEMETRY_MAX_BUFFER);
    }

    // Update device metrics & last seen
    const device = (this.db.data.devices || []).find((d: Device) => d.id === reading.deviceId);
    if (device) {
      if (device.status !== 'maintenance' && device.dataFlowActive !== false) {
        device.lastSeen = fullReading.timestamp;
        device.status = 'online';
      }
      if (!device.metrics) device.metrics = {};
      (device.metrics as Record<string, number>)[reading.metric] = reading.value;
      const lowerKey1 = reading.metric.toLowerCase();
      if (lowerKey1 !== reading.metric) {
        (device.metrics as Record<string, number>)[lowerKey1] = reading.value;
      }

      device.updatedAt = fullReading.timestamp;
      device.version = (device.version || 1) + 1;

      this.processHistory(fullReading, device.isSimulated || false, device.saveSimulatedDataToDb || false);
    }

    // Check threshold rules for notification trigger!
    this.evaluateRules(fullReading, device);

    this.db.scheduleSave();

    // Check virtual device setting: if device is simulated and saveSimulatedDataToDb is false, skip writing to DB
    const isSimulated = device?.isSimulated || false;
    const saveSimulatedDataToDb = device?.saveSimulatedDataToDb || false;

    if (isSimulated && !saveSimulatedDataToDb) {
      return {
        reading: fullReading,
        persisted: true,
        engine: 'RAM / Sanal Filtre (Veritabanına Yazılmıyor)',
        rowCount: 0,
        queuedForRetry: false,
      };
    }

    // Direct Write Acknowledgment Check
    const isReady = this.db.postgresRepo?.isReady();
    const activeEngine = typeof this.db.getActiveEngine === 'function' ? this.db.getActiveEngine() : 'postgres';
    let persisted = false;
    let engine = 'RAM / Local Buffer';
    let queuedForRetry = false;
    let errorMsg: string | undefined = undefined;
    let affectedRows = 0;

    if (isReady) {
      try {
        const writeRes = await this.db.postgresRepo.saveTelemetry(fullReading);
        const rowCount = typeof writeRes?.rowCount === 'number' ? writeRes.rowCount : 1;
        affectedRows = rowCount;
        if (rowCount > 0) {
          engine = 'PostgreSQL / TimescaleDB';
          persisted = true;
        } else {
          errorMsg = 'PostgreSQL INSERT 0 satır etkiledi (yazılamadı)';
          console.warn(`[Telemetry Persist Warning] ${errorMsg}. Kayıt tekrar sırasına eklendi.`);
          this.enqueueToRetryQueue(fullReading);
          engine = 'PostgreSQL (Sırada / Otomatik Tekrar Denenecek)';
          persisted = false;
          queuedForRetry = true;
        }
      } catch (err: any) {
        errorMsg = err?.message || 'PostgreSQL INSERT hatası';
        console.warn(`[Telemetry Persist Failure] ${errorMsg}. Kayıt tekrar sırasına eklendi.`);
        this.enqueueToRetryQueue(fullReading);
        engine = 'PostgreSQL (Sırada / Otomatik Tekrar Denenecek)';
        persisted = false;
        queuedForRetry = true;
      }
    } else if (activeEngine === 'postgres' || activeEngine === 'timescaledb') {
      this.enqueueToRetryQueue(fullReading);
      engine = 'RAM Buffer (PostgreSQL Bağlantısı Bekleniyor)';
      persisted = false;
      queuedForRetry = true;
      errorMsg = 'PostgreSQL sunucusuna ulaşılamadı, veri sıraya alındı';
    } else {
      // Standalone RAM mode
      persisted = true;
      engine = 'RAM / Local Buffer';
    }

    return {
      reading: fullReading,
      persisted,
      engine,
      rowCount: affectedRows,
      queuedForRetry,
      error: errorMsg,
    };
  }

  public addTelemetryReading(reading: Omit<TelemetryReading, 'id' | 'timestamp'>): TelemetryReading {
    const fullReading: TelemetryReading = {
      ...reading,
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    if (!this.db.data.telemetry) this.db.data.telemetry = [];
    this.db.data.telemetry.push(fullReading);

    // High-performance sliding ring buffer (10,000 raw points in memory)
    if (this.db.data.telemetry.length > this.RAW_TELEMETRY_MAX_BUFFER) {
      this.db.data.telemetry = this.db.data.telemetry.slice(-this.RAW_TELEMETRY_MAX_BUFFER);
    }

    // Persist to PostgreSQL / TimescaleDB hypertable with safety net
    this.writeTelemetryToPostgres(fullReading).catch((err) => {
      console.warn(`[Telemetry Sync Catch] PostgreSQL yazması başarısız oldu: ${err?.message || err}. Sıraya eklendi.`);
      this.enqueueToRetryQueue(fullReading);
    });

    // Update device metrics & last seen
    const device = (this.db.data.devices || []).find((d: Device) => d.id === reading.deviceId);
    if (device) {
      if (device.status !== 'maintenance' && device.dataFlowActive !== false) {
        device.lastSeen = fullReading.timestamp;
        device.status = 'online';
      }
      if (!device.metrics) device.metrics = {};
      (device.metrics as Record<string, number>)[reading.metric] = reading.value;
      const lowerKey2 = reading.metric.toLowerCase();
      if (lowerKey2 !== reading.metric) {
        (device.metrics as Record<string, number>)[lowerKey2] = reading.value;
      }

      device.updatedAt = fullReading.timestamp;
      device.version = (device.version || 1) + 1;

      this.processHistory(fullReading, device.isSimulated || false, device.saveSimulatedDataToDb || false);
    }

    // Check threshold rules for notification trigger!
    this.evaluateRules(fullReading, device);

    this.db.scheduleSave();
    return fullReading;
  }

  public getTelemetryStats() {
    let totalAggregatedBuckets = 0;
    if (this.db.data.history) {
      for (const devMetrics of Object.values(this.db.data.history) as any[]) {
        for (const metricData of Object.values(devMetrics) as any[]) {
          totalAggregatedBuckets +=
            (metricData.hourly?.length || 0) +
            (metricData.daily?.length || 0) +
            (metricData.monthly?.length || 0);
        }
      }
    }

    return {
      rawBufferCurrentSize: this.db.data.telemetry?.length || 0,
      rawBufferMaxSize: this.RAW_TELEMETRY_MAX_BUFFER,
      bufferUtilizationPercent: Math.round(
        ((this.db.data.telemetry?.length || 0) / this.RAW_TELEMETRY_MAX_BUFFER) * 100
      ),
      timeSeriesAggregatedBuckets: totalAggregatedBuckets,
      persistentQueue: this.getRetryQueueStats(),
      retentionPolicy: {
        rawBuffer: '10,000 Son Canlı Veri Noktası (Kayar Halka Tampon)',
        hourlyRollup: '168 Saat (7 Gün Saatlik Ortalama)',
        dailyRollup: '365 Gün (1 Yıl Günlük Ortalama)',
        monthlyRollup: '60 Ay (5 Yıl Aylık Ortalama)',
        postgresArchive: 'PostgreSQL / TimescaleDB (Sıkıştırılmış Hypertable)',
        persistentQueue: 'Durable Disk-Backed Queue (/data/telemetry-retry.ndjson)',
      },
    };
  }

  public getHistory(deviceId: string, metric: string): MetricHistory | null {
    if (!this.db.data.history || !this.db.data.history[deviceId] || !this.db.data.history[deviceId][metric]) {
      return null;
    }
    return this.db.data.history[deviceId][metric];
  }

  public async getHistoryAsync(deviceId: string, metric: string): Promise<MetricHistory | null> {
    const pool = this.db.getPgPool?.();
    if (pool) {
      try {
        const hourlyRes = await pool.query(
          `
          SELECT 
            time_bucket('1 hour', created_at) AS bucket,
            ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
            COUNT(*)::int AS cnt
          FROM telemetry_readings
          WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '7 days'
          GROUP BY bucket
          ORDER BY bucket ASC;
        `,
          [deviceId, metric]
        );

        const dailyRes = await pool.query(
          `
          SELECT 
            time_bucket('1 day', created_at) AS bucket,
            ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
            COUNT(*)::int AS cnt
          FROM telemetry_readings
          WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '365 days'
          GROUP BY bucket
          ORDER BY bucket ASC;
        `,
          [deviceId, metric]
        );

        const monthlyRes = await pool.query(
          `
          SELECT 
            time_bucket('1 month', created_at) AS bucket,
            ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
            COUNT(*)::int AS cnt
          FROM telemetry_readings
          WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '5 years'
          GROUP BY bucket
          ORDER BY bucket ASC;
        `,
          [deviceId, metric]
        );

        if (hourlyRes.rows?.length > 0 || dailyRes.rows?.length > 0 || monthlyRes.rows?.length > 0) {
          return {
            hourly: (hourlyRes.rows || []).map((r: any) => ({
              time: new Date(r.bucket).toISOString(),
              value: Number(r.avg_val),
              count: Number(r.cnt),
            })),
            daily: (dailyRes.rows || []).map((r: any) => ({
              time: new Date(r.bucket).toISOString(),
              value: Number(r.avg_val),
              count: Number(r.cnt),
            })),
            monthly: (monthlyRes.rows || []).map((r: any) => ({
              time: new Date(r.bucket).toISOString(),
              value: Number(r.avg_val),
              count: Number(r.cnt),
            })),
          };
        }
      } catch {
        // Fallback to in-memory history
      }
    }
    return this.getHistory(deviceId, metric);
  }

  public getTelemetry(
    deviceId?: string,
    metric?: string,
    limit = 100,
    requestingUserId?: string,
    targetCustomerId?: string
  ): TelemetryReading[] {
    let list: TelemetryReading[] = this.db.data.telemetry || [];

    // Get list of allowed device IDs for this user or target customer
    const allowedDevices = this.db.getDevices(requestingUserId, targetCustomerId);
    const allowedDeviceIds = new Set(allowedDevices.map((d: Device) => d.id));

    // Filter by allowed devices
    list = list.filter((t) => allowedDeviceIds.has(t.deviceId));

    if (deviceId && deviceId !== 'all') {
      list = list.filter((t) => t.deviceId === deviceId);
    }
    if (metric && metric !== 'all') {
      list = list.filter((t) => t.metric === metric);
    }
    return list.slice(-limit);
  }

  public async getTelemetryAsync(
    deviceId?: string,
    metric?: string,
    limit = 100,
    requestingUserId?: string,
    targetCustomerId?: string
  ): Promise<TelemetryReading[]> {
    const pool = this.db.getPgPool?.();
    if (pool) {
      try {
        const allowedDevices = this.db.getDevices(requestingUserId, targetCustomerId);
        const allowedDeviceIds = allowedDevices.map((d: Device) => d.id);
        if (allowedDeviceIds.length > 0) {
          const queryDev = deviceId && deviceId !== 'all' ? deviceId : null;
          const queryMetric = metric && metric !== 'all' ? metric : null;
          const numLimit = Math.min(1000, Math.max(1, limit));

          const sql = `
            SELECT 
              id,
              device_id AS "deviceId",
              device_name AS "deviceName",
              metric,
              metric_value AS value,
              unit,
              status_level AS status,
              created_at AS timestamp
            FROM telemetry_readings
            WHERE device_id = ANY($1::text[])
              AND ($2::text IS NULL OR device_id = $2)
              AND ($3::text IS NULL OR metric = $3)
            ORDER BY created_at DESC
            LIMIT $4;
          `;

          const res = await pool.query(sql, [allowedDeviceIds, queryDev, queryMetric, numLimit]);
          if (res.rows && res.rows.length > 0) {
            return res.rows.map((r: any) => ({
              id: r.id,
              deviceId: r.deviceId,
              deviceName: r.deviceName,
              metric: r.metric,
              value: Number(r.value),
              unit: r.unit,
              status: r.status,
              timestamp: new Date(r.timestamp).toISOString(),
            }));
          }
        }
      } catch {
        // Fallback to in-memory buffer
      }
    }
    return this.getTelemetry(deviceId, metric, limit, requestingUserId, targetCustomerId);
  }

  // Advanced Alarm Evaluation Engine
  public upsertActiveAlarm(alarm: ActiveAlarm) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const idx = this.db.data.activeAlarms.findIndex((a: ActiveAlarm) => a.id === alarm.id);
    if (idx >= 0) {
      this.db.data.activeAlarms[idx] = alarm;
    } else {
      this.db.data.activeAlarms.push(alarm);
    }

    const dev = (this.db.data.devices || []).find((d: Device) => d.id === alarm.deviceId);
    const isSimulated = dev?.isSimulated || false;
    const saveSimulatedDataToDb = dev?.saveSimulatedDataToDb || false;

    // Sync to PostgreSQL Repository if real device OR if saveSimulatedDataToDb is true
    if (!isSimulated || saveSimulatedDataToDb) {
      this.db.postgresRepo?.saveAlarm(alarm).catch(() => {});
    }
  }

  private updateActiveNotificationDeduplicated(alarm: ActiveAlarm) {
    const existingNotif = (this.db.data.notifications || []).find(
      (n: any) => n.alarmId === alarm.id && n.alarmState !== 'RESOLVED' && !n.read
    );
    if (existingNotif) {
      existingNotif.message = `${alarm.message} (Ölçüm #${alarm.repeatCount}, Anlık: ${alarm.currentValue})`;
      existingNotif.repeatCount = alarm.repeatCount;
      existingNotif.currentValue = alarm.currentValue;
      existingNotif.timestamp = new Date().toISOString();
      existingNotif.updatedAt = existingNotif.timestamp;
      existingNotif.version = (existingNotif.version || 1) + 1;

      this.db.notifyNotificationListeners('notification:new', existingNotif);
    }
  }

  public emitAlarmNotification(
    alarm: ActiveAlarm,
    eventType: 'OPEN' | 'RESOLVED' | 'REPEAT' | 'ACKNOWLEDGED',
    title: string,
    customMsg?: string
  ) {
    const msg = customMsg || `${alarm.message} (Eşik: ${alarm.thresholdValue}, Ölçülen: ${alarm.currentValue})`;

    this.db.addNotification({
      userId: alarm.userId,
      title,
      message: msg,
      severity: eventType === 'RESOLVED' ? 'info' : alarm.severity,
      deviceId: alarm.deviceId,
      deviceName: alarm.deviceName,
      alarmId: alarm.id,
      ruleId: alarm.ruleId,
      alarmState: eventType,
      acknowledged: alarm.acknowledged,
      acknowledgedAt: alarm.acknowledgedAt,
      acknowledgedBy: alarm.acknowledgedBy,
      repeatCount: alarm.repeatCount,
      currentValue: alarm.currentValue,
      thresholdValue: alarm.thresholdValue,
      silencedUntil: alarm.silencedUntil,
    });

    if (alarm.userId !== 'usr_admin') {
      this.db.addNotification({
        userId: 'usr_admin',
        title: `[${alarm.deviceName}] ${title}`,
        message: msg,
        severity: eventType === 'RESOLVED' ? 'info' : alarm.severity,
        deviceId: alarm.deviceId,
        deviceName: alarm.deviceName,
        alarmId: alarm.id,
        ruleId: alarm.ruleId,
        alarmState: eventType,
        acknowledged: alarm.acknowledged,
        acknowledgedAt: alarm.acknowledgedAt,
        acknowledgedBy: alarm.acknowledgedBy,
        repeatCount: alarm.repeatCount,
        currentValue: alarm.currentValue,
        thresholdValue: alarm.thresholdValue,
        silencedUntil: alarm.silencedUntil,
      });
    }

    // Enqueue external channels (WhatsApp, Telegram, Email, SMS, Webhook)
    this.enqueueExternalNotification(alarm, eventType, title, msg);
  }

  private enqueueExternalNotification(
    alarm: ActiveAlarm,
    _eventType: 'OPEN' | 'RESOLVED' | 'REPEAT' | 'ACKNOWLEDGED',
    title: string,
    msg: string
  ) {
    if (!this.db.data.notificationQueue) this.db.data.notificationQueue = [];
    const rule = (this.db.data.rules || []).find((r: ThresholdRule) => r.id === alarm.ruleId);
    if (!rule || !rule.notificationChannels || rule.notificationChannels.length === 0) return;

    const user = (this.db.data.users || []).find((u: any) => u.id === alarm.userId);

    for (const channel of rule.notificationChannels) {
      if (channel === 'app') continue; // In-panel feed handles app notifications

      const recipientsSet = new Set<string>();

      // 1. Specific rule recipients
      if (rule.recipients && rule.recipients.length > 0) {
        for (const r of rule.recipients) {
          const cleanR = r.trim();
          if (!cleanR) continue;
          if (channel === 'email' && cleanR.includes('@')) recipientsSet.add(cleanR);
          if (channel === 'whatsapp' && (cleanR.startsWith('+') || /^\d+$/.test(cleanR))) recipientsSet.add(cleanR);
          if (channel === 'telegram') recipientsSet.add(cleanR);
          if (channel === 'sms' && (cleanR.startsWith('+') || /^\d+$/.test(cleanR))) recipientsSet.add(cleanR);
          if (channel === 'webhook' && cleanR.startsWith('http')) recipientsSet.add(cleanR);
        }
      }

      // 2. User profile contact details
      if (user) {
        if (channel === 'email' && (user.notificationEmail || user.email)) {
          recipientsSet.add((user.notificationEmail || user.email).trim());
        }
        if (channel === 'whatsapp' && (user.whatsappNumber || user.phone)) {
          recipientsSet.add((user.whatsappNumber || user.phone).trim());
        }
        if (channel === 'telegram' && user.telegramChatId) {
          recipientsSet.add(user.telegramChatId.trim());
        }
        if (channel === 'sms' && user.phone) {
          recipientsSet.add(user.phone.trim());
        }
        if (channel === 'webhook') {
          const defaultWh = this.db.getServiceConfig?.()?.webhook?.defaultEndpoint;
          if (defaultWh) recipientsSet.add(defaultWh);
        }
      }

      for (const recipient of recipientsSet) {
        const queueItem: NotificationQueueItem = {
          id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ruleId: rule.id,
          userId: alarm.userId,
          userName: user?.name || alarm.userId,
          channel,
          recipient,
          title,
          message: msg,
          severity: alarm.severity,
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        this.db.data.notificationQueue.unshift(queueItem);
      }
    }

    this.db.saveData(this.db.data);
    setTimeout(() => {
      this.db.processQueue?.();
    }, 50);
  }

  private evaluateRules(reading: TelemetryReading, device?: Device) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];

    const rules = (this.db.data.rules || []).filter(
      (r: ThresholdRule) =>
        r.enabled &&
        (r.deviceId === 'all' || r.deviceId === reading.deviceId) &&
        r.metricKey === reading.metric
    );

    const deviceOwnerId = device ? device.userId : 'usr_admin';
    const nowIso = reading.timestamp || new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    for (const rule of rules) {
      // 1. Strict Tenant Rule Evaluation Check:
      // If the rule belongs to a customer, it ONLY applies to that customer's devices.
      if (rule.userId && rule.userId !== 'usr_admin') {
        if (deviceOwnerId !== rule.userId) {
          continue;
        }
      }
      // If the rule belongs to admin with deviceId = 'all', it ONLY applies to admin's devices.
      // (It must NOT trigger alarms on customer devices unless explicitly assigned to that device).
      if (rule.userId === 'usr_admin' && rule.deviceId === 'all' && deviceOwnerId !== 'usr_admin') {
        continue;
      }
      // If the rule has a specific deviceId, ensure it matches reading.deviceId
      if (rule.deviceId !== 'all' && rule.deviceId !== reading.deviceId) {
        continue;
      }

      if (rule.activeHours) {
        let startStr = '';
        let endStr = '';
        if (typeof rule.activeHours === 'string' && rule.activeHours.includes('-')) {
          const parts = rule.activeHours.split('-');
          startStr = parts[0].trim();
          endStr = parts[1].trim();
        } else if (
          typeof rule.activeHours === 'object' &&
          (rule.activeHours as any).start &&
          (rule.activeHours as any).end
        ) {
          startStr = (rule.activeHours as any).start;
          endStr = (rule.activeHours as any).end;
        }

        if (startStr && endStr && (startStr !== '00:00' || endStr !== '23:59')) {
          const now = new Date(nowIso);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const [startH, startM] = startStr.split(':').map(Number);
          const [endH, endM] = endStr.split(':').map(Number);
          const startMinutes = (startH || 0) * 60 + (startM || 0);
          const endMinutes = (endH || 0) * 60 + (endM || 0);

          if (startMinutes < endMinutes) {
            if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
              continue;
            }
          } else if (startMinutes > endMinutes) {
            if (currentMinutes < startMinutes && currentMinutes > endMinutes) {
              continue;
            }
          }
        }
      }

      const alarmKey = `alarm_${rule.id}_${reading.deviceId}_${reading.metric}`;

      if (rule.silencedUntil && new Date(rule.silencedUntil).getTime() > nowMs) {
        continue;
      }

      let existingAlarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);

      let isBreached = false;
      if (rule.operator === '>' && reading.value > rule.thresholdValue) isBreached = true;
      if (rule.operator === '<' && reading.value < rule.thresholdValue) isBreached = true;
      if (rule.operator === '==' && reading.value === rule.thresholdValue) isBreached = true;

      const hysteresis = rule.hysteresis || 0;
      let isRecovered = false;
      if (rule.operator === '>' && reading.value <= rule.thresholdValue - hysteresis) isRecovered = true;
      if (rule.operator === '<' && reading.value >= rule.thresholdValue + hysteresis) isRecovered = true;
      if (rule.operator === '==' && reading.value !== rule.thresholdValue) isRecovered = true;

      const minBreachSec = rule.minBreachDurationSeconds || 0;
      const repeatIntervalSec = rule.repeatIntervalSeconds || 300;

      const formattedMsg = rule.messageTemplate
        .replace('{deviceName}', reading.deviceName)
        .replace('{value}', String(reading.value));

      if (isBreached) {
        if (
          existingAlarm &&
          existingAlarm.silencedUntil &&
          new Date(existingAlarm.silencedUntil).getTime() > nowMs
        ) {
          existingAlarm.currentValue = reading.value;
          existingAlarm.repeatCount++;
          existingAlarm.updatedAt = nowIso;
          continue;
        }

        if (
          !existingAlarm ||
          existingAlarm.state === 'NORMAL' ||
          existingAlarm.state === 'RESOLVED'
        ) {
          if (minBreachSec > 0) {
            existingAlarm = {
              id: alarmKey,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              userId: deviceOwnerId,
              metricKey: reading.metric,
              operator: rule.operator,
              thresholdValue: rule.thresholdValue,
              currentValue: reading.value,
              severity: rule.severity,
              state: 'BREACH_PENDING',
              firstBreachAt: nowIso,
              acknowledged: false,
              repeatCount: 1,
              message: formattedMsg,
              updatedAt: nowIso,
              version: 1,
            };
            this.upsertActiveAlarm(existingAlarm);
          } else {
            existingAlarm = {
              id: alarmKey,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              userId: deviceOwnerId,
              metricKey: reading.metric,
              operator: rule.operator,
              thresholdValue: rule.thresholdValue,
              currentValue: reading.value,
              severity: rule.severity,
              state: 'ACTIVE',
              firstBreachAt: nowIso,
              triggeredAt: nowIso,
              lastNotifiedAt: nowIso,
              acknowledged: false,
              repeatCount: 1,
              message: formattedMsg,
              updatedAt: nowIso,
              version: 1,
            };
            this.upsertActiveAlarm(existingAlarm);
            this.emitAlarmNotification(
              existingAlarm,
              'OPEN',
              `🚨 [ALARM AÇILDI] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
            );
          }
        } else if (existingAlarm.state === 'BREACH_PENDING') {
          const breachDurationMs =
            nowMs - new Date(existingAlarm.firstBreachAt || nowIso).getTime();
          if (breachDurationMs >= minBreachSec * 1000) {
            existingAlarm.state = 'ACTIVE';
            existingAlarm.triggeredAt = nowIso;
            existingAlarm.lastNotifiedAt = nowIso;
            existingAlarm.currentValue = reading.value;
            existingAlarm.repeatCount = 1;
            existingAlarm.message = formattedMsg;
            existingAlarm.updatedAt = nowIso;
            existingAlarm.version = (existingAlarm.version || 1) + 1;
            this.upsertActiveAlarm(existingAlarm);

            this.emitAlarmNotification(
              existingAlarm,
              'OPEN',
              `🚨 [ALARM AÇILDI] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
            );
          } else {
            existingAlarm.currentValue = reading.value;
            existingAlarm.updatedAt = nowIso;
          }
        } else if (existingAlarm.state === 'ACTIVE' || existingAlarm.state === 'SILENCED') {
          existingAlarm.repeatCount++;
          existingAlarm.currentValue = reading.value;
          existingAlarm.message = formattedMsg;
          existingAlarm.updatedAt = nowIso;

          const lastNotifiedMs = new Date(existingAlarm.lastNotifiedAt || nowIso).getTime();
          const timeSinceLastNotifiedSec = (nowMs - lastNotifiedMs) / 1000;

          if (!existingAlarm.acknowledged && timeSinceLastNotifiedSec >= repeatIntervalSec) {
            existingAlarm.lastNotifiedAt = nowIso;
            existingAlarm.version = (existingAlarm.version || 1) + 1;
            this.upsertActiveAlarm(existingAlarm);

            this.emitAlarmNotification(
              existingAlarm,
              'REPEAT',
              `⚠️ [ALARM TEKRARI #${existingAlarm.repeatCount}] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
            );
          } else {
            this.updateActiveNotificationDeduplicated(existingAlarm);
            this.upsertActiveAlarm(existingAlarm);
          }
        }
      } else if (
        isRecovered &&
        existingAlarm &&
        (existingAlarm.state === 'ACTIVE' ||
          existingAlarm.state === 'BREACH_PENDING' ||
          existingAlarm.state === 'SILENCED')
      ) {
        existingAlarm.state = 'RESOLVED';
        existingAlarm.resolvedAt = nowIso;
        existingAlarm.currentValue = reading.value;
        existingAlarm.updatedAt = nowIso;
        existingAlarm.version = (existingAlarm.version || 1) + 1;
        this.upsertActiveAlarm(existingAlarm);

        this.emitAlarmNotification(
          existingAlarm,
          'RESOLVED',
          `✅ [ALARM NORMALE DÖNDÜ] ${reading.deviceName} - ${reading.metric.toUpperCase()}`,
          `Değer güvenli aralığa geri döndü: ${reading.value} ${reading.unit} (Eşik: ${rule.thresholdValue}, Histerezis: ${rule.hysteresis || 0})`
        );
      }
    }
  }

  public processHistory(reading: TelemetryReading, isSimulated: boolean, saveSimulatedDataToDb: boolean = false) {
    if (isSimulated && !saveSimulatedDataToDb) return;

    const { deviceId, metric, value, timestamp } = reading;

    if (!this.db.data.history) this.db.data.history = {};
    if (!this.db.data.history[deviceId]) this.db.data.history[deviceId] = {};
    if (!this.db.data.history[deviceId][metric]) {
      this.db.data.history[deviceId][metric] = { hourly: [], daily: [], monthly: [] };
    }

    const history = this.db.data.history[deviceId][metric];
    const d = new Date(timestamp);

    const hourKey = d.toISOString().substring(0, 13) + ':00:00Z';
    const dayKey = d.toISOString().substring(0, 10) + 'T00:00:00Z';
    const monthKey = d.toISOString().substring(0, 7) + '-01T00:00:00Z';

    const updateBucket = (bucket: any[], key: string, maxItems: number) => {
      let entry = bucket.find((b: any) => b.time === key);
      if (!entry) {
        entry = { time: key, value: 0, count: 0 };
        bucket.push(entry);
        bucket.sort((a: any, b: any) => a.time.localeCompare(b.time));
        if (bucket.length > maxItems) {
          bucket.shift();
        }
      }
      entry.count += 1;
      entry.value = entry.value + (value - entry.value) / entry.count;
    };

    updateBucket(history.hourly, hourKey, 168);
    updateBucket(history.daily, dayKey, 365);
    updateBucket(history.monthly, monthKey, 60);
  }
}
