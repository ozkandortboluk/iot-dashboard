import type express from 'express';
import { parseTelemetryPayload } from '../utils/telemetry.parser.js';
import { deviceAuthService } from '../services/deviceAuth.service.js';
import { telemetryService } from '../services/telemetry.service.js';
import { commandService } from '../services/command.service.js';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export class TelemetryController {
  public async ingest(req: express.Request, res: express.Response) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).send('OK');
    }

    // 1. Parse Telemetry Payload
    const parsedPayload = parseTelemetryPayload(req);

    // 2. Authenticate & Prepare Device (including Rate Limit checks)
    const authResult = deviceAuthService.authenticateDevice(parsedPayload);
    if (authResult.rateLimitHeaders) {
      for (const [hKey, hVal] of Object.entries(authResult.rateLimitHeaders)) {
        res.setHeader(hKey, hVal);
      }
    }

    if (!authResult.success) {
      return res.status(authResult.httpStatus || 400).json(authResult.errorResponse);
    }

    const device = authResult.device!;

    // 3. Check for Empty Metrics
    if (parsedPayload.metricsToProcess.length === 0) {
      return res.status(400).json({
        error: 'Veri paketinde geçerli metrik bulunamadı.',
        expectedFormat: {
          deviceId: device.id,
          metrics: {
            temperature: { value: 24.7, unit: '°C' },
            humidity: { value: 58.2, unit: '%' },
            pressure: { value: 1013.4, unit: 'hPa' },
            voltage: { value: 228.5, unit: 'V' },
          },
        },
      });
    }

    // 4. Ingest Telemetry & Broadcast
    const { addedReadings, writeAck } = await telemetryService.ingestTelemetry(
      device,
      parsedPayload.metricsToProcess,
      parsedPayload.finalFormattedPacket,
      authResult.devInfoUpdated
    );

    // 5. Retrieve & Deliver Pending Commands
    const commands = commandService.getAndDeliverPendingCommands(device.id);

    // 6. Return Clean Success Response
    return res.status(201).json({
      status: 'success',
      deviceId: device.id,
      deviceName: device.name,
      processedMetricsCount: addedReadings.length,
      processedMetrics: parsedPayload.metricsToProcess.map((m) => m.metric),
      writeAck,
      rawPacketReceived: parsedPayload.finalFormattedPacket,
      readings: addedReadings,
      commands,
    });
  }

  public getStats(req: express.Request, res: express.Response) {
    res.json(telemetryService.getTelemetryStats());
  }

  public async getHistory(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user!;
    const { deviceId, metric, limit, userId, targetCustomerId } = req.query;

    if (deviceId && deviceId !== 'all') {
      const dev = db.getDevices().find((d) => d.id === (deviceId as string));
      if (!dev) {
        return res.status(404).json({ error: 'Cihaz bulunamadı.' });
      }
      if (currentUser.role !== 'admin' && dev.userId !== currentUser.id) {
        return res
          .status(403)
          .json({ error: 'Yetkisiz erişim! Başka bir kullanıcının cihaz verisini görüntüleyemezsiniz.' });
      }
    }

    const targetUser = currentUser.role === 'admin' ? (userId as string | undefined) : currentUser.id;
    const targetCust = currentUser.role === 'admin' ? (targetCustomerId as string | undefined) : currentUser.id;

    try {
      const data = await telemetryService.getTelemetryAsync(
        deviceId as string | undefined,
        metric as string | undefined,
        limit ? parseInt(limit as string, 10) : 100,
        targetUser,
        targetCust
      );
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: 'Geçmiş telemetri verileri alınamadı: ' + (err.message || '') });
    }
  }

  public async getAggregatedHistory(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user!;
    const { deviceId, metric } = req.query;

    if (!deviceId || !metric) {
      return res.status(400).json({ error: 'deviceId ve metric parametreleri zorunludur' });
    }

    const dev = db.getDevices().find((d) => d.id === (deviceId as string));
    if (!dev) {
      return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    }
    if (currentUser.role !== 'admin' && dev.userId !== currentUser.id) {
      return res
        .status(403)
        .json({ error: 'Yetkisiz erişim! Başka bir kullanıcının cihaz verisini görüntüleyemezsiniz.' });
    }

    try {
      const hist = await telemetryService.getHistoryAsync(deviceId as string, metric as string);
      res.json(hist || { hourly: [], daily: [], monthly: [] });
    } catch {
      res.json({ hourly: [], daily: [], monthly: [] });
    }
  }
}

export const telemetryController = new TelemetryController();
