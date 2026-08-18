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
    devInfoUpdated = false
  ) {
    if (!device.metrics) device.metrics = {};
    for (const m of metricsToProcess) {
      device.metrics[m.metric] = m.value;
      const lowerKey = m.metric.toLowerCase();
      if (lowerKey !== m.metric) {
        device.metrics[lowerKey] = m.value;
      }
    }

    const addedReadings: TelemetryReading[] = [];
    const writeResults: Array<{ reading: TelemetryReading; persisted: boolean; engine: string; queuedForRetry?: boolean }> = [];

    for (const m of metricsToProcess) {
      const resObj = await db.addTelemetryReadingAsync({
        deviceId: device.id,
        deviceName: device.name,
        metric: m.metric,
        value: m.value,
        unit: m.unit,
        status: m.value > 90 ? 'critical' : m.value > 75 ? 'warning' : 'normal',
        rawPayload: finalFormattedPacket,
      });

      incrementTelemetryIngested(1);
      addedReadings.push(resObj.reading);
      writeResults.push(resObj);
    }

    if (addedReadings.length > 0) {
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

    const allPersisted = writeResults.every((r) => r.persisted);
    const anyQueued = writeResults.some((r) => r.queuedForRetry);

    const writeAck = {
      persisted: allPersisted,
      engine: writeResults[0]?.engine || 'PostgreSQL / TimescaleDB',
      persistedCount: writeResults.filter((r) => r.persisted).length,
      queuedForRetryCount: writeResults.filter((r) => r.queuedForRetry).length,
      status: allPersisted ? 'COMMITTED_TO_TIMESCALEDB' : anyQueued ? 'QUEUED_FOR_RETRY' : 'LOCAL_BUFFER',
    };

    return {
      addedReadings,
      writeAck,
    };
  }

  public getTelemetry(deviceId?: string, metric?: string, limit = 100, userId?: string, customerId?: string) {
    return db.getTelemetry(deviceId, metric, limit, userId, customerId);
  }

  public async getTelemetryAsync(deviceId?: string, metric?: string, limit = 100, userId?: string, customerId?: string) {
    return db.getTelemetryAsync(deviceId, metric, limit, userId, customerId);
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
