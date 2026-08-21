import type express from 'express';
import { parseProductionTelemetryPayload, parseLegacyTelemetryPayload, buildPacketAck } from '../utils/telemetry.parser.js';
import { deviceAuthService } from '../services/deviceAuth.service.js';
import { telemetryService } from '../services/telemetry.service.js';
import { commandService } from '../services/command.service.js';
import { db } from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export class TelemetryController {
  public async ingest(req: express.Request, res: express.Response) {
    return this.processIngest(req, res, parseProductionTelemetryPayload, false);
  }

  public async ingestLegacy(req: express.Request, res: express.Response) {
    return this.processIngest(req, res, parseLegacyTelemetryPayload, false);
  }

  public async ping(req: express.Request, res: express.Response) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type, X-Token, X-Device-Id, X-MAC-Address, X-Ping-Ms, X-RSSI');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).send('OK');
    }

    const parsedPayload = parseProductionTelemetryPayload(req);

    // If query string has apiKey or deviceId or token, extract it
    if (!parsedPayload.token && req.query.apiKey) {
      parsedPayload.token = String(req.query.apiKey).trim();
    } else if (!parsedPayload.token && req.query.token) {
      parsedPayload.token = String(req.query.token).trim();
    }
    if (!parsedPayload.deviceIdFromPayload && req.query.deviceId) {
      parsedPayload.deviceIdFromPayload = String(req.query.deviceId).trim();
    }

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
    const clientPing = req.headers['x-ping-ms'] ? Number(req.headers['x-ping-ms']) : undefined;
    const clientRssi = req.headers['x-rssi'] ? Number(req.headers['x-rssi']) : undefined;

    const roleKey = req.headers['x-role-key'] || req.body?.roleKey || req.body?.role_key || req.query.roleKey || req.query.role_key;
    const deviceType = req.headers['x-device-type'] || req.body?.deviceType || req.body?.device_type || req.query.deviceType || req.query.device_type;
    const hardwareModel = req.headers['x-hardware-model'] || req.body?.hardwareModel || req.body?.hardware_model || req.query.hardwareModel || req.query.hardware_model;
    const firmwareVersion = req.headers['x-firmware-version'] || req.body?.firmwareVersion || req.body?.firmware_version || req.query.firmwareVersion || req.query.firmware_version;

    const devUpdates: Partial<import('../../types.js').Device> = {
      lastSeen: new Date().toISOString(),
      status: 'online',
    };
    if (clientPing !== undefined && !isNaN(clientPing)) devUpdates.pingMs = clientPing;
    if (clientRssi !== undefined && !isNaN(clientRssi)) devUpdates.rssi = clientRssi;
    if (roleKey) devUpdates.roleKey = roleKey.toString();
    if (deviceType) devUpdates.deviceType = deviceType.toString();
    if (hardwareModel) devUpdates.hardwareModel = hardwareModel.toString();
    if (firmwareVersion) devUpdates.firmwareVersion = firmwareVersion.toString();

    db.updateDevice(device.id, devUpdates);

    const commands = commandService.getAndDeliverPendingCommands(device.id);

    return res.status(200).json({
      status: 'ok',
      type: 'heartbeat_ack',
      deviceId: device.id,
      deviceName: device.name,
      deviceStatus: device.status,
      lastSeen: device.lastSeen,
      heartbeatTimeoutSeconds: device.heartbeatTimeoutSeconds || 300,
      commands,
      serverTime: new Date().toISOString(),
      message: 'ESP Ping / Heartbeat sinyali başarıyla alındı ve cihaz ÇEVRİMİÇİ olarak onaylandı.',
    });
  }

  private async processIngest(
    req: express.Request,
    res: express.Response,
    parserFn: (r: any) => any,
    requireSequence: boolean = false
  ) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type, X-Token, X-Device-Id, X-MAC-Address');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).send('OK');
    }

    // Enforce HTTP POST only
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'HTTP metot hatası! Telemetri veri alımı için yalnızca HTTP POST metodu kabul edilir.',
        methodProvided: req.method,
        expectedMethod: 'POST',
        protocol: {
          endpoint: 'POST /api/telemetry',
          headers: {
            'X-API-Key': 'YOUR_DEVICE_API_KEY',
            'Content-Type': 'application/json',
          },
          bodyFormat: {
            sequence: 1234,
            metrics: {
              temperature: { value: 24.3, unit: 'C' },
              humidity: { value: 52, unit: '%' },
            },
          },
        },
      });
    }

    // 1. Parse Telemetry Payload with selected parser
    const parsedPayload = parserFn(req);

    // 2. Enforce Mandatory Sequence Number on Production Endpoint
    if (requireSequence && (parsedPayload.sequence === undefined || parsedPayload.sequence === null)) {
      return res.status(400).json({
        error: 'sequence_required',
        message: 'Üretim ortamındaki telemetri paketlerinde sequence (paket sıra numarası) zorunludur.',
        expectedFormat: {
          deviceId: 'NEXUS_DEV_982341',
          sequence: 1432,
          metrics: {
            temperature: { value: 24.5, unit: 'C' },
          },
        },
      });
    }

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

    // 3. Check for Empty Metrics vs Explicit Ping Heartbeat
    if (parsedPayload.metricsToProcess.length === 0) {
      const rawText = (parsedPayload.rawBodyText || '').toLowerCase();
      const isPing = rawText.includes('ping') || rawText.includes('heartbeat') || rawText.includes('nabiz');

      if (isPing) {
        device.lastSeen = new Date().toISOString();
        if (device.status !== 'online') device.status = 'online';
        db.updateDevice(device.id, {
          lastSeen: device.lastSeen,
          status: device.status,
          ipAddress: device.ipAddress,
        });
        const commands = commandService.getAndDeliverPendingCommands(device.id);

        return res.status(200).json({
          status: 'ok',
          type: 'heartbeat_ack',
          deviceId: device.id,
          deviceName: device.name,
          deviceStatus: device.status,
          lastSeen: device.lastSeen,
          heartbeatTimeoutSeconds: device.heartbeatTimeoutSeconds || 300,
          commands,
          serverTime: new Date().toISOString(),
          message: 'ESP Heartbeat / Ping sinyali işlendi. Cihaz çevrimiçi.',
        });
      }

      return res.status(400).json({
        error: 'Veri paketinde geçerli metrik bulunamadı.',
        expectedFormat: {
          deviceId: device.id,
          sequence: 10021,
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
      authResult.devInfoUpdated,
      parsedPayload.sequence
    );

    // 5. Retrieve & Deliver Pending Commands
    const commands = commandService.getAndDeliverPendingCommands(device.id);

    // 6. Build Standardized Packet ACK
    const packetAck = buildPacketAck({
      sequence: parsedPayload.sequence,
      receivedCount: parsedPayload.metricsToProcess.length,
      addedReadingsCount: addedReadings.length,
      writeAck,
      deviceId: device.id,
    });

    // 7. Return Clean Success Response (Packet-level standardized ACK)
    return res.status(201).json({
      status: packetAck.status,
      packetId: packetAck.packetId,
      received: packetAck.received,
      persisted: packetAck.persisted,
      queued: packetAck.queued,
      deviceId: device.id,
      deviceName: device.name,
      ack: packetAck,
      writeAck,
      processedMetricsCount: addedReadings.length,
      processedMetrics: parsedPayload.metricsToProcess.map((m) => m.metric),
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
    const { deviceId, metric, limit, userId, targetCustomerId, from, to, resolution } = req.query;

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
        limit ? parseInt(limit as string, 10) : 1000,
        targetUser,
        targetCust,
        from as string | undefined,
        to as string | undefined,
        resolution as string | undefined
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
