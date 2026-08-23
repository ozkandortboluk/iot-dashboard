import type express from 'express';
import { parseProductionTelemetryPayload, parseLegacyTelemetryPayload } from '../utils/telemetry.parser.js';
import { simulationTelemetryService } from '../services/simulationTelemetry.service.js';
import { commandService } from '../services/command.service.js';
import { db } from '../db.js';

export class SimulationTelemetryController {
  /**
   * Primary Simulation Telemetry Ingestion Handler: POST /api/simulator/v1/telemetry and POST /api/simulator/telemetry
   * Dedicated to virtual simulation devices. Real physical devices are strictly rejected with 403.
   */
  public async ingest(req: express.Request, res: express.Response) {
    return this.processSimulationIngest(req, res, parseProductionTelemetryPayload);
  }

  /**
   * Legacy Multi-Format Simulation Ingestion Handler: POST /api/simulator/v1/telemetry/legacy
   */
  public async ingestLegacy(req: express.Request, res: express.Response) {
    return this.processSimulationIngest(req, res, parseLegacyTelemetryPayload);
  }

  private async processSimulationIngest(
    req: express.Request,
    res: express.Response,
    parserFn: (r: any) => any
  ) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type, X-Token, X-Device-Id, X-Simulation-Run-Id');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).send('OK');
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'HTTP metot hatası! Simülasyon telemetri alımı için yalnızca HTTP POST kabul edilir.',
        expectedMethod: 'POST',
      });
    }

    // 1. Parse Simulation Payload
    const parsedPayload = parserFn(req);
    const token = parsedPayload.token || (req.headers['x-api-key'] as string) || (req.query.apiKey as string);
    const simulationRunId = (req.headers['x-simulation-run-id'] as string) || req.body?.simulationRunId;

    if (!token) {
      return res.status(401).json({
        error: 'sim_auth_missing',
        message: 'Sanal cihaz API anahtarı (X-API-Key veya token) eksik!',
      });
    }

    // 2. Lookup Device strictly in Database
    const device = db.getDeviceByApiKey(token);
    if (!device) {
      return res.status(403).json({
        error: 'sim_device_not_found',
        message: 'Geçersiz veya sistemde kayıtlı olmayan sanal cihaz API anahtarı!',
      });
    }

    // 3. CRITICAL SECURITY ISOLATION RULE:
    // Simülatörün gerçek fiziksel cihaz API anahtarı kullanmasına izin verilmemeli!
    if (!device.isSimulated) {
      return res.status(403).json({
        error: 'physical_device_not_allowed_in_simulator',
        message: 'Fiziksel donanım simülatör telemetri API’sini kullanamaz. Gerçek donanım API uç noktasını (/api/v1/telemetry) kullanınız.',
        deviceId: device.id,
        deviceName: device.name,
      });
    }

    // 4. Validate Metrics
    if (!parsedPayload.metricsToProcess || parsedPayload.metricsToProcess.length === 0) {
      return res.status(400).json({
        error: 'sim_no_metrics',
        message: 'Sanal telemetri paketinde geçerli metrik bulunamadı.',
        expectedFormat: {
          deviceId: device.id,
          sequence: 1,
          metrics: {
            temperature: { value: 25.4, unit: '°C' },
            humidity: { value: 50.2, unit: '%' },
          },
        },
      });
    }

    try {
      // 5. Ingest via SimulationTelemetryService
      const { addedReadings, writeAck } = await simulationTelemetryService.ingestSimulationTelemetry(
        device,
        parsedPayload.metricsToProcess,
        parsedPayload.finalFormattedPacket,
        false,
        parsedPayload.sequence,
        simulationRunId
      );

      // 6. Deliver pending commands for simulated device
      const commands = commandService.getAndDeliverPendingCommands(device.id);

      return res.status(201).json({
        status: 'accepted',
        type: 'simulation_telemetry_ack',
        deviceId: device.id,
        deviceName: device.name,
        environment: 'sandbox',
        source: 'simulator',
        processedMetricsCount: addedReadings.length,
        processedMetrics: parsedPayload.metricsToProcess.map((m) => m.metric),
        writeAck,
        readings: addedReadings,
        commands,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'sim_ingest_failed',
        message: 'Sanal telemetri işlenirken hata oluştu: ' + (err.message || ''),
      });
    }
  }
}

export const simulationTelemetryController = new SimulationTelemetryController();
