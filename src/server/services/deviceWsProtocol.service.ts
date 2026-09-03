import { db } from '../db.js';
import { broadcast, safeSend } from './websocket.js';
import type { AuthenticatedWebSocket } from './websocket.js';
import { commandService } from './command.service.js';
import { physicalTelemetryService } from './physicalTelemetry.service.js';
import type { ParsedMetric } from '../utils/telemetry.parser.js';
import type {
  Device,
  DeviceCommand,
  UnifiedWsMessage,
  UnifiedMessageType,
  DeviceHelloData,
  DeviceTelemetryData,
  DeviceAckData,
  DeviceEventData,
  TelemetryReading,
} from '../../types.js';

// Idempotency / Deduplication Cache Entry
interface DeduplicationEntry {
  timestamp: number;
  type: UnifiedMessageType;
}

/**
 * Service managing the Unified WebSocket Protocol between field devices (ESP32/ESP8266/Python)
 * and the IoT Dashboard server.
 *
 * All messages follow the unified envelope:
 * {
 *   "type": "hello" | "telemetry" | "command" | "ack" | "event" | "ping" | "pong",
 *   "deviceId": string,
 *   "messageId": string,
 *   "timestamp": number,
 *   "data": Record<string, any>
 * }
 */
export class DeviceWsProtocolService {
  // Deduplication cache: key = `${deviceId}:${messageId}`, value = { timestamp, type }
  private processedMessages = new Map<string, DeduplicationEntry>();
  // Max entries to prevent unbounded memory growth
  private readonly MAX_CACHE_SIZE = 10000;
  // Cache TTL: 10 minutes (600,000 ms)
  private readonly CACHE_TTL_MS = 10 * 60 * 1000;

  // Active WebSocket connections mapped by deviceId: deviceId -> Set<AuthenticatedWebSocket>
  private activeDeviceSockets = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor() {
    // Periodic cleanup of deduplication cache
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, 60 * 1000);
  }

  /**
   * Register a newly authenticated device socket connection.
   */
  public registerDeviceSocket(deviceId: string, ws: AuthenticatedWebSocket) {
    if (!deviceId || !ws) return;

    let sockets = this.activeDeviceSockets.get(deviceId);
    if (!sockets) {
      sockets = new Set();
      this.activeDeviceSockets.set(deviceId, sockets);
    }
    sockets.add(ws);

    // Update DB & broadcast device online status
    const dev = db.getDeviceById(deviceId);
    if (dev) {
      db.updateDevice(deviceId, {
        websocketConnected: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
      });
      broadcast('devices:updated', db.getDevices());
      broadcast('device:status', {
        deviceId,
        status: 'online',
        websocketConnected: true,
        lastSeen: new Date().toISOString(),
      });
    }
  }

  /**
   * Unregister a disconnected device socket.
   */
  public unregisterDeviceSocket(deviceId: string, ws: AuthenticatedWebSocket) {
    if (!deviceId) return;

    const sockets = this.activeDeviceSockets.get(deviceId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.activeDeviceSockets.delete(deviceId);
        // Mark as disconnected from WebSocket
        const dev = db.getDeviceById(deviceId);
        if (dev) {
          db.updateDevice(deviceId, {
            websocketConnected: false,
            // If device has no other active connections, update status
            status: 'offline',
            lastSeen: new Date().toISOString(),
          });
          broadcast('devices:updated', db.getDevices());
          broadcast('device:status', {
            deviceId,
            status: 'offline',
            websocketConnected: false,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    }
  }

  /**
   * Check if a physical device is currently connected via WebSocket.
   */
  public isDeviceConnected(deviceId: string): boolean {
    const sockets = this.activeDeviceSockets.get(deviceId);
    if (!sockets) return false;
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) return true;
    }
    return false;
  }

  /**
   * Main entry point for messages received from IoT devices on the WebSocket.
   */
  public async handleDeviceMessage(
    ws: AuthenticatedWebSocket,
    message: UnifiedWsMessage
  ): Promise<boolean> {
    // 1. Structural Envelope Validation
    const validationError = this.validateEnvelope(message);
    if (validationError) {
      console.warn(`[DeviceWsProtocol] Geçersiz mesaj zarfı: ${validationError}`);
      this.sendError(ws, message?.deviceId || 'UNKNOWN', message?.messageId || 'none', validationError);
      return false;
    }

    const { type, deviceId, messageId, timestamp, data } = message;

    // 2. Authentication & Tenant Isolation Verification
    const device = this.verifyDeviceAuthorization(ws, deviceId);
    if (!device) {
      console.warn(`[DeviceWsProtocol] Yetkisiz cihaz mesajı reddedildi: deviceId=${deviceId}`);
      this.sendError(ws, deviceId, messageId, 'Yetkisiz erişim: Cihaz kayıtlı değil veya token geçersiz.');
      return false;
    }

    // Attach verified device to socket if not already present
    if (!ws.device) {
      ws.device = device;
      ws.isAuth = true;
      this.registerDeviceSocket(deviceId, ws);
    }

    // 3. Idempotency & Deduplication Check (Ignore for ping/pong)
    if (type !== 'ping' && type !== 'pong') {
      if (this.isDuplicateMessage(deviceId, messageId, type)) {
        console.warn(`[DeviceWsProtocol] Mükerrer (duplicate) mesaj engellendi: ${deviceId} / ${messageId} (${type})`);
        // Return ACK so the device knows it was already processed, but do not execute logic again
        this.sendAck(ws, deviceId, messageId, 'received', { note: 'duplicate_ignored' });
        return true;
      }
      this.recordMessageProcessed(deviceId, messageId, type);
    }

    // Update device lastSeen and lastMessageAt
    const nowIso = new Date().toISOString();
    db.updateDevice(deviceId, {
      lastSeen: nowIso,
      lastMessageAt: nowIso,
      websocketConnected: true,
      status: 'online',
    });

    // 4. Dispatch according to message type
    switch (type) {
      case 'hello':
        return this.handleHello(ws, device, messageId, timestamp, data as DeviceHelloData);

      case 'telemetry':
        return this.handleTelemetry(ws, device, messageId, timestamp, data as DeviceTelemetryData);

      case 'command':
        // Device sent a command (rare, but supported e.g. edge device issuing command or proxying)
        return this.handleDeviceCommand(ws, device, messageId, data);

      case 'ack':
        return this.handleAck(ws, device, messageId, data as DeviceAckData);

      case 'event':
        return this.handleEvent(ws, device, messageId, timestamp, data as DeviceEventData);

      case 'ping':
        return this.handlePing(ws, device, messageId);

      case 'pong':
        return this.handlePong(ws, device, messageId);

      default:
        this.sendError(ws, deviceId, messageId, `Bilinmeyen mesaj tipi: ${type}`);
        return false;
    }
  }

  /**
   * Handle 'hello' message: Handshake from ESP after connection.
   */
  private async handleHello(
    ws: AuthenticatedWebSocket,
    device: Device,
    messageId: string,
    timestamp: number,
    data: DeviceHelloData
  ): Promise<boolean> {
    const updatePayload: Partial<Device> = {
      status: 'online',
      websocketConnected: true,
      lastSeen: new Date().toISOString(),
    };

    if (data.firmwareVersion) {
      updatePayload.firmwareVersion = data.firmwareVersion;
    }
    if (data.hardware) {
      updatePayload.hardwareModel = data.hardware;
    }
    if (data.ip) {
      updatePayload.ipAddress = data.ip;
    }
    if (data.mac) {
      updatePayload.macAddress = data.mac;
    }

    db.updateDevice(device.id, updatePayload);
    const updatedDevice = db.getDeviceById(device.id) || device;

    // Broadcast device status to dashboard
    broadcast('devices:updated', db.getDevices());
    broadcast('device:hello', {
      deviceId: device.id,
      deviceName: device.name,
      firmwareVersion: data.firmwareVersion,
      hardware: data.hardware,
      ip: data.ip,
      mac: data.mac,
      timestamp: new Date().toISOString(),
    });

    // Send ACK back to device
    this.sendAck(ws, device.id, messageId, 'received', {
      status: 'online',
      serverTime: Math.floor(Date.now() / 1000),
    });

    // Check for any pending commands and deliver them immediately!
    await this.deliverPendingCommandsToDevice(device.id);

    return true;
  }

  /**
   * Handle 'telemetry' message: Ingestion of sensor metrics.
   */
  private async handleTelemetry(
    ws: AuthenticatedWebSocket,
    device: Device,
    messageId: string,
    timestamp: number,
    data: DeviceTelemetryData
  ): Promise<boolean> {
    if (!data || typeof data !== 'object') {
      this.sendAck(ws, device.id, messageId, 'failed', { error: 'Veri içeriği boş veya geçersiz' });
      return false;
    }

    const addedReadings: TelemetryReading[] = [];
    const rawPayloadStr = JSON.stringify(data);
    const metricsToProcess: ParsedMetric[] = [];

    // Normalize metric values: support either `metric: 24.3` or `metric: { value: 24.3, unit: "C" }`
    for (const [metricKey, metricRaw] of Object.entries(data)) {
      if (metricRaw === undefined || metricRaw === null) continue;

      let val: number;
      let unit = '';

      if (typeof metricRaw === 'number') {
        val = metricRaw;
      } else if (typeof metricRaw === 'object' && metricRaw !== null && 'value' in metricRaw) {
        val = Number(metricRaw.value);
        unit = metricRaw.unit ? String(metricRaw.unit) : '';
      } else if (typeof metricRaw === 'string' && !isNaN(Number(metricRaw))) {
        val = Number(metricRaw);
      } else if (typeof metricRaw === 'boolean') {
        val = metricRaw ? 1 : 0;
      } else {
        continue;
      }

      if (isNaN(val)) continue;

      metricsToProcess.push({
        metric: metricKey,
        value: val,
        unit: unit || this.getDefaultUnitForMetric(metricKey),
      });
    }

    if (metricsToProcess.length > 0) {
      try {
        const result = await physicalTelemetryService.ingestPhysicalTelemetry(
          device,
          metricsToProcess,
          rawPayloadStr,
          false,
          undefined,
          undefined,
          `${device.id}:${messageId}`
        );
        addedReadings.push(...result.addedReadings);

        // Also broadcast telemetry:new for general dashboard listeners
        if (result.addedReadings.length === 1) {
          broadcast('telemetry:new', result.addedReadings[0]);
        } else if (result.addedReadings.length > 1) {
          broadcast('telemetry:new', result.addedReadings);
        }
      } catch (err: any) {
        console.error(`[DeviceWsProtocol] Ingest hatası (${device.id}):`, err?.message || err);
      }
    }

    // Send ACK to device
    this.sendAck(ws, device.id, messageId, 'received', {
      metricsCount: addedReadings.length,
      serverTime: Math.floor(Date.now() / 1000),
    });

    // Check if any pending commands are queued for this device and deliver immediately
    await this.deliverPendingCommandsToDevice(device.id);

    return true;
  }

  /**
   * Handle 'ack' message: ESP confirms execution of a command.
   */
  private async handleAck(
    ws: AuthenticatedWebSocket,
    device: Device,
    messageId: string,
    data: DeviceAckData
  ): Promise<boolean> {
    if (!data || !data.forMessageId) {
      console.warn(`[DeviceWsProtocol] ACK mesajı forMessageId içermiyor (${device.id})`);
      return false;
    }

    const { forMessageId, status, error, result } = data;
    const cleanStatus = status === 'executed' ? 'executed' : (status === 'failed' ? 'failed' : 'acknowledged');

    // Extract actual command ID if formatted as "cmd_<id>"
    const actualCommandId = forMessageId.startsWith('cmd_')
      ? forMessageId.substring(4)
      : forMessageId;

    const resPayload = result !== undefined ? result : (error ? { error } : undefined);

    // Update command in DB and notify UI
    const updatedCount = await commandService.handleCommandAck(
      device.id,
      actualCommandId,
      cleanStatus,
      resPayload
    );

    // If output state was executed, update device output definitions in DB
    if (cleanStatus === 'executed' && (data.output !== undefined || data.value !== undefined)) {
      this.updateDeviceOutputState(device, data.output, data.value);
    }

    // Broadcast ACK confirmation
    broadcast('command:ack_confirmed', {
      deviceId: device.id,
      forMessageId,
      status: cleanStatus,
      updatedCount,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Handle 'event' message: Asynchronous state change (relay toggled, boot, wifi, etc.).
   */
  private async handleEvent(
    ws: AuthenticatedWebSocket,
    device: Device,
    messageId: string,
    timestamp: number,
    data: DeviceEventData
  ): Promise<boolean> {
    if (!data || !data.event) {
      return false;
    }

    const eventName = String(data.event).toLowerCase();

    // If relay or output changed, update output definitions in DB immediately
    if (
      eventName === 'relay_changed' ||
      eventName === 'output_changed' ||
      eventName === 'output' ||
      eventName === 'relay'
    ) {
      const outputKey = data.output !== undefined ? data.output : data.outputId;
      this.updateDeviceOutputState(device, outputKey, data.value);
    }

    // If OTA event, update OTA status
    if (eventName === 'ota_started') {
      db.updateDevice(device.id, { otaStatus: 'FLASHING', otaProgress: 10 });
      broadcast('devices:updated', db.getDevices());
    } else if (eventName === 'ota_completed') {
      db.updateDevice(device.id, { otaStatus: 'SUCCESS', otaProgress: 100 });
      broadcast('devices:updated', db.getDevices());
    } else if (eventName === 'ota_failed') {
      db.updateDevice(device.id, { otaStatus: 'FAILED', otaErrorMessage: data.error || 'Bilinmeyen OTA hatası' });
      broadcast('devices:updated', db.getDevices());
    }

    // Broadcast event to dashboard in real-time
    broadcast('device:event', {
      deviceId: device.id,
      deviceName: device.name,
      event: data.event,
      data,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      isoTimestamp: new Date().toISOString(),
    });

    // Send ACK to device
    this.sendAck(ws, device.id, messageId, 'received', { event: data.event });

    return true;
  }

  /**
   * Handle 'ping' message from device -> return 'pong'.
   */
  private handlePing(ws: AuthenticatedWebSocket, device: Device, messageId: string): boolean {
    const pongMessage: UnifiedWsMessage = {
      type: 'pong',
      deviceId: device.id,
      messageId: `pong_${messageId}`,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        serverTime: Math.floor(Date.now() / 1000),
      },
    };

    safeSend(ws, JSON.stringify(pongMessage));
    return true;
  }

  /**
   * Handle 'pong' message from device.
   */
  private handlePong(ws: AuthenticatedWebSocket, device: Device, messageId: string): boolean {
    // Device confirmed alive
    db.updateDevice(device.id, {
      lastSeen: new Date().toISOString(),
      websocketConnected: true,
      status: 'online',
    });
    return true;
  }

  /**
   * Handle edge device command proxying.
   */
  private handleDeviceCommand(
    ws: AuthenticatedWebSocket,
    device: Device,
    messageId: string,
    data: any
  ): boolean {
    this.sendAck(ws, device.id, messageId, 'received');
    return true;
  }

  /**
   * Helper: Updates device output state (e.g. relay_1 = ON/OFF) in device definition & metrics.
   */
  private updateDeviceOutputState(device: Device, outputKey: any, value: any) {
    if (outputKey === undefined && value === undefined) return;

    const cleanOutputStr = String(outputKey || 'RELAY_1').toUpperCase();
    const boolOrNumValue =
      typeof value === 'boolean'
        ? value
        : value === 1 || value === '1' || value === 'ON' || value === 'HIGH';

    const numVal = boolOrNumValue ? 1 : 0;

    // Update outputDefinitions if present
    let outputsUpdated = false;
    let newDefinitions = device.outputDefinitions;

    if (newDefinitions && Array.isArray(newDefinitions)) {
      newDefinitions = newDefinitions.map((od) => {
        if (
          od.id.toUpperCase() === cleanOutputStr ||
          od.name.toUpperCase() === cleanOutputStr ||
          String(od.pin) === cleanOutputStr
        ) {
          outputsUpdated = true;
          return { ...od, currentValue: numVal };
        }
        return od;
      });
    }

    const updatedMetrics = { ...(device.metrics || {}), [cleanOutputStr]: numVal };

    db.updateDevice(device.id, {
      metrics: updatedMetrics,
      outputDefinitions: outputsUpdated ? newDefinitions : device.outputDefinitions,
      lastSeen: new Date().toISOString(),
    });

    broadcast('devices:updated', db.getDevices());
    broadcast('device:output:changed', {
      deviceId: device.id,
      output: cleanOutputStr,
      value: boolOrNumValue,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Deliver all pending commands to a connected device via WebSocket immediately.
   */
  public async deliverPendingCommandsToDevice(deviceId: string): Promise<number> {
    const sockets = this.activeDeviceSockets.get(deviceId);
    if (!sockets || sockets.size === 0) return 0;

    const pendingCommands = await commandService.getAndDeliverPendingCommands(deviceId);
    if (pendingCommands.length === 0) return 0;

    let deliveredCount = 0;
    for (const cmd of pendingCommands) {
      const delivered = this.sendDeviceCommand(deviceId, cmd as any);
      if (delivered) deliveredCount++;
    }

    return deliveredCount;
  }

  /**
   * Send a command to a connected device formatted in the Unified WebSocket Protocol envelope.
   * Format:
   * {
   *   "type": "command",
   *   "deviceId": "...",
   *   "messageId": "cmd_...",
   *   "timestamp": 1756915201,
   *   "data": {
   *     "command": "relay",
   *     "output": 1,
   *     "value": true,
   *     ...
   *   }
   * }
   */
  public sendDeviceCommand(deviceId: string, command: DeviceCommand | any): boolean {
    const sockets = this.activeDeviceSockets.get(deviceId);
    if (!sockets || sockets.size === 0) {
      return false;
    }

    const commandId = command.id || command.commandId || `cmd_${Date.now()}`;
    const messageId = commandId.startsWith('cmd_') ? commandId : `cmd_${commandId}`;

    const unifiedCommandMessage: UnifiedWsMessage = {
      type: 'command',
      deviceId,
      messageId,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        command: command.command || command.commandType || 'relay',
        commandType: command.commandType || command.command || 'relay',
        output: command.outputId || command.output,
        outputId: command.outputId || command.output,
        value: command.value !== undefined ? command.value : command.payload,
        payload: command.payload,
        commandId,
        parameters: command.parameters,
        status: command.status || 'claimed',
        createdAt: command.createdAt || command.created_at || new Date().toISOString(),
        // Support OTA command fields
        ...(command.version ? { version: command.version } : {}),
        ...(command.url ? { url: command.url } : {}),
        ...(command.checksum ? { checksum: command.checksum } : {}),
      },
    };

    const payloadStr = JSON.stringify(unifiedCommandMessage);
    let sentToAny = false;

    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        const sent = safeSend(ws, payloadStr);
        if (sent) sentToAny = true;
      }
    }

    return sentToAny;
  }

  /**
   * Send an OTA trigger command to a connected device via WebSocket.
   * Firmwares will be downloaded via HTTPS by the device, not through WebSocket.
   */
  public sendOtaCommand(
    deviceId: string,
    version: string,
    downloadUrl: string,
    checksum?: string
  ): boolean {
    const sockets = this.activeDeviceSockets.get(deviceId);
    if (!sockets || sockets.size === 0) return false;

    const messageId = `ota_${Date.now()}`;
    const unifiedOtaMessage: UnifiedWsMessage = {
      type: 'command',
      deviceId,
      messageId,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        command: 'ota',
        version,
        url: downloadUrl,
        checksum: checksum || '',
      },
    };

    const payloadStr = JSON.stringify(unifiedOtaMessage);
    let sent = false;
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        if (safeSend(ws, payloadStr)) sent = true;
      }
    }

    return sent;
  }

  /**
   * Helper: Send a standardized ACK message back to the device.
   */
  public sendAck(
    ws: AuthenticatedWebSocket,
    deviceId: string,
    forMessageId: string,
    status: 'received' | 'executed' | 'failed',
    extraData?: Record<string, any>
  ) {
    const ackMessage: UnifiedWsMessage = {
      type: 'ack',
      deviceId,
      messageId: `ack_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        forMessageId,
        status,
        ...(extraData || {}),
      },
    };

    safeSend(ws, JSON.stringify(ackMessage));
  }

  /**
   * Helper: Send error message back to the device.
   */
  public sendError(
    ws: AuthenticatedWebSocket,
    deviceId: string,
    forMessageId: string,
    errorMessage: string
  ) {
    this.sendAck(ws, deviceId, forMessageId, 'failed', { error: errorMessage });
  }

  /**
   * Validate the unified envelope fields.
   */
  private validateEnvelope(message: any): string | null {
    if (!message || typeof message !== 'object') {
      return 'Mesaj geçerli bir JSON nesnesi olmalıdır.';
    }

    const validTypes: UnifiedMessageType[] = [
      'hello',
      'telemetry',
      'command',
      'ack',
      'event',
      'ping',
      'pong',
    ];

    if (!message.type || !validTypes.includes(message.type)) {
      return `Geçersiz type: ${message.type}. Desteklenen türler: ${validTypes.join(', ')}`;
    }

    if (!message.deviceId || typeof message.deviceId !== 'string' || message.deviceId.trim() === '') {
      return 'Geçersiz deviceId: deviceId boş olamaz.';
    }

    if (!message.messageId || typeof message.messageId !== 'string' || message.messageId.trim() === '') {
      return 'Geçersiz messageId: messageId boş olamaz.';
    }

    if (message.data === undefined || message.data === null || typeof message.data !== 'object') {
      return 'Geçersiz data: data bir nesne olmalıdır.';
    }

    return null;
  }

  /**
   * Verify device existence and tenant authorization.
   * Multi-tenant security (Rule 1):
   * A device cannot impersonate or modify another device or another customer's data.
   */
  private verifyDeviceAuthorization(ws: AuthenticatedWebSocket, deviceId: string): Device | null {
    const cleanId = deviceId.trim();
    const targetDevice = db.getDeviceById(cleanId) || db.getDeviceByApiKey(cleanId);

    if (!targetDevice) {
      // Record unregistered device for discovery
      db.recordUnregisteredDevice({
        ip: ws.device?.ipAddress || '127.0.0.1',
        hostname: `WS-${cleanId}`,
        mac: '—',
        vendor: 'WebSocket Device',
        openPorts: [80, 443],
        status: 'unregistered',
      });
      return null;
    }

    // If the socket was already authenticated with a specific device, ensure the deviceId matches
    if (ws.device) {
      if (ws.device.id !== targetDevice.id && ws.device.apiKey !== cleanId) {
        console.error(
          `[DeviceWsProtocol] GÜVENLİK İHLALİ: Soket (${ws.device.id}), başka bir cihaz adına (${cleanId}) mesaj gönderemez!`
        );
        return null;
      }
      return ws.device;
    }

    // If socket was authenticated with a web user (e.g. testing / simulation)
    if (ws.user) {
      if (ws.user.role === 'admin' || targetDevice.tenantId === ws.user.id) {
        return targetDevice;
      }
      return null;
    }

    // Otherwise, device is verified by targetDevice
    return targetDevice;
  }

  /**
   * Check if a messageId was already processed within the TTL window.
   */
  private isDuplicateMessage(deviceId: string, messageId: string, type: UnifiedMessageType): boolean {
    const cacheKey = `${deviceId}:${messageId}`;
    const existing = this.processedMessages.get(cacheKey);
    if (!existing) return false;

    // Check if expired
    if (Date.now() - existing.timestamp > this.CACHE_TTL_MS) {
      this.processedMessages.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Record that a messageId has been processed.
   */
  private recordMessageProcessed(deviceId: string, messageId: string, type: UnifiedMessageType) {
    // If cache exceeds limit, remove oldest entries
    if (this.processedMessages.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.processedMessages.keys().next().value;
      if (oldestKey) this.processedMessages.delete(oldestKey);
    }

    const cacheKey = `${deviceId}:${messageId}`;
    this.processedMessages.set(cacheKey, {
      timestamp: Date.now(),
      type,
    });
  }

  /**
   * Remove expired deduplication cache entries.
   */
  private cleanupExpiredMessages() {
    const now = Date.now();
    for (const [key, entry] of this.processedMessages.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL_MS) {
        this.processedMessages.delete(key);
      }
    }
  }

  /**
   * Helper: Metric units.
   */
  private getDefaultUnitForMetric(metricKey: string): string {
    const key = metricKey.toLowerCase();
    if (key.includes('temp')) return '°C';
    if (key.includes('hum')) return '%';
    if (key.includes('press')) return 'hPa';
    if (key.includes('volt')) return 'V';
    if (key.includes('curr') || key.includes('amp')) return 'A';
    if (key.includes('power') || key.includes('watt')) return 'W';
    if (key.includes('energy') || key.includes('kwh')) return 'kWh';
    if (key.includes('freq')) return 'Hz';
    if (key.includes('rssi')) return 'dBm';
    if (key.includes('lux') || key.includes('light')) return 'lux';
    if (key.includes('dist')) return 'cm';
    if (key.includes('flow')) return 'L/min';
    return '';
  }
}

export const deviceWsProtocolService = new DeviceWsProtocolService();
