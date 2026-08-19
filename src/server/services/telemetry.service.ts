import { db } from '../db.js';
import { broadcast } from './websocket.js';
import { incrementTelemetryIngested } from './simulator.js';
import { rateLimiterService } from './rateLimiter.service.js';
import type { Device, TelemetryReading } from '../../types.js';
import type { ParsedMetric } from '../utils/telemetry.parser.js';

export class TelemetryService {
  public async ingestTelemetry(
    device: Device,
    metricsToProcess: ParsedMetric[],
    finalFormattedPacket: string,
    devInfoUpdated = false,
    sequence?: number
  ) {
    if (!device.metrics) device.metrics = {};
    for (const m of metricsToProcess) {
      device.metrics[m.metric] = m.value;
      const lowerKey = m.metric.toLowerCase();
      if (lowerKey !== m.metric) {
        device.metrics[lowerKey] = m.value;
      }
    }

    const readingsToInsert = metricsToProcess.map((m) => ({
      deviceId: device.id,
      deviceName: device.name,
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      status: 'normal' as const,
      rawPayload: finalFormattedPacket,
      sequence: sequence,
    }));

    // Atomik transaction batch INSERT: Tek HTTP POST -> parser -> 8 reading -> Tek Batch Transaction INSERT -> Tek ACK
    const batchRes = await db.addTelemetryBatchAsync(readingsToInsert);
    const addedReadings: TelemetryReading[] = batchRes.readings || [];

    if (addedReadings.length > 0) {
      incrementTelemetryIngested(addedReadings.length);
      broadcast('telemetry:batch', addedReadings);
    }

    db.updateDevice(device.id, {
      metrics: device.metrics,
      lastSeen: device.lastSeen,
      status: device.status,
      ipAddress: device.ipAddress,
      macAddress: device.macAddress,
    });

    if (devInfoUpdated) {
      broadcast('device:updated', device);
    }

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

export const telemetryService = new TelemetryService();
