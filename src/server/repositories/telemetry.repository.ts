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

export interface TelemetryPacket {
  packetId: string;
  deviceId: string;
  timestamp: string;
  sequence?: number;
  readings: TelemetryReading[];
  attempts?: number;
  lastAttemptAt?: string;
}

export class TelemetryRepository {
  private retryQueue: TelemetryPacket[] = [];
  private isFlushingRetryQueue = false;
  private retryWorkerTimer: NodeJS.Timeout | null = null;
  private queueFilePath = path.join(process.cwd(), 'data', 'telemetry-retry.ndjson');

  constructor(private db: any) {
    this.loadPersistentQueue();
    this.startRetryWorker();
  }

  // Load uncommitted retry packets from durable NDJSON file on disk
  private loadPersistentQueue() {
    try {
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(this.queueFilePath)) {
        const content = fs.readFileSync(this.queueFilePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        let loadedPackets = 0;
        let loadedReadings = 0;
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed && Array.isArray(parsed.readings) && parsed.readings.length > 0) {
              this.retryQueue.push(parsed as TelemetryPacket);
              loadedPackets++;
              loadedReadings += parsed.readings.length;
            } else if (parsed && parsed.deviceId && parsed.metric) {
              // Backward compatibility for legacy single-reading lines
              const legacyPacket: TelemetryPacket = {
                packetId: `pkt_legacy_${parsed.id || Date.now()}`,
                deviceId: parsed.deviceId,
                timestamp: parsed.timestamp || new Date().toISOString(),
                sequence: parsed.sequence,
                readings: [parsed as TelemetryReading],
                attempts: 0,
                lastAttemptAt: new Date().toISOString(),
              };
              this.retryQueue.push(legacyPacket);
              loadedPackets++;
              loadedReadings++;
            }
          } catch {
            // ignore malformed line
          }
        }
        if (loadedPackets > 0) {
          console.log(`[Persistent Queue / WAL] Diskten ${loadedPackets} paket (${loadedReadings} metrik kaydı) başarıyla yüklendi (${this.queueFilePath}).`);
        }
      }
    } catch (err: any) {
      console.warn(`[Persistent Queue Load Error]: ${err?.message || err}`);
    }
  }

  // Durable Disk-backed Packet Enqueue (Write-Ahead Log style for All-or-Nothing guarantees)
  private enqueuePacketToRetryQueue(readings: TelemetryReading[]) {
    if (!readings || readings.length === 0) return;

    const first = readings[0];
    const sequence = first.sequence;
    const packetId =
      sequence !== undefined && sequence !== null
        ? `pkt_${first.deviceId}_seq_${sequence}`
        : `pkt_${first.deviceId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const packet: TelemetryPacket = {
      packetId,
      deviceId: first.deviceId,
      timestamp: first.timestamp || new Date().toISOString(),
      sequence,
      readings,
      attempts: 0,
      lastAttemptAt: new Date().toISOString(),
    };

    this.retryQueue.push(packet);

    try {
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.appendFileSync(this.queueFilePath, JSON.stringify(packet) + '\n', 'utf8');
      console.warn(`[Persistent WAL] All-or-Nothing Paket disk sırasına kilitlendi (Paket ID: ${packetId}, Cihaz: ${packet.deviceId}, Metrik Sayısı: ${readings.length}).`);
    } catch (err: any) {
      console.warn(`[Persistent Queue Append Error]: ${err?.message || err}`);
    }
  }

  // Legacy fallback wrapper
  private enqueueToRetryQueue(reading: TelemetryReading) {
    this.enqueuePacketToRetryQueue([reading]);
  }

  // Synchronize remaining packets to disk atomically
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

  // Auto-retry worker runs every 5 seconds to flush pending telemetry packets atomically
  private startRetryWorker() {
    if (this.retryWorkerTimer) return;
    this.retryWorkerTimer = setInterval(() => {
      this.flushRetryQueue().catch(() => {});
    }, 5000);
  }

  public async flushRetryQueue(): Promise<{
    flushedPacketCount: number;
    flushedReadingCount: number;
    remainingPacketCount: number;
    remainingReadingCount: number;
    flushedCount: number; // backward compatibility
    remainingCount: number; // backward compatibility
  }> {
    const initialRemainingReadings = this.retryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);

    if (this.isFlushingRetryQueue || this.retryQueue.length === 0) {
      return {
        flushedPacketCount: 0,
        flushedReadingCount: 0,
        remainingPacketCount: this.retryQueue.length,
        remainingReadingCount: initialRemainingReadings,
        flushedCount: 0,
        remainingCount: initialRemainingReadings,
      };
    }
    if (!this.db.postgresRepo?.isReady()) {
      return {
        flushedPacketCount: 0,
        flushedReadingCount: 0,
        remainingPacketCount: this.retryQueue.length,
        remainingReadingCount: initialRemainingReadings,
        flushedCount: 0,
        remainingCount: initialRemainingReadings,
      };
    }

    this.isFlushingRetryQueue = true;
    let flushedPacketCount = 0;
    let flushedReadingCount = 0;
    const packetsToFlush = [...this.retryQueue];
    this.retryQueue = [];

    const failedPackets: TelemetryPacket[] = [];

    try {
      for (const packet of packetsToFlush) {
        try {
          // Attempt atomic transaction batch commit for the whole packet (All-or-Nothing)
          const txRes = await this.db.postgresRepo.saveTelemetryBatchInTransaction(packet.readings);
          if (txRes && (txRes.rowCount !== undefined ? txRes.rowCount >= 0 : true)) {
            flushedPacketCount++;
            flushedReadingCount += packet.readings.length;
          } else {
            packet.attempts = (packet.attempts || 0) + 1;
            packet.lastAttemptAt = new Date().toISOString();
            failedPackets.push(packet);
          }
        } catch (err: any) {
          console.warn(`[Telemetry Packet Retry Warning] Paket (${packet.packetId}) veritabanına yazılamadı: ${err?.message || err}. Tekrar sıraya alındı.`);
          packet.attempts = (packet.attempts || 0) + 1;
          packet.lastAttemptAt = new Date().toISOString();
          failedPackets.push(packet);
        }
      }

      if (failedPackets.length > 0) {
        this.retryQueue.unshift(...failedPackets);
      }

      if (flushedPacketCount > 0) {
        console.log(`[Telemetry Persistence] ${flushedPacketCount} adet paket (${flushedReadingCount} metrik kaydı) PostgreSQL / TimescaleDB'ye başarıyla aktarıldı.`);
      }

      this.saveDiskQueue();
    } catch (err: any) {
      console.warn(`[Telemetry Persistence Global Retry Error]: ${err?.message || err}`);
      if (packetsToFlush.length > 0) {
        this.retryQueue.unshift(...packetsToFlush);
        this.saveDiskQueue();
      }
    } finally {
      this.isFlushingRetryQueue = false;
    }

    const currentRemainingReadings = this.retryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);

    return {
      flushedPacketCount,
      flushedReadingCount,
      remainingPacketCount: this.retryQueue.length,
      remainingReadingCount: currentRemainingReadings,
      flushedCount: flushedReadingCount,
      remainingCount: currentRemainingReadings,
    };
  }

  public getRetryQueueStats() {
    let diskSizeBytes = 0;
    try {
      if (fs.existsSync(this.queueFilePath)) {
        diskSizeBytes = fs.statSync(this.queueFilePath).size;
      }
    } catch {}

    const totalReadings = this.retryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);

    return {
      pendingPacketCount: this.retryQueue.length,
      pendingReadingCount: totalReadings,
      pendingRetryCount: totalReadings,
      isFlushing: this.isFlushingRetryQueue,
      persistentQueuePath: this.queueFilePath,
      diskSizeBytes,
      durable: true,
      model: 'TelemetryPacket (All-or-Nothing Packet Level WAL)',
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
    const batchRes = await this.addTelemetryBatchAsync([reading]);
    return {
      reading: batchRes.readings[0],
      persisted: batchRes.persisted,
      engine: batchRes.engine,
      rowCount: batchRes.rowCount,
      queuedForRetry: batchRes.queuedForRetry,
      error: batchRes.error,
    };
  }

  // Async Batch Telemetry Ingestion with Single Transaction ACK (Zero Data Loss)
  public async addTelemetryBatchAsync(readings: Omit<TelemetryReading, 'id' | 'timestamp'>[]): Promise<{
    readings: TelemetryReading[];
    persisted: boolean;
    engine: string;
    rowCount: number;
    queuedForRetry: boolean;
    duplicateSkipped?: boolean;
    error?: string;
  }> {
    if (!readings || readings.length === 0) {
      return {
        readings: [],
        persisted: true,
        engine: 'RAM / Empty Batch',
        rowCount: 0,
        queuedForRetry: false,
      };
    }

    const timestamp = new Date().toISOString();
    const fullReadings: TelemetryReading[] = readings.map((r, i) => {
      const id =
        r.sequence !== undefined && r.sequence !== null
          ? `tel_${r.deviceId}_seq_${r.sequence}_${r.metric}`
          : `tel_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

      return {
        ...r,
        id,
        timestamp,
      };
    });

    const firstReading = fullReadings[0];
    const device = (this.db.data.devices || []).find((d: Device) => d.id === firstReading.deviceId);

    // Check virtual device setting: if device is simulated and saveSimulatedDataToDb is false, skip writing to DB
    const isSimulated = device?.isSimulated || false;
    const saveSimulatedDataToDb = device?.saveSimulatedDataToDb || false;

    // Direct Write Acknowledgment Check with Transaction BEFORE updating RAM/History
    const isReady = this.db.postgresRepo?.isReady();
    const activeEngine = typeof this.db.getActiveEngine === 'function' ? this.db.getActiveEngine() : 'postgres';
    let persisted = false;
    let engine = 'RAM / Local Buffer';
    let queuedForRetry = false;
    let errorMsg: string | undefined = undefined;
    let affectedRows = 0;
    let duplicateSkipped = false;

    if (isReady && (!isSimulated || saveSimulatedDataToDb)) {
      try {
        const txRes = await this.db.postgresRepo.saveTelemetryBatchInTransaction(fullReadings);
        affectedRows = txRes.rowCount;
        duplicateSkipped = !!txRes.duplicateSkipped;
        engine = duplicateSkipped
          ? 'PostgreSQL / TimescaleDB (Duplicate Skipped)'
          : 'PostgreSQL / TimescaleDB (Transaction)';
        persisted = true;
      } catch (err: any) {
        errorMsg = err?.message || 'PostgreSQL Transaction Batch INSERT hatası';
        console.warn(`[Telemetry Transaction Failure] ${errorMsg}. ${fullReadings.length} metrik paketi birlikte tekrar sırasına eklendi.`);
        this.enqueuePacketToRetryQueue(fullReadings);
        engine = 'PostgreSQL (Paket Sırada / Otomatik Tekrar Denenecek)';
        persisted = false;
        queuedForRetry = true;
      }
    } else if (isSimulated && !saveSimulatedDataToDb) {
      persisted = true;
      engine = 'RAM / Sanal Filtre (Veritabanına Yazılmıyor)';
    } else if (activeEngine === 'postgres' || activeEngine === 'timescaledb') {
      this.enqueuePacketToRetryQueue(fullReadings);
      engine = 'RAM Buffer (PostgreSQL Bağlantısı Bekleniyor)';
      persisted = false;
      queuedForRetry = true;
      errorMsg = 'PostgreSQL sunucusuna ulaşılamadı, paketteki tüm veriler sıraya alındı';
    } else {
      // Standalone RAM mode
      persisted = true;
      engine = 'RAM / Local Buffer';
    }

    // IF DUPLICATE SKIPPED IN POSTGRESQL:
    // Do NOT update RAM history, do NOT evaluate alarm rules, do NOT re-broadcast to WebSocket!
    if (duplicateSkipped) {
      console.log(`[Telemetry Repository] Duplicate packet skipped for device=${firstReading.deviceId}, sequence=${firstReading.sequence}`);
      return {
        readings: [],
        persisted: true,
        engine,
        rowCount: 0,
        queuedForRetry: false,
        duplicateSkipped: true,
      };
    }

    // ONLY IF NOT DUPLICATE: Update RAM ring buffer, device metrics, history, and evaluate alarm rules!
    if (!this.db.data.telemetry) this.db.data.telemetry = [];
    this.db.data.telemetry.push(...fullReadings);

    // High-performance sliding ring buffer (10,000 raw points in memory)
    if (this.db.data.telemetry.length > this.RAW_TELEMETRY_MAX_BUFFER) {
      this.db.data.telemetry = this.db.data.telemetry.slice(-this.RAW_TELEMETRY_MAX_BUFFER);
    }

    if (device) {
      if (device.status !== 'maintenance' && device.dataFlowActive !== false) {
        device.lastSeen = timestamp;
        device.status = 'online';
      }
      if (!device.metrics) device.metrics = {};

      for (const r of fullReadings) {
        (device.metrics as Record<string, number>)[r.metric] = r.value;
        const lowerKey = r.metric.toLowerCase();
        if (lowerKey !== r.metric) {
          (device.metrics as Record<string, number>)[lowerKey] = r.value;
        }

        this.processHistory(r, device.isSimulated || false, device.saveSimulatedDataToDb || false);
        this.evaluateRules(r, device);
      }

      device.updatedAt = timestamp;
      device.version = (device.version || 1) + 1;
    }

    this.db.scheduleSave();

    return {
      readings: fullReadings,
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
        // Query from Continuous Aggregate telemetry_hourly_summary (Fallback to raw time_bucket)
        let hourlyRows: any[] = [];
        try {
          const hourlyRes = await pool.query(
            `
            SELECT 
              bucket AS timestamp,
              ROUND(avg_val::numeric, 2)::float AS avg_val,
              reading_count::int AS cnt
            FROM telemetry_hourly_summary
            WHERE device_id = $1 AND metric = $2 AND bucket >= NOW() - INTERVAL '7 days'
            ORDER BY bucket ASC;
          `,
            [deviceId, metric]
          );
          hourlyRows = hourlyRes.rows || [];
        } catch {
          const rawHourly = await pool.query(
            `
            SELECT 
              time_bucket('1 hour', created_at) AS timestamp,
              ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
              COUNT(*)::int AS cnt
            FROM telemetry_readings
            WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY timestamp
            ORDER BY timestamp ASC;
          `,
            [deviceId, metric]
          );
          hourlyRows = rawHourly.rows || [];
        }

        // Query from Continuous Aggregate telemetry_daily_summary
        let dailyRows: any[] = [];
        try {
          const dailyRes = await pool.query(
            `
            SELECT 
              bucket AS timestamp,
              ROUND(avg_val::numeric, 2)::float AS avg_val,
              reading_count::int AS cnt
            FROM telemetry_daily_summary
            WHERE device_id = $1 AND metric = $2 AND bucket >= NOW() - INTERVAL '365 days'
            ORDER BY bucket ASC;
          `,
            [deviceId, metric]
          );
          dailyRows = dailyRes.rows || [];
        } catch {
          const rawDaily = await pool.query(
            `
            SELECT 
              time_bucket('1 day', created_at) AS timestamp,
              ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
              COUNT(*)::int AS cnt
            FROM telemetry_readings
            WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '365 days'
            GROUP BY timestamp
            ORDER BY timestamp ASC;
          `,
            [deviceId, metric]
          );
          dailyRows = rawDaily.rows || [];
        }

        // Monthly bucket aggregated from telemetry_daily_summary or raw
        let monthlyRows: any[] = [];
        try {
          const monthlyRes = await pool.query(
            `
            SELECT 
              date_trunc('month', bucket) AS timestamp,
              ROUND(AVG(avg_val)::numeric, 2)::float AS avg_val,
              SUM(reading_count)::int AS cnt
            FROM telemetry_daily_summary
            WHERE device_id = $1 AND metric = $2 AND bucket >= NOW() - INTERVAL '5 years'
            GROUP BY date_trunc('month', bucket)
            ORDER BY timestamp ASC;
          `,
            [deviceId, metric]
          );
          monthlyRows = monthlyRes.rows || [];
        } catch {
          const rawMonthly = await pool.query(
            `
            SELECT 
              time_bucket('1 month', created_at) AS timestamp,
              ROUND(AVG(metric_value)::numeric, 2)::float AS avg_val,
              COUNT(*)::int AS cnt
            FROM telemetry_readings
            WHERE device_id = $1 AND metric = $2 AND created_at >= NOW() - INTERVAL '5 years'
            GROUP BY timestamp
            ORDER BY timestamp ASC;
          `,
            [deviceId, metric]
          );
          monthlyRows = rawMonthly.rows || [];
        }

        if (hourlyRows.length > 0 || dailyRows.length > 0 || monthlyRows.length > 0) {
          return {
            hourly: hourlyRows.map((r: any) => ({
              time: new Date(r.timestamp).toISOString(),
              value: Number(r.avg_val),
              count: Number(r.cnt),
            })),
            daily: dailyRows.map((r: any) => ({
              time: new Date(r.timestamp).toISOString(),
              value: Number(r.avg_val),
              count: Number(r.cnt),
            })),
            monthly: monthlyRows.map((r: any) => ({
              time: new Date(r.timestamp).toISOString(),
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
    limit = 1000,
    requestingUserId?: string,
    targetCustomerId?: string,
    fromStr?: string,
    toStr?: string,
    resolutionParam?: string
  ): Promise<any[]> {
    const pool = this.db.getPgPool?.();
    if (pool) {
      try {
        const allowedDevices = this.db.getDevices(requestingUserId, targetCustomerId);
        const allowedDeviceIds = allowedDevices.map((d: Device) => d.id);
        if (allowedDeviceIds.length > 0) {
          const queryDev = deviceId && deviceId !== 'all' ? deviceId : null;
          const queryMetric = metric && metric !== 'all' ? metric : null;
          const numLimit = Math.min(5000, Math.max(1, limit || 1000));

          const fromDate = fromStr ? new Date(fromStr) : null;
          const toDate = toStr ? new Date(toStr) : new Date();
          const validFrom = fromDate && !isNaN(fromDate.getTime()) ? fromDate.toISOString() : null;
          const validTo = toDate && !isNaN(toDate.getTime()) ? toDate.toISOString() : new Date().toISOString();

          // Time range delta calculation
          const deltaMs = fromDate && !isNaN(fromDate.getTime()) ? (toDate.getTime() - fromDate.getTime()) : 0;
          const deltaHours = deltaMs > 0 ? deltaMs / (1000 * 60 * 60) : 0;

          // Automated Resolution Selector:
          // Range <= 2 Hours -> Raw Telemetry
          // 2 Hours < Range <= 24 Hours -> 5m Bucket
          // 24 Hours < Range <= 30 Days (720h) -> Hourly Continuous Aggregate (telemetry_hourly_summary)
          // Range > 30 Days -> Daily Continuous Aggregate (telemetry_daily_summary)
          let selectedResolution = (resolutionParam || 'auto').toLowerCase().trim();
          if (selectedResolution === 'auto') {
            if (!validFrom) {
              selectedResolution = 'raw';
            } else if (deltaHours <= 2) {
              selectedResolution = 'raw';
            } else if (deltaHours <= 24) {
              selectedResolution = '5m';
            } else if (deltaHours <= 720) {
              selectedResolution = '1h';
            } else {
              selectedResolution = '1d';
            }
          }

          let sql = '';
          let tierSource = 'telemetry_readings (Raw)';

          if (selectedResolution === '1d') {
            tierSource = 'telemetry_daily_summary (Continuous Aggregate)';
            sql = `
              SELECT 
                bucket AS timestamp,
                device_id AS "deviceId",
                metric,
                ROUND(avg_val::numeric, 2)::float AS value,
                ROUND(min_val::numeric, 2)::float AS "minVal",
                ROUND(max_val::numeric, 2)::float AS "maxVal",
                reading_count::int AS count
              FROM telemetry_daily_summary
              WHERE device_id = ANY($1::text[])
                AND ($2::text IS NULL OR device_id = $2)
                AND ($3::text IS NULL OR metric = $3)
                AND ($4::timestamptz IS NULL OR bucket >= $4)
                AND ($5::timestamptz IS NULL OR bucket <= $5)
              ORDER BY bucket ASC
              LIMIT $6;
            `;
          } else if (selectedResolution === '1h') {
            tierSource = 'telemetry_hourly_summary (Continuous Aggregate)';
            sql = `
              SELECT 
                bucket AS timestamp,
                device_id AS "deviceId",
                metric,
                ROUND(avg_val::numeric, 2)::float AS value,
                ROUND(min_val::numeric, 2)::float AS "minVal",
                ROUND(max_val::numeric, 2)::float AS "maxVal",
                reading_count::int AS count
              FROM telemetry_hourly_summary
              WHERE device_id = ANY($1::text[])
                AND ($2::text IS NULL OR device_id = $2)
                AND ($3::text IS NULL OR metric = $3)
                AND ($4::timestamptz IS NULL OR bucket >= $4)
                AND ($5::timestamptz IS NULL OR bucket <= $5)
              ORDER BY bucket ASC
              LIMIT $6;
            `;
          } else if (selectedResolution === '5m' || selectedResolution === '15m') {
            const bucketInterval = selectedResolution === '15m' ? '15 minutes' : '5 minutes';
            tierSource = `telemetry_readings (Bucket: ${bucketInterval})`;
            sql = `
              SELECT 
                time_bucket('${bucketInterval}', created_at) AS timestamp,
                device_id AS "deviceId",
                metric,
                ROUND(AVG(metric_value)::numeric, 2)::float AS value,
                ROUND(MIN(metric_value)::numeric, 2)::float AS "minVal",
                ROUND(MAX(metric_value)::numeric, 2)::float AS "maxVal",
                COUNT(*)::int AS count
              FROM telemetry_readings
              WHERE device_id = ANY($1::text[])
                AND ($2::text IS NULL OR device_id = $2)
                AND ($3::text IS NULL OR metric = $3)
                AND ($4::timestamptz IS NULL OR created_at >= $4)
                AND ($5::timestamptz IS NULL OR created_at <= $5)
              GROUP BY timestamp, device_id, metric
              ORDER BY timestamp ASC
              LIMIT $6;
            `;
          } else {
            tierSource = 'telemetry_readings (Raw)';
            sql = `
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
                AND ($4::timestamptz IS NULL OR created_at >= $4)
                AND ($5::timestamptz IS NULL OR created_at <= $5)
              ORDER BY created_at ASC
              LIMIT $6;
            `;
          }

          let res;
          try {
            res = await pool.query(sql, [allowedDeviceIds, queryDev, queryMetric, validFrom, validTo, numLimit]);
          } catch (tierErr) {
            console.warn(`[Telemetry Tier Query Fallback] '${tierSource}' sorgusu başarısız (${tierErr}). Ham veriye geçiliyor.`);
            tierSource = 'telemetry_readings (Raw Fallback)';
            const fallbackSql = `
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
                AND ($4::timestamptz IS NULL OR created_at >= $4)
                AND ($5::timestamptz IS NULL OR created_at <= $5)
              ORDER BY created_at ASC
              LIMIT $6;
            `;
            res = await pool.query(fallbackSql, [allowedDeviceIds, queryDev, queryMetric, validFrom, validTo, numLimit]);
          }

          if (res.rows) {
            const mapped = res.rows.map((r: any) => ({
              id: r.id || `agg_${r.deviceId}_${r.metric}_${new Date(r.timestamp).getTime()}`,
              deviceId: r.deviceId,
              deviceName: r.deviceName || r.deviceId,
              metric: r.metric,
              value: Number(r.value),
              minVal: r.minVal !== undefined ? Number(r.minVal) : Number(r.value),
              maxVal: r.maxVal !== undefined ? Number(r.maxVal) : Number(r.value),
              count: r.count ? Number(r.count) : 1,
              unit: r.unit || 'birim',
              status: r.status || 'normal',
              timestamp: new Date(r.timestamp).toISOString(),
            }));

            // Attach query metadata property
            (mapped as any).meta = {
              resolution: selectedResolution,
              tierSource,
              from: validFrom,
              to: validTo,
              limit: numLimit,
              totalRecords: mapped.length,
            };

            return mapped;
          }
        }
      } catch (err: any) {
        console.warn(`[getTelemetryAsync Error]: ${err?.message || err}`);
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
