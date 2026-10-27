import { physicalTelemetryService, type PhysicalTelemetryResult } from './physicalTelemetry.service.js';
import { simulationTelemetryService, type SimulationTelemetryResult } from './simulationTelemetry.service.js';
import type { Device } from '../../types.js';
import type { ParsedMetric } from '../utils/telemetry.parser.js';

export class TelemetryService {
  public async ingestTelemetry(
    device: Device,
    metricsToProcess: ParsedMetric[],
    finalFormattedPacket: string,
    devInfoUpdated = false,
    sequence?: number,
    options?: {
      source?: 'physical' | 'simulator' | 'manual_test';
      environment?: 'production' | 'sandbox';
      simulationRunId?: string;
    }
  ): Promise<PhysicalTelemetryResult | SimulationTelemetryResult> {
    if (device.isSimulated || options?.source === 'simulator' || options?.environment === 'sandbox') {
      return simulationTelemetryService.ingestSimulationTelemetry(
        device,
        metricsToProcess,
        finalFormattedPacket,
        devInfoUpdated,
        sequence,
        options?.simulationRunId
      );
    }

    return physicalTelemetryService.ingestPhysicalTelemetry(
      device,
      metricsToProcess,
      finalFormattedPacket,
      devInfoUpdated,
      sequence
    );
  }

  public getTelemetry(deviceId?: string, metric?: string, limit = 100, userId?: string, customerId?: string) {
    return physicalTelemetryService.getTelemetry(deviceId, metric, limit, userId, customerId);
  }

  public async getTelemetryAsync(deviceId?: string, metric?: string, limit = 1000, userId?: string, customerId?: string, from?: string, to?: string, resolution?: string) {
    return physicalTelemetryService.getTelemetryAsync(deviceId, metric, limit, userId, customerId, from, to, resolution);
  }

  public getTelemetryStats() {
    return physicalTelemetryService.getTelemetryStats();
  }

  public async getHistoryAsync(deviceId: string, metric: string) {
    return physicalTelemetryService.getHistoryAsync(deviceId, metric);
  }
}

export const telemetryService = new TelemetryService();
export { physicalTelemetryService, simulationTelemetryService };

