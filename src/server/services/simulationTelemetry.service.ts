import { db } from '../db.js';
import { broadcast } from './websocket.js';
import { incrementTelemetryIngested } from './simulator.js';
import type { Device, TelemetryReading } from '../../types.js';
import type { ParsedMetric } from '../utils/telemetry.parser.js';

export interface SimulationTelemetryResult {
  addedReadings: TelemetryReading[];
  writeAck: {
    persisted: boolean;
    engine: string;
    persistedCount: number;
    queuedForRetryCount: number;
    status: string;
  };
}

export class SimulationTelemetryService {
  /**
   * Primary Ingestion Pipeline for Virtual Simulator Devices.
   * Enforces strict isolation: Physical devices are strictly rejected.
   */
  public async ingestSimulationTelemetry(
    device: Device,
    metricsToProcess: ParsedMetric[],
    finalFormattedPacket: string,
    devInfoUpdated = false,
    sequence?: number,
    simulationRunId?: string
  ): Promise<SimulationTelemetryResult> {
    // 1. Strict Simulator Validation:
    // Simülatörün gerçek cihaz API anahtarı kullanmasına izin verilmez!
    if (!device.isSimulated) {
      throw new Error('physical_device_not_allowed_in_simulator');
    }

    if (!device.metrics) device.metrics = {};
    for (const m of metricsToProcess) {
      device.metrics[m.metric] = m.value;
      const lowerKey = m.metric.toLowerCase();
      if (lowerKey !== m.metric) {
        device.metrics[lowerKey] = m.value;
      }
    }

    // 2. Prepare Sandbox / Simulation Telemetry Readings
    const readingsToInsert = metricsToProcess.map((m) => ({
      deviceId: device.id,
      deviceName: device.name,
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      status: 'normal' as const,
      rawPayload: finalFormattedPacket,
      sequence: sequence,
      source: 'simulator' as const,
      environment: 'sandbox' as const,
      simulationRunId: simulationRunId || `sim_${Date.now().toString(36)}`,
    }));

    // 3. Batch insert with sandbox environment flag (respects device.saveSimulatedDataToDb)
    const batchRes = await db.addTelemetryBatchAsync(readingsToInsert);
    const addedReadings: TelemetryReading[] = batchRes.readings || [];

    if (addedReadings.length > 0) {
      incrementTelemetryIngested(addedReadings.length);
      // Simulation WebSocket Broadcast channels (strictly isolated for admin simulation subscribers)
      broadcast('telemetry:simulation:batch', addedReadings);
      if (addedReadings.length === 1) {
        broadcast('telemetry:simulation:new', addedReadings[0]);
      }
      broadcast('simulator:batch', addedReadings);
      broadcast('simulator:telemetry', addedReadings[0]);
    }

    // 4. Update Simulated Device Status & Metrics
    db.updateDevice(device.id, {
      metrics: device.metrics,
      lastSeen: new Date().toISOString(),
      status: 'online',
    });

    if (devInfoUpdated) {
      broadcast('device:updated', device);
    }

    const writeAck = {
      persisted: batchRes.persisted,
      engine: batchRes.engine || 'Sandbox In-Memory Engine',
      persistedCount: batchRes.persisted ? addedReadings.length : 0,
      queuedForRetryCount: 0,
      status: device.saveSimulatedDataToDb ? 'COMMITTED_TO_DB_TEST_MODE' : 'SANDBOX_RAM_ONLY',
    };

    return {
      addedReadings,
      writeAck,
    };
  }
}

export const simulationTelemetryService = new SimulationTelemetryService();
