import fs from 'node:fs';
import path from 'node:path';
import { automationEngine } from '../services/automation.engine.js';
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
  bootId?: string;
  idempotencyKey?: string;
  timestamp: string;
  sequence?: number;
  readings: TelemetryReading[];
  attempts?: number;
  lastAttemptAt?: string;
}

export class TelemetryRepository {
  private physicalQueueFilePath = path.join(process.cwd(), 'data', 'wal', 'physical-telemetry.ndjson');
  private simulationQueueFilePath = path.join(process.cwd(), 'data', 'wal', 'simulation-telemetry.ndjson');
  private legacyQueueFilePath = path.join(process.cwd(), 'data', 'telemetry-retry.ndjson');

  private physicalRetryQueue: TelemetryPacket[] = [];
  private simulationRetryQueue: TelemetryPacket[] = [];
  private isFlushingPhysicalQueue = false;
  private isFlushingSimulationQueue = false;
  private retryWorkerTimer: NodeJS.Timeout | null = null;
  private readonly MAX_PHYSICAL_QUEUE_SIZE = 2000;
  private readonly PHYSICAL_QUEUE_WARN_THRESHOLD = 5000;
  private readonly MAX_SIMULATION_QUEUE_SIZE = 1000;
  private lastQueueAlarmAt = 0;
  private latestTelemetryCache: Record<string, Record<string, TelemetryReading>> = {};

  constructor(private db: any) {
    this.loadPersistentQueue();
    this.startRetryWorker();
  }

  // Load uncommitted retry packets from isolated durable NDJSON files on disk
  private loadPersistentQueue() {
    try {
      const walDir = path.join(process.cwd(), 'data', 'wal');
      if (!fs.existsSync(walDir)) {
        fs.mkdirSync(walDir, { recursive: true });
      }

      // 1. Load Physical WAL Queue (Strictly source === 'physical')
      if (fs.existsSync(this.physicalQueueFilePath)) {
        const content = fs.readFileSync(this.physicalQueueFilePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        const recentLines = lines.slice(-this.MAX_PHYSICAL_QUEUE_SIZE);
        let loadedPackets = 0;
        const totalPacketsInWal = lines.length;

        let loadedReadings = 0;
        for (const line of recentLines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed && Array.isArray(parsed.readings) && parsed.readings.length > 0) {
              const sanitizedReadings = parsed.readings.map((r: TelemetryReading) => ({
                ...r,
                source: 'physical' as const,
                environment: 'production' as const,
              }));
              this.physicalRetryQueue.push({
                ...parsed,
                readings: sanitizedReadings,
              });
              loadedPackets++;
              loadedReadings += sanitizedReadings.length;
            }
          } catch {
            // ignore malformed line
          }
        }
        if (loadedPackets > 0) {
          console.log(`[Physical WAL] Diskten ${loadedPackets} fiziksel paket (${loadedReadings} metrik kaydı) RAM'e yüklendi (WAL dosyasında toplam ${totalPacketsInWal} paket var).`);
        }
      }

      // 2. Load Simulation WAL Queue (Strictly source === 'simulator')
      if (fs.existsSync(this.simulationQueueFilePath)) {
        const content = fs.readFileSync(this.simulationQueueFilePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        const recentLines = lines.slice(-this.MAX_PHYSICAL_QUEUE_SIZE);
        let loadedPackets = 0;
        const totalPacketsInWal = lines.length;

        let loadedReadings = 0;
        for (const line of recentLines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed && Array.isArray(parsed.readings) && parsed.readings.length > 0) {
              const sanitizedReadings = parsed.readings.map((r: TelemetryReading) => ({
                ...r,
                source: 'simulator' as const,
                environment: 'sandbox' as const,
              }));
              this.simulationRetryQueue.push({
                ...parsed,
                readings: sanitizedReadings,
              });
              loadedPackets++;
              loadedReadings += sanitizedReadings.length;
            }
          } catch {
            // ignore malformed line
          }
        }
        if (loadedPackets > 0) {
          console.log(`[Simulation WAL] Diskten ${loadedPackets} simülasyon paketi (${loadedReadings} metrik kaydı) RAM'e yüklendi (WAL dosyasında toplam ${totalPacketsInWal} paket var).`);
        }
      }

      // 3. Migrate Legacy Single-Queue File (data/telemetry-retry.ndjson) if present
      if (fs.existsSync(this.legacyQueueFilePath)) {
        const legacyContent = fs.readFileSync(this.legacyQueueFilePath, 'utf8');
        const legacyLines = legacyContent.split('\n').filter((l) => l.trim().length > 0);
        let migratedPhysical = 0;
        let migratedSimulation = 0;

        for (const line of legacyLines) {
          try {
            const parsed = JSON.parse(line);
            let readings: TelemetryReading[] = [];
            if (Array.isArray(parsed.readings) && parsed.readings.length > 0) {
              readings = parsed.readings;
            } else if (parsed && parsed.deviceId && parsed.metric) {
              readings = [parsed as TelemetryReading];
            }

            if (readings.length > 0) {
              const first = readings[0];
              const isSim = first.source === 'simulator' || first.environment === 'sandbox';
              const packet: TelemetryPacket = {
                packetId: parsed.packetId || `pkt_migrated_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                deviceId: first.deviceId,
                timestamp: parsed.timestamp || first.timestamp || new Date().toISOString(),
                sequence: parsed.sequence ?? first.sequence,
                readings,
                attempts: parsed.attempts || 0,
                lastAttemptAt: parsed.lastAttemptAt || new Date().toISOString(),
              };

              if (isSim) {
                this.simulationRetryQueue.push(packet);
                migratedSimulation++;
              } else {
                this.physicalRetryQueue.push(packet);
                migratedPhysical++;
              }
            }
          } catch {
            // ignore
          }
        }

        if (migratedPhysical > 0 || migratedSimulation > 0) {
          console.log(`[WAL Migration] Eski kuyruktan ${migratedPhysical} fiziksel ve ${migratedSimulation} sanal paket başarıyla ayrıştırıldı.`);
          this.savePhysicalDiskQueue();
          this.saveSimulationDiskQueue();
        }
        // Clean legacy file after migration
        try {
          fs.writeFileSync(this.legacyQueueFilePath, '', 'utf8');
        } catch {}
      }
    } catch (err: any) {
      console.warn(`[Persistent WAL Load Error]: ${err?.message || err}`);
    }
  }

  // Trigger alarms when queue reaches warning or critical overflow levels
  private triggerQueueCapacityAlarm(level: 'WARN' | 'CRITICAL', currentSize: number, deviceId?: string) {
    const now = Date.now();
    // Throttle alarms to at most once per 60 seconds
    if (now - this.lastQueueAlarmAt < 60000) {
      return;
    }
    this.lastQueueAlarmAt = now;

    const isCritical = level === 'CRITICAL';
    const title = isCritical
      ? '🚨 [KRİTİK ALARM] Telemetri Retry Kuyruğu Kapasite Aşımı'
      : '⚠️ [UYARI] Telemetri Retry Kuyruğu Doluluk Uyarısı';
    const message = isCritical
      ? `Fiziksel telemetri kuyruğu maksimum limitine (${this.MAX_PHYSICAL_QUEUE_SIZE} paket) ulaştı! Eski paketler veri kaybını ve bellek taşmasını önlemek amacıyla arşivleniyor. Lütfen PostgreSQL/TimescaleDB bağlantısını acilen kontrol ediniz.`
      : `Fiziksel telemetri kuyruğu uyarı eşiğini (${this.PHYSICAL_QUEUE_WARN_THRESHOLD} paket, mevcut: ${currentSize}) aştı. Veritabanı bağlantısı gecikiyor olabilir.`;

    try {
      if (typeof this.db.addNotification === 'function') {
        this.db.addNotification({
          tenantId: 'usr_admin',
          title,
          message,
          severity: isCritical ? 'critical' : 'warning',
          deviceId: deviceId || 'system_queue',
          deviceName: 'Sistem Telemetri Kuyruk Yöneticisi',
          alarmState: 'TRIGGERED',
          source: 'physical',
          isSimulation: false,
          environment: 'production',
        });
      }
    } catch (err: any) {
      console.warn(`[Queue Alarm Dispatch Error]: ${err?.message || err}`);
    }
  }

  // Durable Disk-backed Packet Enqueue with Strict Isolation
  private enqueuePacketToRetryQueue(readings: TelemetryReading[]) {
    if (!readings || readings.length === 0) return;

    const first = readings[0];
    const sequence = first.sequence;
    const bootId = first.bootId || 'default';
    const idempotencyKey = first.idempotencyKey || (
      first.deviceId && sequence !== undefined && sequence !== null
        ? `${first.deviceId}:${bootId}:${sequence}`
        : undefined
    );
    const packetId =
      sequence !== undefined && sequence !== null
        ? `pkt_${first.deviceId}_boot_${bootId}_seq_${sequence}`
        : `pkt_${first.deviceId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Determine target queue based on source and device type
    const dev = (this.db.data.devices || []).find((d: Device) => d.id === first.deviceId);
    const isSimulated = dev?.isSimulated || first.source === 'simulator' || first.environment === 'sandbox';
    const saveSimulatedDataToDb = dev?.saveSimulatedDataToDb || false;

    if (isSimulated) {
      // If virtual device has saveSimulatedDataToDb disabled, it is ephemeral in RAM only
      if (!saveSimulatedDataToDb) {
        return;
      }

      // Enforce simulation metadata on all readings in packet
      const sanitizedReadings = readings.map((r) => ({
        ...r,
        bootId: r.bootId || bootId,
        idempotencyKey: r.idempotencyKey || idempotencyKey,
        source: 'simulator' as const,
        environment: 'sandbox' as const,
      }));

      const packet: TelemetryPacket = {
        packetId,
        deviceId: first.deviceId,
        bootId,
        idempotencyKey,
        timestamp: first.timestamp || new Date().toISOString(),
        sequence,
        readings: sanitizedReadings,
        attempts: 0,
        lastAttemptAt: new Date().toISOString(),
      };

      // Ephemeral short-lived queue: limit size
      if (this.simulationRetryQueue.length >= this.MAX_SIMULATION_QUEUE_SIZE) {
        this.simulationRetryQueue.shift(); // Evict oldest
      }
      this.simulationRetryQueue.push(packet);

      try {
        const walDir = path.dirname(this.simulationQueueFilePath);
        if (!fs.existsSync(walDir)) {
          fs.mkdirSync(walDir, { recursive: true });
        }
        fs.appendFileSync(this.simulationQueueFilePath, JSON.stringify(packet) + '\n', 'utf8');
        console.warn(`[Simulation WAL] Simülasyon paketi izole test WAL sırasına kilitlendi (Paket ID: ${packetId}, Cihaz: ${packet.deviceId}, Metrik Sayısı: ${readings.length}).`);
      } catch (err: any) {
        console.warn(`[Simulation Queue Append Error]: ${err?.message || err}`);
      }
    } else {
      // Physical production pipeline: strictly enforce source='physical' and environment='production'
      const sanitizedReadings = readings.map((r) => ({
        ...r,
        bootId: r.bootId || bootId,
        idempotencyKey: r.idempotencyKey || idempotencyKey,
        source: 'physical' as const,
        environment: 'production' as const,
      }));

      const packet: TelemetryPacket = {
        packetId,
        deviceId: first.deviceId,
        bootId,
        idempotencyKey,
        timestamp: first.timestamp || new Date().toISOString(),
        sequence,
        readings: sanitizedReadings,
        attempts: 0,
        lastAttemptAt: new Date().toISOString(),
      };

      // Check physical queue capacity limit & alarms
      if (this.physicalRetryQueue.length >= this.MAX_PHYSICAL_QUEUE_SIZE) {
        const evicted = this.physicalRetryQueue.shift(); // Protect memory from OOM
        this.triggerQueueCapacityAlarm('CRITICAL', this.physicalRetryQueue.length, evicted?.deviceId);
      } else if (this.physicalRetryQueue.length >= this.PHYSICAL_QUEUE_WARN_THRESHOLD) {
        this.triggerQueueCapacityAlarm('WARN', this.physicalRetryQueue.length, first.deviceId);
      }

      this.physicalRetryQueue.push(packet);

      try {
        const walDir = path.dirname(this.physicalQueueFilePath);
        if (!fs.existsSync(walDir)) {
          fs.mkdirSync(walDir, { recursive: true });
        }
        fs.appendFileSync(this.physicalQueueFilePath, JSON.stringify(packet) + '\n', 'utf8');
        console.warn(`[Persistent Physical WAL] Fiziksel üretim paketi WAL sırasına kilitlendi (Paket ID: ${packetId}, Cihaz: ${packet.deviceId}, Metrik Sayısı: ${readings.length}).`);
      } catch (err: any) {
        console.warn(`[Physical Queue Append Error]: ${err?.message || err}`);
      }
    }
  }

  // Legacy fallback wrapper
  private enqueueToRetryQueue(reading: TelemetryReading) {
    this.enqueuePacketToRetryQueue([reading]);
  }

  // Synchronize remaining physical packets to disk atomically
  private savePhysicalDiskQueue() {
    // Disk queue is now append-only from enqueue and flushed via batch reading in flushPhysicalRetryQueue
  }

  // Synchronize remaining simulation packets to disk atomically
  private saveSimulationDiskQueue() {
    // Disk queue is now append-only
  }

  // Auto-retry worker runs every 5 seconds to flush pending telemetry packets atomically
  private startRetryWorker() {
    if (this.retryWorkerTimer) return;
    this.retryWorkerTimer = setInterval(() => {
      this.flushRetryQueue().catch(() => {});
    }, 5000);
  }

public async flushPhysicalRetryQueue(): Promise<{
    flushedPacketCount: number;
    flushedReadingCount: number;
    remainingPacketCount: number;
    remainingReadingCount: number;
  }> {
    if (this.isFlushingPhysicalQueue || !this.db.postgresRepo?.isReady()) {
      return {
        flushedPacketCount: 0,
        flushedReadingCount: 0,
        remainingPacketCount: this.physicalRetryQueue.length,
        remainingReadingCount: this.physicalRetryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0),
      };
    }
    
    this.isFlushingPhysicalQueue = true;
    let flushedPacketCount = 0;
    let flushedReadingCount = 0;
    let remainingPacketCount = 0;
    let remainingReadingCount = 0;

    try {
      const processingFile = `${this.physicalQueueFilePath}.processing`;
      
      // Move current WAL to processing
      if (!fs.existsSync(processingFile) && fs.existsSync(this.physicalQueueFilePath)) {
         fs.renameSync(this.physicalQueueFilePath, processingFile);
      }

      if (fs.existsSync(processingFile)) {
        const content = fs.readFileSync(processingFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        const failedLines: string[] = [];
        
        for (const line of lines) {
           try {
              const packet = JSON.parse(line);
              const txRes = await this.db.postgresRepo.savePhysicalTelemetryBatchInTransaction(packet.readings);
              if (txRes && (txRes.rowCount !== undefined ? txRes.rowCount >= 0 : true)) {
                 flushedPacketCount++;
                 flushedReadingCount += packet.readings.length;
              } else {
                 packet.attempts = (packet.attempts || 0) + 1;
                 packet.lastAttemptAt = new Date().toISOString();
                 failedLines.push(JSON.stringify(packet));
                 remainingPacketCount++;
                 remainingReadingCount += packet.readings.length;
              }
           } catch (err) {
              failedLines.push(line);
           }
        }
        
        if (failedLines.length > 0) {
           // Put failed lines back to active WAL
           fs.appendFileSync(this.physicalQueueFilePath, failedLines.join('\n') + '\n', 'utf8');
        }
        fs.unlinkSync(processingFile);
        
        // Update RAM buffer
        this.physicalRetryQueue = failedLines.map(l => {
           try { return JSON.parse(l); } catch(e) { return null; }
        }).filter(Boolean).slice(-this.MAX_PHYSICAL_QUEUE_SIZE);
        
        if (flushedPacketCount > 0) {
           console.log(`[Physical Telemetry WAL Flush] ${flushedPacketCount} paket DB'ye aktarıldı, ${remainingPacketCount} paket retry'a döndü.`);
        }
      }
    } catch (err: any) {
      console.warn(`[Physical WAL Flush Error]: ${err?.message || err}`);
    } finally {
      this.isFlushingPhysicalQueue = false;
    }

    return {
      flushedPacketCount,
      flushedReadingCount,
      remainingPacketCount,
      remainingReadingCount,
    };
  }

  public async flushSimulationRetryQueue(): Promise<{
    flushedPacketCount: number;
    flushedReadingCount: number;
    remainingPacketCount: number;
    remainingReadingCount: number;
  }> {
    const initialRemainingReadings = this.simulationRetryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);
    if (this.isFlushingSimulationQueue || this.simulationRetryQueue.length === 0 || !this.db.postgresRepo?.isReady()) {
      return {
        flushedPacketCount: 0,
        flushedReadingCount: 0,
        remainingPacketCount: this.simulationRetryQueue.length,
        remainingReadingCount: initialRemainingReadings,
      };
    }

    this.isFlushingSimulationQueue = true;
    let flushedPacketCount = 0;
    let flushedReadingCount = 0;
    const packetsToFlush = [...this.simulationRetryQueue];
    this.simulationRetryQueue = [];
    const failedPackets: TelemetryPacket[] = [];

    try {
      for (const packet of packetsToFlush) {
        try {
          // Strictly insert into simulation hypertable (simulation_telemetry_readings)
          const txRes = await this.db.postgresRepo.saveSimulationTelemetryBatchInTransaction(packet.readings);
          if (txRes && (txRes.rowCount !== undefined ? txRes.rowCount >= 0 : true)) {
            flushedPacketCount++;
            flushedReadingCount += packet.readings.length;
          } else {
            packet.attempts = (packet.attempts || 0) + 1;
            packet.lastAttemptAt = new Date().toISOString();
            failedPackets.push(packet);
          }
        } catch (err: any) {
          console.warn(`[Simulation Telemetry Retry Warning] Paket (${packet.packetId}) simülasyon tablosuna yazılamadı: ${err?.message || err}. Tekrar sıraya alındı.`);
          packet.attempts = (packet.attempts || 0) + 1;
          packet.lastAttemptAt = new Date().toISOString();
          failedPackets.push(packet);
        }
      }

      if (failedPackets.length > 0) {
        this.simulationRetryQueue.unshift(...failedPackets);
      }

      if (flushedPacketCount > 0) {
        console.log(`[Simulation Telemetry Persistence] ${flushedPacketCount} adet simülasyon paketi (${flushedReadingCount} metrik kaydı) simulation_telemetry_readings hypertable'ına aktarıldı.`);
      }

      this.saveSimulationDiskQueue();
    } catch (err: any) {
      console.warn(`[Simulation Telemetry Global Retry Error]: ${err?.message || err}`);
      if (packetsToFlush.length > 0) {
        this.simulationRetryQueue.unshift(...packetsToFlush);
        this.saveSimulationDiskQueue();
      }
    } finally {
      this.isFlushingSimulationQueue = false;
    }

    const currentRemainingReadings = this.simulationRetryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);
    return {
      flushedPacketCount,
      flushedReadingCount,
      remainingPacketCount: this.simulationRetryQueue.length,
      remainingReadingCount: currentRemainingReadings,
    };
  }

  public async flushRetryQueue(): Promise<{
    flushedPacketCount: number;
    flushedReadingCount: number;
    remainingPacketCount: number;
    remainingReadingCount: number;
    flushedCount: number;
    remainingCount: number;
    physical: {
      flushedPacketCount: number;
      flushedReadingCount: number;
      remainingPacketCount: number;
      remainingReadingCount: number;
    };
    simulation: {
      flushedPacketCount: number;
      flushedReadingCount: number;
      remainingPacketCount: number;
      remainingReadingCount: number;
    };
  }> {
    const physRes = await this.flushPhysicalRetryQueue();
    const simRes = await this.flushSimulationRetryQueue();

    const flushedPacketCount = physRes.flushedPacketCount + simRes.flushedPacketCount;
    const flushedReadingCount = physRes.flushedReadingCount + simRes.flushedReadingCount;
    const remainingPacketCount = physRes.remainingPacketCount + simRes.remainingPacketCount;
    const remainingReadingCount = physRes.remainingReadingCount + simRes.remainingReadingCount;

    return {
      flushedPacketCount,
      flushedReadingCount,
      remainingPacketCount,
      remainingReadingCount,
      flushedCount: flushedReadingCount,
      remainingCount: remainingReadingCount,
      physical: physRes,
      simulation: simRes,
    };
  }

  public getRetryQueueStats() {
    let physicalDiskSizeBytes = 0;
    let simulationDiskSizeBytes = 0;
    try {
      if (fs.existsSync(this.physicalQueueFilePath)) {
        physicalDiskSizeBytes = fs.statSync(this.physicalQueueFilePath).size;
      }
    } catch {}
    try {
      if (fs.existsSync(this.simulationQueueFilePath)) {
        simulationDiskSizeBytes = fs.statSync(this.simulationQueueFilePath).size;
      }
    } catch {}

    const physicalReadings = this.physicalRetryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);
    const simulationReadings = this.simulationRetryQueue.reduce((acc, p) => acc + (p.readings?.length || 0), 0);
    const totalReadings = physicalReadings + simulationReadings;
    const totalPackets = this.physicalRetryQueue.length + this.simulationRetryQueue.length;

    return {
      physical: {
        pendingPacketCount: this.physicalRetryQueue.length,
        pendingReadingCount: physicalReadings,
        filePath: this.physicalQueueFilePath,
        diskSizeBytes: physicalDiskSizeBytes,
        durable: true,
        acceptedSource: 'physical (Fiziksel Üretim Hypertable)',
      },
      simulation: {
        pendingPacketCount: this.simulationRetryQueue.length,
        pendingReadingCount: simulationReadings,
        filePath: this.simulationQueueFilePath,
        diskSizeBytes: simulationDiskSizeBytes,
        durable: false,
        acceptedSource: 'simulator (Sanal Test Hypertable - Kısa Ömürlü/Ephemeral)',
      },
      pendingPacketCount: totalPackets,
      pendingReadingCount: totalReadings,
      pendingRetryCount: totalReadings,
      isFlushing: this.isFlushingPhysicalQueue || this.isFlushingSimulationQueue,
      persistentQueuePath: this.physicalQueueFilePath,
      diskSizeBytes: physicalDiskSizeBytes + simulationDiskSizeBytes,
      durable: true,
      model: 'Isolated Two-Queue WAL (physical-telemetry.ndjson & simulation-telemetry.ndjson)',
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
    const firstReadingInput = readings[0];
    const devLookup = firstReadingInput ? (this.db.data.devices || []).find((d: Device) => d.id === firstReadingInput.deviceId) : null;
    const isDevSim = devLookup?.isSimulated || false;

    const fullReadings: TelemetryReading[] = readings.map((r, i) => {
      const dev = devLookup || (this.db.data.devices || []).find((d: Device) => d.id === r.deviceId);
      const tenantId = r.tenantId || r.customerId || dev?.tenantId || '';
      const customerId = r.customerId || r.tenantId || dev?.tenantId || '';
      const userId = r.userId || r.tenantId || dev?.tenantId || '';
      const bootId = r.bootId || 'default';
      const idempotencyKey = r.idempotencyKey || (
        r.deviceId && r.sequence !== undefined && r.sequence !== null
          ? `${r.deviceId}:${bootId}:${r.sequence}`
          : undefined
      );

      const id =
        r.sequence !== undefined && r.sequence !== null
          ? `tel_${r.deviceId}_boot_${bootId}_seq_${r.sequence}_${r.metric}`
          : `tel_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

      return {
        ...r,
        id,
        tenantId,
        customerId,
        userId,
        bootId,
        idempotencyKey,
        timestamp,
        source: r.source || (isDevSim ? 'simulator' : 'physical'),
        environment: r.environment || (isDevSim ? 'sandbox' : 'production'),
        simulationRunId: r.simulationRunId,
      };
    });

    const firstReading = fullReadings[0];
    const device = devLookup || (this.db.data.devices || []).find((d: Device) => d.id === firstReading.deviceId);

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
        engine = 'PostgreSQL WAL Retry Queue (Paket Sırada / Otomatik Tekrar Denenecek)';
        persisted = false;
        queuedForRetry = true;
      }
    } else if (isSimulated && !saveSimulatedDataToDb) {
      persisted = true;
      engine = 'RAM / Sanal Filtre (Veritabanına Yazılmıyor)';
    } else if (!isSimulated || activeEngine === 'postgres' || activeEngine === 'timescaledb') {
      // Production physical telemetry is strictly queued to durable WAL when DB is not ready
      this.enqueuePacketToRetryQueue(fullReadings);
      engine = 'PostgreSQL WAL Retry Queue (PostgreSQL Bağlantısı Bekleniyor)';
      persisted = false;
      queuedForRetry = true;
      errorMsg = 'PostgreSQL veritabanı hazır değil, fiziksel telemetri diske dayanıklı WAL sırasına alındı';
    } else {
      // Standalone RAM mode for ephemeral simulator items
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
    for (const r of fullReadings) {
      if (!this.latestTelemetryCache[r.deviceId]) this.latestTelemetryCache[r.deviceId] = {};
      this.latestTelemetryCache[r.deviceId][r.metric] = r;
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
        if (r.source === 'physical') {
          this.evaluateProductionRules(r, device);
        } else {
          this.evaluateSimulationRules(r, device);
        }
        
        // Evaluate Automations for both physical and simulated telemetry
        automationEngine.evaluateAutomations(r);
      }

      device.updatedAt = timestamp;
      device.version = (device.version || 1) + 1;
    }

    if (!this.db.isPostgresProductionMode()) this.db.scheduleSave();

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
    const dev = (this.db.data.devices || []).find((d: Device) => d.id === reading.deviceId);
    const isDevSim = dev?.isSimulated || false;
    const tenantId = reading.tenantId || reading.customerId || dev?.tenantId || '';
    const customerId = reading.customerId || reading.tenantId || dev?.tenantId || '';
    const userId = reading.userId || reading.tenantId || dev?.tenantId || '';

    const fullReading: TelemetryReading = {
      ...reading,
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      customerId,
      userId,
      timestamp: new Date().toISOString(),
      source: reading.source || (isDevSim ? 'simulator' : 'physical'),
      environment: reading.environment || (isDevSim ? 'sandbox' : 'production'),
      simulationRunId: reading.simulationRunId,
    };

    if (!this.latestTelemetryCache[fullReading.deviceId]) this.latestTelemetryCache[fullReading.deviceId] = {};
    this.latestTelemetryCache[fullReading.deviceId][fullReading.metric] = fullReading;

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

    // Check threshold rules for notification trigger (strictly separated engines)
    if (fullReading.source === 'physical') {
      this.evaluateProductionRules(fullReading, device);
    } else {
      this.evaluateSimulationRules(fullReading, device);
    }

    automationEngine.evaluateAutomations(fullReading);

    if (!this.db.isPostgresProductionMode()) {
      if (!this.db.isPostgresProductionMode()) this.db.scheduleSave();
    }
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

    let currentSize = 0;
    for (const devMetrics of Object.values(this.latestTelemetryCache)) {
      currentSize += Object.keys(devMetrics).length;
    }

    return {
      rawBufferCurrentSize: currentSize,
      rawBufferMaxSize: this.RAW_TELEMETRY_MAX_BUFFER,
      bufferUtilizationPercent: 0,
      timeSeriesAggregatedBuckets: totalAggregatedBuckets,
      persistentQueue: this.getRetryQueueStats(),
      retentionPolicy: {
        rawBuffer: '10,000 Son Canlı Veri Noktası (Kayar Halka Tampon)',
        hourlyRollup: '168 Saat (7 Gün Saatlik Ortalama)',
        dailyRollup: '365 Gün (1 Yıl Günlük Ortalama)',
        monthlyRollup: '60 Ay (5 Yıl Aylık Ortalama)',
        postgresArchive: 'PostgreSQL / TimescaleDB (Sıkıştırılmış İki Ayrı Hypertable)',
        persistentQueue: 'İzole WAL Kuyrukları (data/wal/physical-telemetry.ndjson & data/wal/simulation-telemetry.ndjson)',
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
    if (!this.db.postgresRepo?.isReady()) {
      return this.getHistory(deviceId, metric);
    }
    const pool = this.db.postgresRepo.getPool();
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
    let list: TelemetryReading[] = [];
    for (const devMetrics of Object.values(this.latestTelemetryCache)) {
      list.push(...Object.values(devMetrics));
    }
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
    if (this.db.postgresRepo?.isReady()) {
      const pool = this.db.postgresRepo.getPool();
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

            const effectiveUser = requestingUserId || 'usr_admin';
            const isAdmin = effectiveUser === 'usr_admin';
            const effectiveTenant = targetCustomerId || (!isAdmin ? effectiveUser : null);

            const queryDevObj = queryDev ? (this.db.data.devices || []).find((d: Device) => d.id === queryDev) : null;
            const isSimulatedQuery = queryDevObj ? queryDevObj.isSimulated : false;
            const rawTable = queryDev
              ? (isSimulatedQuery ? 'simulation_telemetry_readings' : 'telemetry_readings')
              : `(SELECT id, packet_id, tenant_id, customer_id, user_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, source, environment, simulation_run_id, created_at FROM telemetry_readings UNION ALL SELECT id, packet_id, tenant_id, customer_id, user_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, source, environment, simulation_run_id, created_at FROM simulation_telemetry_readings) AS combined_telemetry`;

            // Automated Resolution Selector:
            // Range <= 2 Hours -> Raw Telemetry
            // 2 Hours < Range <= 24 Hours -> 5m Bucket
            // 24 Hours < Range <= 30 Days (720h) -> Hourly Continuous Aggregate (telemetry_hourly_summary)
            // Range > 30 Days -> Daily Continuous Aggregate (telemetry_daily_summary)
            let selectedResolution = (resolutionParam || 'auto').toLowerCase().trim();
            if (selectedResolution === 'auto') {
              if (!validFrom || isSimulatedQuery) {
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
            let tierSource = `${rawTable} (Raw)`;

            if (!isSimulatedQuery && selectedResolution === '1d') {
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
                WHERE (device_id = ANY($1::text[]) OR ($7::text IS NOT NULL AND device_id IN (SELECT id FROM devices WHERE user_id = $7)))
                  AND ($2::text IS NULL OR device_id = $2)
                  AND ($3::text IS NULL OR metric = $3)
                  AND ($4::timestamptz IS NULL OR bucket >= $4)
                  AND ($5::timestamptz IS NULL OR bucket <= $5)
                ORDER BY bucket ASC
                LIMIT $6;
              `;
            } else if (!isSimulatedQuery && selectedResolution === '1h') {
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
                WHERE (device_id = ANY($1::text[]) OR ($7::text IS NOT NULL AND device_id IN (SELECT id FROM devices WHERE user_id = $7)))
                  AND ($2::text IS NULL OR device_id = $2)
                  AND ($3::text IS NULL OR metric = $3)
                  AND ($4::timestamptz IS NULL OR bucket >= $4)
                  AND ($5::timestamptz IS NULL OR bucket <= $5)
                ORDER BY bucket ASC
                LIMIT $6;
              `;
            } else if (selectedResolution === '5m' || selectedResolution === '15m') {
              const bucketInterval = selectedResolution === '15m' ? '15 minutes' : '5 minutes';
              tierSource = `${rawTable} (Bucket: ${bucketInterval})`;
              sql = `
                SELECT 
                  time_bucket('${bucketInterval}', created_at) AS timestamp,
                  device_id AS "deviceId",
                  metric,
                  ROUND(AVG(metric_value)::numeric, 2)::float AS value,
                  ROUND(MIN(metric_value)::numeric, 2)::float AS "minVal",
                  ROUND(MAX(metric_value)::numeric, 2)::float AS "maxVal",
                  COUNT(*)::int AS count
                FROM ${rawTable}
                WHERE (
                  device_id = ANY($1::text[]) 
                  OR ($7::text IS NOT NULL AND (tenant_id = $7 OR customer_id = $7 OR user_id = $7))
                )
                  AND ($2::text IS NULL OR device_id = $2)
                  AND ($3::text IS NULL OR metric = $3)
                  AND ($4::timestamptz IS NULL OR created_at >= $4)
                  AND ($5::timestamptz IS NULL OR created_at <= $5)
                GROUP BY timestamp, device_id, metric
                ORDER BY timestamp ASC
                LIMIT $6;
              `;
            } else {
              tierSource = `${rawTable} (Raw)`;
              sql = `
                SELECT 
                  id,
                  packet_id AS "packetId",
                  tenant_id AS "tenantId",
                  customer_id AS "customerId",
                  user_id AS "userId",
                  device_id AS "deviceId",
                  device_name AS "deviceName",
                  metric,
                  metric_value AS value,
                  unit,
                  status_level AS status,
                  sequence,
                  source,
                  environment,
                  simulation_run_id AS "simulationRunId",
                  created_at AS timestamp
                FROM ${rawTable}
                WHERE (
                  device_id = ANY($1::text[]) 
                  OR ($7::text IS NOT NULL AND (tenant_id = $7 OR customer_id = $7 OR user_id = $7))
                )
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
              res = await pool.query(sql, [allowedDeviceIds, queryDev, queryMetric, validFrom, validTo, numLimit, effectiveTenant]);
            } catch (tierErr: any) {
              const errStr = tierErr?.message || String(tierErr);
              const isConnError =
                errStr.includes('timeout') ||
                errStr.includes('Connection terminated') ||
                errStr.includes('ECONNREFUSED') ||
                errStr.includes('ETIMEDOUT') ||
                errStr.includes('57P01') ||
                errStr.includes('08006') ||
                errStr.includes('Connection closed');

              if (isConnError) {
                this.db.postgresRepo?.setConnected(false);
                return this.getTelemetry(deviceId, metric, limit, requestingUserId, targetCustomerId);
              }

              // Trigger background migration if column missing
              if (errStr.includes('column') || errStr.includes('does not exist')) {
                this.db.postgresRepo?.ensureTelemetrySchema().catch(() => {});
              }

              // Resilient fallback query
              const safeRawTable = queryDev
                ? (isSimulatedQuery ? 'simulation_telemetry_readings' : 'telemetry_readings')
                : `(SELECT id, packet_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, source, environment, simulation_run_id, created_at FROM telemetry_readings UNION ALL SELECT id, packet_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, source, environment, simulation_run_id, created_at FROM simulation_telemetry_readings) AS legacy_combined_telemetry`;

              const fallbackSql = `
                SELECT 
                  id,
                  packet_id AS "packetId",
                  device_id AS "deviceId",
                  device_name AS "deviceName",
                  metric,
                  metric_value AS value,
                  unit,
                  status_level AS status,
                  sequence,
                  source,
                  environment,
                  simulation_run_id AS "simulationRunId",
                  created_at AS timestamp
                FROM ${safeRawTable}
                WHERE device_id = ANY($1::text[])
                  AND ($2::text IS NULL OR device_id = $2)
                  AND ($3::text IS NULL OR metric = $3)
                  AND ($4::timestamptz IS NULL OR created_at >= $4)
                  AND ($5::timestamptz IS NULL OR created_at <= $5)
                ORDER BY created_at ASC
                LIMIT $6;
              `;
              try {
                res = await pool.query(fallbackSql, [allowedDeviceIds, queryDev, queryMetric, validFrom, validTo, numLimit]);
              } catch (fallbackErr: any) {
                const fbErrStr = fallbackErr?.message || String(fallbackErr);
                if (
                  fbErrStr.includes('timeout') ||
                  fbErrStr.includes('Connection terminated') ||
                  fbErrStr.includes('ECONNREFUSED') ||
                  fbErrStr.includes('ETIMEDOUT')
                ) {
                  this.db.postgresRepo?.setConnected(false);
                }
                return this.getTelemetry(deviceId, metric, limit, requestingUserId, targetCustomerId);
              }
            }

            if (res && res.rows) {
              const mapped = res.rows.map((r: any) => ({
                id: r.id || `agg_${r.deviceId}_${r.metric}_${new Date(r.timestamp).getTime()}`,
                packetId: r.packetId || undefined,
                tenantId: r.tenantId || "",
                deviceId: r.deviceId,
                deviceName: r.deviceName || r.deviceId,
                metric: r.metric,
                value: Number(r.value),
                minVal: r.minVal !== undefined ? Number(r.minVal) : Number(r.value),
                maxVal: r.maxVal !== undefined ? Number(r.maxVal) : Number(r.value),
                count: r.count ? Number(r.count) : 1,
                unit: r.unit || 'birim',
                status: r.status || 'normal',
                sequence: r.sequence !== null && r.sequence !== undefined ? Number(r.sequence) : undefined,
                source: (r.source as any) || 'physical',
                environment: (r.environment as any) || 'production',
                simulationRunId: r.simulationRunId || undefined,
                timestamp: new Date(r.timestamp).toISOString(),
              }));

              // Seamlessly merge in-memory RAM readings (e.g. sandbox/simulated readings not persisted to DB)
              const ramReadings = this.getTelemetry(deviceId, metric, numLimit, requestingUserId, targetCustomerId);
              const mergedMap = new Map<string, any>();
              for (const dbItem of mapped) {
                if (dbItem && dbItem.id) mergedMap.set(dbItem.id, dbItem);
              }
              for (const ramItem of ramReadings) {
                if (ramItem && ramItem.id && !mergedMap.has(ramItem.id)) {
                  mergedMap.set(ramItem.id, ramItem);
                }
              }
              const finalCombined = Array.from(mergedMap.values());
              finalCombined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              const slicedResult = finalCombined.slice(-numLimit);

              // Attach query metadata property
              (slicedResult as any).meta = {
                resolution: selectedResolution,
                tierSource,
                from: validFrom,
                to: validTo,
                limit: numLimit,
                totalRecords: slicedResult.length,
              };

              return slicedResult;
            }
          }
        } catch (err: any) {
          console.warn(`[getTelemetryAsync Error]: ${err?.message || err}`);
        }
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

    const isSimulated = alarm.isSimulation || alarm.source === 'simulator';
    const dev = (this.db.data.devices || []).find((d: Device) => d.id === alarm.deviceId);
    const saveSimulatedDataToDb = dev?.saveSimulatedDataToDb || false;

    // Sync to PostgreSQL Repository ONLY if real physical device OR if saveSimulatedDataToDb is true
    if (!isSimulated || saveSimulatedDataToDb) {
      this.db.postgresRepo?.saveAlarm(alarm).catch(() => {});
    }
  }

  private updateActiveNotificationDeduplicated(alarm: ActiveAlarm) {
    const matchingNotifs = (this.db.data.notifications || []).filter(
      (n: any) => n.alarmId === alarm.id && n.alarmState !== 'RESOLVED' && !n.read
    );
    for (const notif of matchingNotifs) {
      notif.message = `${alarm.message} (Ölçüm #${alarm.repeatCount}, Anlık: ${alarm.currentValue})`;
      notif.repeatCount = alarm.repeatCount;
      notif.currentValue = alarm.currentValue;
      notif.timestamp = new Date().toISOString();
      notif.updatedAt = notif.timestamp;
      notif.version = (notif.version || 1) + 1;
      this.db.notifyNotificationListeners('notification:new', notif);
    }
  }

  public emitAlarmEvent(
    alarm: ActiveAlarm,
    eventType: import('../../types.js').AlarmEvent['eventType'],
    message: string,
    triggeredBy?: string
  ) {
    if (!this.db.data.alarmEvents) {
      this.db.data.alarmEvents = [];
    }

    const event: import('../../types.js').AlarmEvent = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
      incidentId: alarm.incidentId || alarm.id,
      alarmId: alarm.id,
      ruleId: alarm.ruleId,
      deviceId: alarm.deviceId,
      tenantId: alarm.tenantId,
      eventType,
      message,
      createdAt: new Date().toISOString(),
      triggeredBy,
    };

    this.db.data.alarmEvents.push(event);

    // Keep event log at a reasonable size, limit to last 10000 events
    if (this.db.data.alarmEvents.length > 500) {
      this.db.data.alarmEvents = this.db.data.alarmEvents.slice(-500);
    }
  }

  public emitAlarmNotification(
    alarm: ActiveAlarm,
    eventType: 'OPEN' | 'RESOLVED' | 'REPEAT' | 'ACKNOWLEDGED' | 'SILENCED',
    title: string,
    customMsg?: string,
    triggeredBy?: string
  ) {
    const isSimulated = alarm.isSimulation || alarm.source === 'simulator';
    const msg = customMsg || `${alarm.message} (Eşik: ${alarm.thresholdValue}, Ölçülen: ${alarm.currentValue})`;

    const formattedTitle = isSimulated
      ? (title.startsWith('🧪') ? title : `🧪 [TEST ALARMI] ${title}`)
      : title;

    let historyEventType: import('../../types.js').AlarmEvent['eventType'] = 'OPENED';
    if (eventType === 'RESOLVED') historyEventType = 'RESOLVED';
    if (eventType === 'REPEAT') historyEventType = 'REPEATED';
    if (eventType === 'ACKNOWLEDGED') historyEventType = 'ACKNOWLEDGED';
    if (eventType === 'SILENCED') historyEventType = 'SILENCED';

    this.emitAlarmEvent(alarm, historyEventType, msg, triggeredBy);

    if (eventType === 'SILENCED') {
      return; // Silencing shouldn't create a visual notification box, just history
    }

    this.db.addNotification({
      tenantId: alarm.tenantId,
      title: formattedTitle,
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
      source: alarm.source || (isSimulated ? 'simulator' : 'physical'),
      isSimulation: isSimulated,
      environment: alarm.environment || (isSimulated ? 'sandbox' : 'production'),
    });

    if (alarm.tenantId !== 'usr_admin') {
      this.db.addNotification({
        tenantId: 'usr_admin',
        title: isSimulated
          ? (title.startsWith('🧪') ? title : `🧪 [TEST ALARMI] [${alarm.deviceName}] ${title}`)
          : `[${alarm.deviceName}] ${title}`,
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
        source: alarm.source || (isSimulated ? 'simulator' : 'physical'),
        isSimulation: isSimulated,
        environment: alarm.environment || (isSimulated ? 'sandbox' : 'production'),
      });
    }

    // STRICT ISOLATION RULE:
    // If the alarm is generated from simulation / test reading, outbound notification channels
    // (WhatsApp, Telegram, Email, SMS, Webhook) are COMPLETELY DISABLED!
    // Only internal in-panel 'app' feed is generated.
    if (!isSimulated) {
      this.enqueueExternalNotification(alarm, eventType, title, msg);
    }
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

    // Safety check: Never enqueue simulation alarms to real external dispatch queue
    if (alarm.isSimulation || alarm.source === 'simulator') {
      console.log(`[Notification Engine] Simulation alarm (${alarm.id}) external dispatch blocked.`);
      return;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === alarm.tenantId);

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
          tenantId: alarm.tenantId,
          userName: user?.name || alarm.tenantId,
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

  // Unified Rule Dispatcher
  public evaluateRules(reading: TelemetryReading, device?: Device) {
    if (reading.source === 'physical') {
      this.evaluateProductionRules(reading, device);
    } else {
      this.evaluateSimulationRules(reading, device);
    }
  }

  // 1. Production Rule Evaluation Engine (Fiziksel Saha Cihazları)
  public evaluateProductionRules(reading: TelemetryReading, device?: Device) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];

    const rules = (this.db.data.rules || []).filter(
      (r: ThresholdRule) =>
        r.enabled &&
        (r.deviceId === 'all' || r.deviceId === reading.deviceId) &&
        r.metricKey === reading.metric
    );

    const deviceOwnerId = device ? device.tenantId : 'usr_admin';
    const nowIso = reading.timestamp || new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    for (const rule of rules) {
      // Strict Tenant Rule Evaluation Check
      if (rule.tenantId && rule.tenantId !== 'usr_admin') {
        if (deviceOwnerId !== rule.tenantId) continue;
      }
      if (rule.tenantId === 'usr_admin' && rule.deviceId === 'all' && deviceOwnerId !== 'usr_admin') {
        continue;
      }
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
          let currentMinutes: number;
          const tz = rule.timezone || 'Europe/Istanbul';
          try {
            const trParts = new Intl.DateTimeFormat('en-GB', {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).formatToParts(new Date(nowIso));
            const h = parseInt(trParts.find((p) => p.type === 'hour')?.value || '0', 10);
            const m = parseInt(trParts.find((p) => p.type === 'minute')?.value || '0', 10);
            currentMinutes = h * 60 + m;
          } catch {
            const now = new Date(nowIso);
            currentMinutes = now.getHours() * 60 + now.getMinutes();
          }

          const [startH, startM] = startStr.split(':').map(Number);
          const [endH, endM] = endStr.split(':').map(Number);
          const startMinutes = (startH || 0) * 60 + (startM || 0);
          const endMinutes = (endH || 0) * 60 + (endM || 0);

          if (startMinutes < endMinutes) {
            if (currentMinutes < startMinutes || currentMinutes > endMinutes) continue;
          } else if (startMinutes > endMinutes) {
            if (currentMinutes < startMinutes && currentMinutes >= endMinutes) continue;
          }
        }
      }

      const alarmKey = `alarm_${rule.id}_${reading.deviceId}_${reading.metric}`;

      if (rule.disabledUntil && new Date(rule.disabledUntil).getTime() > nowMs) {
        continue;
      }

      let existingAlarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);

      // Out-of-order protection: If reading timestamp is strictly older than existing alarm's last update, skip degradation
      const readingTimestampMs = new Date(reading.timestamp || nowIso).getTime();
      if (existingAlarm && existingAlarm.lastEvaluatedAt) {
        const lastEvaluatedMs = new Date(existingAlarm.lastEvaluatedAt).getTime();
        if (readingTimestampMs < lastEvaluatedMs) {
          continue;
        }
      }
      if (existingAlarm) {
        existingAlarm.lastEvaluatedAt = reading.timestamp || nowIso;
      }

      const tv = rule.thresholdValue;
      const tm = rule.thresholdMax ?? tv;
      let isBreached = false;
      
      switch(rule.operator) {
        case '>': isBreached = reading.value > tv; break;
        case '>=': isBreached = reading.value >= tv; break;
        case '<': isBreached = reading.value < tv; break;
        case '<=': isBreached = reading.value <= tv; break;
        case 'OUTSIDE_RANGE': isBreached = reading.value < tv || reading.value > tm; break;
        case 'INSIDE_RANGE': isBreached = reading.value >= tv && reading.value <= tm; break;
        case 'UNCHANGED': isBreached = false; break; // Currently unsupported without state history
        case 'NO_DATA': isBreached = false; break; // Checked separately
        default: if ((rule as any).operator === '==') isBreached = Math.abs(reading.value - tv) < 0.0001;
      }

      const hysteresis = rule.hysteresis || 0;
      let isRecovered = false;
      switch(rule.operator) {
        case '>': isRecovered = reading.value <= tv - hysteresis; break;
        case '>=': isRecovered = reading.value < tv - hysteresis; break;
        case '<': isRecovered = reading.value >= tv + hysteresis; break;
        case '<=': isRecovered = reading.value > tv + hysteresis; break;
        case 'OUTSIDE_RANGE': isRecovered = reading.value >= tv + hysteresis && reading.value <= tm - hysteresis; break;
        case 'INSIDE_RANGE': isRecovered = reading.value < tv - hysteresis || reading.value > tm + hysteresis; break;
        default: if ((rule as any).operator === '==') isRecovered = Math.abs(reading.value - tv) > hysteresis; else isRecovered = !isBreached;
      }

      const minBreachSec = rule.minBreachDurationSeconds || 0;
      const repeatIntervalSec = rule.repeatIntervalSeconds || 300;

      const customerName = deviceOwnerId !== 'usr_admin' ? this.db.data.users.find((u: any) => u.id === deviceOwnerId)?.name || 'Müşteri' : 'Global';

      const formattedMsg = rule.messageTemplate
        .replace(/{deviceName}/g, reading.deviceName)
        .replace(/{deviceId}/g, reading.deviceId)
        .replace(/{metric}/g, reading.metric)
        .replace(/{value}/g, String(reading.value))
        .replace(/{unit}/g, reading.unit || '')
        .replace(/{threshold}/g, rule.operator === 'OUTSIDE_RANGE' || rule.operator === 'INSIDE_RANGE' ? `${tv}-${tm}` : String(tv))
        .replace(/{severity}/g, rule.severity)
        .replace(/{timestamp}/g, new Date(nowIso).toLocaleString('tr-TR', { timeZone: rule.timezone || 'Europe/Istanbul' }))
        .replace(/{customerName}/g, customerName);

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
            const incidentId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
            existingAlarm = {
              id: alarmKey,
              incidentId,
              lastEvaluatedAt: reading.timestamp || nowIso,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              tenantId: deviceOwnerId,
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
              source: 'physical',
              isSimulation: false,
              environment: 'production',
            };
            this.upsertActiveAlarm(existingAlarm);
          } else {
            const incidentId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
            existingAlarm = {
              id: alarmKey,
              incidentId,
              lastEvaluatedAt: reading.timestamp || nowIso,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              tenantId: deviceOwnerId,
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
              source: 'physical',
              isSimulation: false,
              environment: 'production',
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
            existingAlarm.source = 'physical';
            existingAlarm.isSimulation = false;
            existingAlarm.environment = 'production';
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
          existingAlarm.source = 'physical';
          existingAlarm.isSimulation = false;
          existingAlarm.environment = 'production';

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
        existingAlarm.source = 'physical';
        existingAlarm.isSimulation = false;
        existingAlarm.environment = 'production';
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

  // 2. Simulation Rule Evaluation Engine (Sanal Cihazlar & Testler)
  public evaluateSimulationRules(reading: TelemetryReading, device?: Device) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];

    const rules = (this.db.data.rules || []).filter(
      (r: ThresholdRule) =>
        r.enabled &&
        (r.deviceId === 'all' || r.deviceId === reading.deviceId) &&
        r.metricKey === reading.metric
    );

    const deviceOwnerId = device ? device.tenantId : 'usr_admin';
    const nowIso = reading.timestamp || new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    for (const rule of rules) {
      // Strict Tenant Rule Check
      if (rule.tenantId && rule.tenantId !== 'usr_admin') {
        if (deviceOwnerId !== rule.tenantId) continue;
      }
      if (rule.tenantId === 'usr_admin' && rule.deviceId === 'all' && deviceOwnerId !== 'usr_admin') {
        continue;
      }
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
          let currentMinutes: number;
          const tz = rule.timezone || 'Europe/Istanbul';
          try {
            const trParts = new Intl.DateTimeFormat('en-GB', {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).formatToParts(new Date(nowIso));
            const h = parseInt(trParts.find((p) => p.type === 'hour')?.value || '0', 10);
            const m = parseInt(trParts.find((p) => p.type === 'minute')?.value || '0', 10);
            currentMinutes = h * 60 + m;
          } catch {
            const now = new Date(nowIso);
            currentMinutes = now.getHours() * 60 + now.getMinutes();
          }

          const [startH, startM] = startStr.split(':').map(Number);
          const [endH, endM] = endStr.split(':').map(Number);
          const startMinutes = (startH || 0) * 60 + (startM || 0);
          const endMinutes = (endH || 0) * 60 + (endM || 0);

          if (startMinutes < endMinutes) {
            if (currentMinutes < startMinutes || currentMinutes > endMinutes) continue;
          } else if (startMinutes > endMinutes) {
            if (currentMinutes < startMinutes && currentMinutes >= endMinutes) continue;
          }
        }
      }

      // Distinct Key for Simulation Alarms (sim_alarm_...)
      const alarmKey = `sim_alarm_${rule.id}_${reading.deviceId}_${reading.metric}`;

      if (rule.disabledUntil && new Date(rule.disabledUntil).getTime() > nowMs) {
        continue;
      }

      let existingAlarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);

      // Out-of-order protection: If reading timestamp is strictly older than existing alarm's last update, skip degradation
      const readingTimestampMs = new Date(reading.timestamp || nowIso).getTime();
      if (existingAlarm && existingAlarm.lastEvaluatedAt) {
        const lastEvaluatedMs = new Date(existingAlarm.lastEvaluatedAt).getTime();
        if (readingTimestampMs < lastEvaluatedMs) {
          continue;
        }
      }
      if (existingAlarm) {
        existingAlarm.lastEvaluatedAt = reading.timestamp || nowIso;
      }

      const tv = rule.thresholdValue;
      const tm = rule.thresholdMax ?? tv;
      let isBreached = false;
      
      switch(rule.operator) {
        case '>': isBreached = reading.value > tv; break;
        case '>=': isBreached = reading.value >= tv; break;
        case '<': isBreached = reading.value < tv; break;
        case '<=': isBreached = reading.value <= tv; break;
        case 'OUTSIDE_RANGE': isBreached = reading.value < tv || reading.value > tm; break;
        case 'INSIDE_RANGE': isBreached = reading.value >= tv && reading.value <= tm; break;
        case 'UNCHANGED': isBreached = false; break; // Currently unsupported without state history
        case 'NO_DATA': isBreached = false; break; // Checked separately
        default: if ((rule as any).operator === '==') isBreached = Math.abs(reading.value - tv) < 0.0001;
      }

      const hysteresis = rule.hysteresis || 0;
      let isRecovered = false;
      switch(rule.operator) {
        case '>': isRecovered = reading.value <= tv - hysteresis; break;
        case '>=': isRecovered = reading.value < tv - hysteresis; break;
        case '<': isRecovered = reading.value >= tv + hysteresis; break;
        case '<=': isRecovered = reading.value > tv + hysteresis; break;
        case 'OUTSIDE_RANGE': isRecovered = reading.value >= tv + hysteresis && reading.value <= tm - hysteresis; break;
        case 'INSIDE_RANGE': isRecovered = reading.value < tv - hysteresis || reading.value > tm + hysteresis; break;
        default: if ((rule as any).operator === '==') isRecovered = Math.abs(reading.value - tv) > hysteresis; else isRecovered = !isBreached;
      }

      const minBreachSec = rule.minBreachDurationSeconds || 0;
      const repeatIntervalSec = rule.repeatIntervalSeconds || 300;

      const customerName = deviceOwnerId !== 'usr_admin' ? this.db.data.users.find((u: any) => u.id === deviceOwnerId)?.name || 'Müşteri' : 'Global';

      const formattedMsg = `[TEST ALARMI] ${rule.messageTemplate
        .replace(/{deviceName}/g, reading.deviceName)
        .replace(/{deviceId}/g, reading.deviceId)
        .replace(/{metric}/g, reading.metric)
        .replace(/{value}/g, String(reading.value))
        .replace(/{unit}/g, reading.unit || '')
        .replace(/{threshold}/g, rule.operator === 'OUTSIDE_RANGE' || rule.operator === 'INSIDE_RANGE' ? `${tv}-${tm}` : String(tv))
        .replace(/{severity}/g, rule.severity)
        .replace(/{timestamp}/g, new Date(nowIso).toLocaleString('tr-TR', { timeZone: rule.timezone || 'Europe/Istanbul' }))
        .replace(/{customerName}/g, customerName)}`;

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
            const incidentId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
            existingAlarm = {
              id: alarmKey,
              incidentId,
              lastEvaluatedAt: reading.timestamp || nowIso,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              tenantId: deviceOwnerId,
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
              source: 'simulator',
              isSimulation: true,
              environment: 'sandbox',
            };
            this.upsertActiveAlarm(existingAlarm);
          } else {
            const incidentId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
            existingAlarm = {
              id: alarmKey,
              incidentId,
              lastEvaluatedAt: reading.timestamp || nowIso,
              ruleId: rule.id,
              deviceId: reading.deviceId,
              deviceName: reading.deviceName,
              tenantId: deviceOwnerId,
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
              source: 'simulator',
              isSimulation: true,
              environment: 'sandbox',
            };
            this.upsertActiveAlarm(existingAlarm);
            this.emitAlarmNotification(
              existingAlarm,
              'OPEN',
              `🧪 [TEST ALARMI] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
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
            existingAlarm.source = 'simulator';
            existingAlarm.isSimulation = true;
            existingAlarm.environment = 'sandbox';
            this.upsertActiveAlarm(existingAlarm);

            this.emitAlarmNotification(
              existingAlarm,
              'OPEN',
              `🧪 [TEST ALARMI] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
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
          existingAlarm.source = 'simulator';
          existingAlarm.isSimulation = true;
          existingAlarm.environment = 'sandbox';

          const lastNotifiedMs = new Date(existingAlarm.lastNotifiedAt || nowIso).getTime();
          const timeSinceLastNotifiedSec = (nowMs - lastNotifiedMs) / 1000;

          if (!existingAlarm.acknowledged && timeSinceLastNotifiedSec >= repeatIntervalSec) {
            existingAlarm.lastNotifiedAt = nowIso;
            existingAlarm.version = (existingAlarm.version || 1) + 1;
            this.upsertActiveAlarm(existingAlarm);

            this.emitAlarmNotification(
              existingAlarm,
              'REPEAT',
              `🧪 [TEST ALARMI TEKRARI #${existingAlarm.repeatCount}] ${reading.deviceName} - ${reading.metric.toUpperCase()}`
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
        existingAlarm.source = 'simulator';
        existingAlarm.isSimulation = true;
        existingAlarm.environment = 'sandbox';
        this.upsertActiveAlarm(existingAlarm);

        this.emitAlarmNotification(
          existingAlarm,
          'RESOLVED',
          `🧪 [TEST ALARMI NORMALE DÖNDÜ] ${reading.deviceName} - ${reading.metric.toUpperCase()}`,
          `[Simülasyon Testi] Değer güvenli aralığa geri döndü: ${reading.value} ${reading.unit} (Eşik: ${rule.thresholdValue}, Histerezis: ${rule.hysteresis || 0})`
        );
      }
    }
  }

  public evaluateNoDataRules(): boolean {
    const nowMs = Date.now();
    const rules = (this.db.data.rules || []).filter(r => r.enabled && r.operator === 'NO_DATA');
    if (rules.length === 0) return false;

    const devices = this.db.data.devices || [];
    let hasChanges = false;

    for (const rule of rules) {
      if (rule.disabledUntil && new Date(rule.disabledUntil).getTime() > nowMs) {
        continue;
      }
      
      const durationMs = (rule.thresholdValue || 5) * 60 * 1000;
      const repeatSec = rule.repeatIntervalSeconds || 300;

      for (const device of devices) {
        if (device.isSimulated) continue; // STRICT: Simulated devices don't get NO_DATA notifications

        if (rule.deviceId !== 'all' && rule.deviceId !== device.id) continue;
        const deviceOwnerId = device.tenantId || 'usr_admin';
        if (rule.tenantId && rule.tenantId !== 'usr_admin' && deviceOwnerId !== rule.tenantId) continue;
        if (rule.tenantId === 'usr_admin' && rule.deviceId === 'all' && deviceOwnerId !== 'usr_admin') continue;

        const lastSeenStr = device.lastSeen || device.createdAt;
        const lastSeenMs = lastSeenStr ? new Date(lastSeenStr).getTime() : nowMs;
        const timeSinceLastDataMs = nowMs - lastSeenMs;
        const isBreached = timeSinceLastDataMs >= durationMs;

        const alarmKey = `alarm_${rule.id}_${device.id}_${rule.metricKey}`;
        const existingAlarm = this.db.data.activeAlarms?.find(a => a.id === alarmKey);

        const customerName = deviceOwnerId !== 'usr_admin' ? this.db.data.users.find((u: any) => u.id === deviceOwnerId)?.name || 'Müşteri' : 'Global';
        const minutes = Math.floor(timeSinceLastDataMs / 60000);

        if (isBreached) {
          if (existingAlarm) {
            existingAlarm.currentValue = minutes;
            existingAlarm.updatedAt = new Date(nowMs).toISOString();

            if (existingAlarm.silencedUntil && new Date(existingAlarm.silencedUntil).getTime() > nowMs) continue;
            if (existingAlarm.state === 'ACKNOWLEDGED' || existingAlarm.state === 'SILENCED') continue;

            const lastNotifiedMs = existingAlarm.lastNotifiedAt ? new Date(existingAlarm.lastNotifiedAt).getTime() : new Date(existingAlarm.triggeredAt).getTime();
            if (nowMs - lastNotifiedMs >= repeatSec * 1000) {
              existingAlarm.repeatCount++;
              existingAlarm.lastNotifiedAt = new Date(nowMs).toISOString();

              const msg = rule.messageTemplate
                  .replace(/{deviceName}/g, device.name)
                  .replace(/{deviceId}/g, device.id)
                  .replace(/{metric}/g, rule.metricKey)
                  .replace(/{value}/g, String(minutes))
                  .replace(/{unit}/g, 'Dakika')
                  .replace(/{threshold}/g, String(rule.thresholdValue))
                  .replace(/{severity}/g, rule.severity)
                  .replace(/{timestamp}/g, new Date().toLocaleString('tr-TR', { timeZone: rule.timezone || 'Europe/Istanbul' }))
                  .replace(/{customerName}/g, customerName);

              this.emitAlarmNotification(existingAlarm, 'REPEAT', `🔄 [TEKRAR] Cihaz Çevrimdışı: ${device.name}`, `(Tekrar) Cihaz ${minutes} dakikadır veri göndermiyor.\n\n${msg}`, 'System Worker');
              hasChanges = true;
            }
          } else {
            const newAlarm: import('../../types.js').ActiveAlarm = {
              id: alarmKey,
              ruleId: rule.id,
              deviceId: device.id,
              deviceName: device.name,
              tenantId: device.tenantId || 'usr_admin',
              metricKey: rule.metricKey,
              operator: rule.operator,
              thresholdValue: rule.thresholdValue,
              currentValue: minutes,
              severity: rule.severity,
              state: 'ACTIVE',
              source: 'physical',
              isSimulation: false,
              environment: 'production',
              triggeredAt: new Date(nowMs).toISOString(),
              updatedAt: new Date(nowMs).toISOString(),
              lastNotifiedAt: new Date(nowMs).toISOString(),
              acknowledged: false,
              repeatCount: 1,
              message: `Cihaz ${rule.thresholdValue} dakikadan uzun süredir çevrimdışı.`
            };
            if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
            this.db.data.activeAlarms.push(newAlarm);
            
            const msg = rule.messageTemplate
                  .replace(/{deviceName}/g, device.name)
                  .replace(/{deviceId}/g, device.id)
                  .replace(/{metric}/g, rule.metricKey)
                  .replace(/{value}/g, String(minutes))
                  .replace(/{unit}/g, 'Dakika')
                  .replace(/{threshold}/g, String(rule.thresholdValue))
                  .replace(/{severity}/g, rule.severity)
                  .replace(/{timestamp}/g, new Date().toLocaleString('tr-TR', { timeZone: rule.timezone || 'Europe/Istanbul' }))
                  .replace(/{customerName}/g, customerName);

            this.emitAlarmNotification(newAlarm, 'OPEN', `🚨 [${rule.severity}] Cihaz Çevrimdışı: ${device.name}`, msg, 'System Worker');
            hasChanges = true;
          }
        } else {
          // Data has arrived, device is online. Resolve NO_DATA alarm if it exists.
          if (existingAlarm) {
            existingAlarm.state = 'RESOLVED';
            existingAlarm.resolvedAt = new Date(nowMs).toISOString();
            existingAlarm.updatedAt = new Date(nowMs).toISOString();

            this.db.data.activeAlarms = this.db.data.activeAlarms.filter((a: import('../../types.js').ActiveAlarm) => a.id !== existingAlarm!.id);
            if (!this.db.data.alarmHistory) this.db.data.alarmHistory = [];
            this.db.data.alarmHistory.unshift({ ...existingAlarm });
            if (this.db.data.alarmHistory.length > 2000) this.db.data.alarmHistory.length = 2000;

            const msg = rule.messageTemplate
                  .replace(/{deviceName}/g, device.name)
                  .replace(/{deviceId}/g, device.id)
                  .replace(/{metric}/g, rule.metricKey)
                  .replace(/{value}/g, String(minutes))
                  .replace(/{unit}/g, 'Dakika')
                  .replace(/{threshold}/g, String(rule.thresholdValue))
                  .replace(/{severity}/g, rule.severity)
                  .replace(/{timestamp}/g, new Date().toLocaleString('tr-TR', { timeZone: rule.timezone || 'Europe/Istanbul' }))
                  .replace(/{customerName}/g, customerName);

            this.emitAlarmNotification(existingAlarm, 'RESOLVED', `✅ [ÇÖZÜLDÜ] Cihaz Yeniden Çevrimiçi: ${device.name}`, `Cihazdan tekrar veri alınmaya başlandı. Alarm çözüldü.\n\nÖnceki Alarm:\n${msg}`, 'System Worker');
            hasChanges = true;
          }
        }
      }
    }

    if (hasChanges) {
      this.db.saveData(this.db.data);
    }
    return hasChanges;
  }

  public processHistory(reading: TelemetryReading, isSimulated: boolean, saveSimulatedDataToDb: boolean = false) {
    if (this.db.isPostgresProductionMode()) return;

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
