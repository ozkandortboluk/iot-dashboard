import { db } from '../db.js';
import { broadcast } from './websocket.js';
import { rateLimiterService } from './rateLimiter.service.js';
import type { Device, TelemetryReading } from '../../types.js';
import type { ParsedMetric } from '../utils/telemetry.parser.js';

export interface PhysicalTelemetryResult {
  addedReadings: TelemetryReading[];
  writeAck: {
    persisted: boolean;
    engine: string;
    persistedCount: number;
    queuedForRetryCount: number;
    status: string;
  };
}

export class PhysicalTelemetryService {
  /**
   * Primary Ingestion Pipeline for Physical Hardware Devices (ESP32, ESP8266, STM32, Gateway).
   * Enforces strict isolation: simulated devices are strictly rejected.
   */
  public async ingestPhysicalTelemetry(
    device: Device,
    metricsToProcess: ParsedMetric[],
    finalFormattedPacket: string,
    devInfoUpdated = false,
    sequence?: number,
    bootId?: string,
    idempotencyKey?: string
  ): Promise<PhysicalTelemetryResult> {
    // 1. Strict Physical Validation: Never process simulated devices via physical telemetry service!
    if (device.isSimulated) {
      throw new Error('simulated_device_not_allowed');
    }

    if (!device.metrics) device.metrics = {};
    for (const m of metricsToProcess) {
      device.metrics[m.metric] = m.value;
      const lowerKey = m.metric.toLowerCase();
      if (lowerKey !== m.metric) {
        device.metrics[lowerKey] = m.value;
      }
    }

    const effectiveBootId = bootId || 'default';
    const computedIdempotencyKey = idempotencyKey || (
      device.id && sequence !== undefined && sequence !== null
        ? `${device.id}:${effectiveBootId}:${sequence}`
        : undefined
    );

    // 2. Prepare Production Telemetry Readings with strict source/environment metadata and idempotency key
    const readingsToInsert = metricsToProcess.map((m) => ({
      deviceId: device.id,
      deviceName: device.name,
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      status: 'normal' as const,
      rawPayload: finalFormattedPacket,
      sequence: sequence,
      bootId: effectiveBootId,
      idempotencyKey: computedIdempotencyKey,
      source: 'physical' as const,
      environment: 'production' as const,
    }));

    // 3. Atomic Batch Insert to TimescaleDB / PostgreSQL hypertable
    const batchRes = await db.addTelemetryBatchAsync(readingsToInsert);
    const addedReadings: TelemetryReading[] = batchRes.readings || [];

    // 4. Broadcast to Production WebSocket Channels
    if (addedReadings.length > 0) {
      if (addedReadings.length === 1) {
        broadcast('telemetry:physical:new', addedReadings[0]);
      } else {
        broadcast('telemetry:physical:batch', addedReadings);
      }
    }

    // 5. Update Physical Device Status & Metrics via Intelligent Arrival Processor
    const processedDev = await db.processDeviceTelemetryArrival(device.id);
    if (processedDev) {
      device.status = processedDev.status;
      device.lastSeen = processedDev.lastSeen;
      device.expectedIntervalSeconds = processedDev.expectedIntervalSeconds;
      device.autoDetectedIntervalSeconds = processedDev.autoDetectedIntervalSeconds;
      device.heartbeatTimeoutSeconds = processedDev.heartbeatTimeoutSeconds;
    }

    db.updateDevice(device.id, {
      metrics: device.metrics,
      lastSeen: device.lastSeen,
      status: device.status,
      expectedIntervalSeconds: device.expectedIntervalSeconds,
      autoDetectedIntervalSeconds: device.autoDetectedIntervalSeconds,
      heartbeatTimeoutSeconds: device.heartbeatTimeoutSeconds,
      ipAddress: device.ipAddress,
      macAddress: device.macAddress,
    });

    broadcast('device:updated', device);

    const writeAck = {
      persisted: batchRes.persisted,
      engine: batchRes.engine || 'PostgreSQL / TimescaleDB (Transaction)',
      persistedCount: batchRes.persisted ? addedReadings.length : 0,
      queuedForRetryCount: batchRes.queuedForRetry ? addedReadings.length : 0,
      status: batchRes.persisted
        ? 'COMMITTED_TO_TIMESCALEDB'
        : batchRes.queuedForRetry
        ? 'QUEUED_FOR_RETRY'
        : 'LOCAL_BUFFER',
    };

    return {
      addedReadings,
      writeAck,
    };
  }

  public getTelemetry(deviceId?: string, metric?: string, limit = 100, userId?: string, customerId?: string) {
    return db.getTelemetry(deviceId, metric, limit, userId, customerId);
  }

  public async getTelemetryAsync(deviceId?: string, metric?: string, limit = 1000, userId?: string, customerId?: string, from?: string, to?: string, resolution?: string) {
    return db.getTelemetryAsync(deviceId, metric, limit, userId, customerId, from, to, resolution);
  }

  public getTelemetryStats() {
    const baseStats = db.getTelemetryStats();
    return {
      ...baseStats,
      rateLimiter: rateLimiterService.getStats(),
    };
  }

  public async getHistoryAsync(deviceId: string, metric: string) {
    return db.getHistoryAsync(deviceId, metric);
  }
}

export const physicalTelemetryService = new PhysicalTelemetryService();
