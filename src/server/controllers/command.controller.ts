import type express from 'express';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { commandService } from '../services/command.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Device, DeviceCommand, User } from '../../types.js';

// Standard recognized IoT outputs across microcontrollers, PLCs, SBCs, and industrial gateways
const STANDARD_OUTPUT_REGEX = /^(OUT(_PUT)?_?[0-9]{1,3}|RELAY(_?[0-9]{1,3})?|DIGITAL(_OUT)?(_?[0-9]{1,3})?|ANALOG(_OUT)?(_?[0-9]{1,3})?|PWM(_OUT)?(_?[0-9]{1,3})?|DAC(_?[0-9]{1,3})?|ADC(_?[0-9]{1,3})?|GPIO_?[0-9]{1,3}|PIN_?[0-9]{1,3}|IO_?[0-9]{1,3}|D[0-9]{1,3}|A[0-9]{1,3}|PUMP(_?[0-9]{1,3})?|VALVE(_?[0-9]{1,3})?|FAN(_?[0-9]{1,3})?|HEATER(_?[0-9]{1,3})?|COOLER(_?[0-9]{1,3})?|MOTOR(_?[0-9]{1,3})?|SWITCH(_?[0-9]{1,3})?|SERVO(_?[0-9]{1,3})?|STEPPER(_?[0-9]{1,3})?|SOLENOID(_?[0-9]{1,3})?|BUZZER(_?[0-9]{1,3})?|ALARM(_SIREN)?(_?[0-9]{1,3})?|SIREN(_?[0-9]{1,3})?|LED(_?[0-9]{1,3})?|STATUS_LED|POWER|DIMMER|SPEED|FREQUENCY|TARGET_TEMP|SETPOINT|THRESHOLD)$/i;

// Standard fallback output IDs supported across all generic IoT devices
const STANDARD_FALLBACK_OUTPUTS = new Set([
  'RELAY_1',
  'RELAY_2',
  'RELAY_3',
  'RELAY_4',
  'DIGITAL_1',
  'DIGITAL_2',
  'DIGITAL_3',
  'DIGITAL_4',
  'PWM_1',
  'PWM_2',
  'PWM_3',
  'PWM_4',
  'ANALOG_1',
  'ANALOG_2',
  'DAC_1',
  'DAC_2',
  'ADC_1',
  'ADC_2',
  'OUT_1',
  'OUT_2',
  'OUT_3',
  'OUT_4',
]);

const SYSTEM_COMMAND_NAMES = new Set([
  'REBOOT',
  'RESET',
  'PING',
  'OTA_CHECK',
  'CONFIG_SYNC',
  'DIAGNOSTIC',
  'SET_OUTPUT',
  'SET_CONFIG',
  'GENERAL_COMMAND',
]);

export class CommandController {
  /**
   * Helper: Validates whether an outputId or command is supported by the device.
   */
  public isOutputSupported(device: Device, outputId?: string, commandType?: string): { supported: boolean; reason?: string } {
    // If it's a pure system-level command without a hardware output pin, it's supported
    if (!outputId || SYSTEM_COMMAND_NAMES.has(outputId.toUpperCase())) {
      if (commandType && SYSTEM_COMMAND_NAMES.has(commandType.toUpperCase())) {
        return { supported: true };
      }
      if (!outputId) {
        return { supported: true };
      }
    }

    const cleanOutput = outputId.trim().toUpperCase();

    // 0. Standard fallback output IDs (supported on all generic/microcontroller nodes)
    if (STANDARD_FALLBACK_OUTPUTS.has(cleanOutput)) {
      return { supported: true };
    }

    // 1. Explicitly declared output definitions (capabilities) on device
    if (device.outputDefinitions && Array.isArray(device.outputDefinitions)) {
      const match = device.outputDefinitions.some((od) => od.id?.trim().toUpperCase() === cleanOutput || od.name?.trim().toUpperCase() === cleanOutput);
      if (match) return { supported: true };
    }

    if (device.capabilities?.outputs && Array.isArray(device.capabilities.outputs)) {
      const match = device.capabilities.outputs.some((od) => od.id?.trim().toUpperCase() === cleanOutput || od.name?.trim().toUpperCase() === cleanOutput);
      if (match) return { supported: true };
    }

    // 2. Explicitly declared supported outputs on device
    if (device.supportedOutputs && Array.isArray(device.supportedOutputs) && device.supportedOutputs.length > 0) {
      const match = device.supportedOutputs.some((o) => o.trim().toUpperCase() === cleanOutput);
      if (match) return { supported: true };
    }

    // 2. Explicitly declared supported commands on device
    if (device.supportedCommands && Array.isArray(device.supportedCommands) && device.supportedCommands.length > 0) {
      const match = device.supportedCommands.some((c) => c.trim().toUpperCase() === cleanOutput);
      if (match) return { supported: true };
    }

    // 3. Known metric pins on the device (e.g. device.metrics)
    if (device.metrics && Object.prototype.hasOwnProperty.call(device.metrics, outputId)) {
      return { supported: true };
    }

    // 4. Simulated metrics list (for virtual/test devices)
    if (device.simulatedMetrics && Array.isArray(device.simulatedMetrics)) {
      const match = device.simulatedMetrics.some((m) => m.trim().toUpperCase() === cleanOutput);
      if (match) return { supported: true };
    }

    // 5. Standard recognized IoT output patterns (Relays, PWM, GPIOs, Pumps, Valves, etc.)
    if (STANDARD_OUTPUT_REGEX.test(cleanOutput)) {
      return { supported: true };
    }

    return {
      supported: false,
      reason: `'${outputId}' çıkışı bu cihaz (${device.name} [Model: ${device.hardwareModel || device.deviceType || device.type}]) tarafından desteklenmemektedir.`,
    };
  }

  /**
   * Helper: Validates user permissions on device (Authentication, Tenant Isolation, Device Ownership, Command Role).
   */
  public validateUserDeviceAccess(currentUser: User | undefined, deviceId: string, requireCommandPermission = true): {
    authorized: boolean;
    httpStatus: number;
    error?: string;
    device?: Device;
  } {
    // 1. Is user authenticated?
    if (!currentUser || !currentUser.id) {
      return {
        authorized: false,
        httpStatus: 401,
        error: 'Erişim Engellendi (401): Kimlik doğrulama jetonu eksik veya oturum geçersiz.',
      };
    }

    // Check account status
    if (currentUser.status === 'suspended' || currentUser.deletedAt) {
      return {
        authorized: false,
        httpStatus: 403,
        error: 'Yetkisiz İşlem (403): Kullanıcı hesabı askıya alınmış veya devre dışı bırakılmıştır.',
      };
    }

    // 2. Lookup device
    const device = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
    if (!device) {
      return {
        authorized: false,
        httpStatus: 404,
        error: `Cihaz bulunamadı (${deviceId}).`,
      };
    }

    // 3. Multi-Tenant Access & Device Ownership Check
    if (currentUser.role !== 'admin') {
      const membershipTenants = (db.data?.tenantMemberships || [])
        .filter((m: any) => m.userId === currentUser.id)
        .map((m: any) => m.tenantId);
      const userTenants = [currentUser.id, ...membershipTenants];
      
      const deviceTenant = device.tenantId;
      if (!deviceTenant || !userTenants.includes(deviceTenant)) {
        return {
          authorized: false,
          httpStatus: 403,
          error: `Yetkisiz erişim (403): '${device.name}' (${deviceId}) cihazı hesabınıza veya bağlı olduğunuz organizasyona ait değildir.`,
        };
      }
    }

    // 4. Command Permission Check (viewer / analyst read-only roles cannot send commands)
    if (requireCommandPermission) {
      if (currentUser.role === 'analyst') {
        return {
          authorized: false,
          httpStatus: 403,
          error: 'Yetkisiz erişim (403): Analist rolündeki kullanıcılar salt-okunur yetkiye sahiptir, cihaza komut gönderemez.',
        };
      }

      // Check tenant membership role if applicable
      if (db.data.tenantMemberships && device.tenantId) {
        const membership = db.data.tenantMemberships.find(
          (m: any) => m.userId === currentUser.id && m.tenantId === device.tenantId
        );
        if (membership && membership.role === 'viewer') {
          return {
            authorized: false,
            httpStatus: 403,
            error: 'Yetkisiz erişim (403): İzleyici (viewer) rolündeki kullanıcıların cihazlara komut gönderme yetkisi yoktur.',
          };
        }
      }
    }

    return {
      authorized: true,
      httpStatus: 200,
      device,
    };
  }

  /**
   * Primary API Handler: POST /api/devices/:deviceId/commands & POST /api/v1/devices/:deviceId/commands
   * Enforces all 5 strict security & capability validation checks before creating PostgreSQL command.
   */
  public async createCommand(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user;
    const { deviceId } = req.params;
    const { command, commandType, outputId, outputPin, value, payload, source, parameters, timeoutSeconds, maxRetries } = req.body || {};
    const idempotencyKey = req.body?.idempotencyKey || req.body?.idempotency_key || req.headers['x-idempotency-key'] || req.headers['idempotency-key'];

    // 1-4: Authenticated, Tenant Access, Device Ownership, Command Permission
    const accessCheck = this.validateUserDeviceAccess(currentUser, deviceId, true);
    if (!accessCheck.authorized) {
      return res.status(accessCheck.httpStatus).json({ error: accessCheck.error });
    }

    const device = accessCheck.device!;

    // Resolve commandType, command name, and output pin
    const finalCmdType = commandType || (outputId || outputPin ? 'SET_OUTPUT' : command) || 'GENERAL_COMMAND';
    const finalCommand = command || finalCmdType || 'GENERAL_COMMAND';
    const targetOutput = outputId || outputPin || (finalCmdType === 'SET_OUTPUT' ? command : undefined);

    if (!finalCommand && !finalCmdType && !targetOutput) {
      return res.status(400).json({
        error: 'Geçersiz İstek (400): Komut türü (command/commandType) veya hedef çıkış (outputId) gereklidir.',
      });
    }

    // 5. Check if outputId is supported by the device
    if (targetOutput) {
      const outputCheck = this.isOutputSupported(device, targetOutput, finalCmdType);
      if (!outputCheck.supported) {
        return res.status(400).json({
          error: `Geçersiz Çıkış / Pin (400): ${outputCheck.reason}`,
        });
      }
    }

    const finalVal = value !== undefined ? value : (payload !== undefined ? payload : '1');
    const displayValue = String(finalVal);

    try {
      // Save Command to PostgreSQL (and sync RAM)
      const newCmd: DeviceCommand = await db.addCommand({
        deviceId: device.id,
        deviceName: device.name,
        tenantId: device.tenantId || currentUser!.id,
        customerId: device.tenantId || currentUser!.id,
        userId: currentUser!.id,
        commandType: finalCmdType,
        command: finalCommand,
        outputId: targetOutput || undefined,
        value: finalVal,
        payload: finalVal,
        source: source || 'manual',
        status: 'queued',
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
        timeoutSeconds: timeoutSeconds ? Number(timeoutSeconds) : 300,
        maxRetries: maxRetries ? Number(maxRetries) : 3,
        parameters: parameters || req.body?.params || (targetOutput ? { outputId: targetOutput, value: finalVal } : undefined),
      });

      // Broadcast command lifecycle events to real-time WebSockets
      broadcast('command:created', newCmd);
      broadcast('commands:updated', await db.getCommands(device.id, currentUser!.role === 'admin' ? undefined : currentUser!.id));
      
      // Audit log
      db.addAuditLog(
        currentUser!.id,
        currentUser!.name,
        `Komut Kuyruğa Eklendi: [${device.name}] -> Tip:${finalCmdType} | Çıkış:${targetOutput || 'Yok'} | Değer:${displayValue}`,
        'medium'
      );

      res.status(201).json({
        status: 'success',
        message: 'Komut başarıyla doğrulandı ve PostgreSQL kuyruğuna eklendi.',
        command: newCmd,
      });
    } catch (err: any) {
      console.error('[CommandController] createCommand error:', err.message || err);
      res.status(400).json({
        error: err.message || 'Komut oluşturulamadı.',
      });
    }
  }

  /**
   * Device Output Control Handler: POST /api/devices/:id/control
   * Enforces all 5 validation checks, updates metrics, records telemetry feedback, and enqueues command.
   */
  public async controlDeviceOutput(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user;
    const deviceId = req.params.id || req.params.deviceId;
    const { command, value, outputPin, outputId, unit } = req.body || {};

    // 1-4: Authenticated, Tenant Access, Device Ownership, Command Permission
    const accessCheck = this.validateUserDeviceAccess(currentUser, deviceId, true);
    if (!accessCheck.authorized) {
      return res.status(accessCheck.httpStatus).json({ error: accessCheck.error });
    }

    const device = accessCheck.device!;
    const pinOrMetric = outputId || outputPin || command || 'OUT_1';

    // 5. Output capability check
    const outputCheck = this.isOutputSupported(device, pinOrMetric, command || 'SET_OUTPUT');
    if (!outputCheck.supported) {
      return res.status(400).json({
        error: `Geçersiz Çıkış / Pin (400): ${outputCheck.reason}`,
      });
    }

    const numericValue = typeof value === 'number' ? value : (value === 'ON' || value === 'HIGH' || value === true || value === 1 || value === '1' ? 1 : 0);
    const displayValue = value !== undefined ? String(value) : 'COMMAND';
    const idempotencyKey = req.body?.idempotencyKey || req.body?.idempotency_key || req.headers['x-idempotency-key'] || req.headers['idempotency-key'];

    try {
      // For simulated devices, update metrics immediately for test responsiveness.
      // For physical production devices, avoid permanent optimistic updates until confirmed by device ACK.
      if (device.isSimulated) {
        const updatedMetrics = { ...device.metrics, [pinOrMetric]: numericValue };
        db.updateDevice(deviceId, { metrics: updatedMetrics, lastSeen: new Date().toISOString() });
      }

      // Record Telemetry Reading for control signal feedback
      const reading = await db.addTelemetryReading({
        deviceId: device.id,
        deviceName: device.name,
        metric: pinOrMetric,
        value: numericValue,
        unit: unit || (typeof value === 'number' ? '%' : 'STATE'),
        status: 'normal',
        rawPayload: `[CONTROL_OUT] Pin:${pinOrMetric} | Cmd:${command || 'SET'} | Val:${displayValue}`,
        source: device.isSimulated ? 'simulator' : 'manual_test',
        environment: device.isSimulated ? 'sandbox' : 'production',
      });

      broadcast('telemetry:new', reading);
      broadcast('device:control', {
        deviceId: device.id,
        deviceName: device.name,
        outputPin: pinOrMetric,
        command,
        value: displayValue,
        timestamp: new Date().toISOString(),
      });

      db.addAuditLog(
        currentUser!.id,
        currentUser!.name,
        `Cihaz Çıkış Sinyali Gönderildi: [${device.name}] -> ${pinOrMetric} = ${displayValue}`,
        'medium'
      );

      // Queue downlink command in PostgreSQL
      const queuedCmd = await db.addCommand({
        deviceId: device.id,
        deviceName: device.name,
        tenantId: device.tenantId || currentUser!.id,
        customerId: device.tenantId || currentUser!.id,
        userId: currentUser!.id,
        commandType: command || 'SET_OUTPUT',
        command: command || pinOrMetric,
        outputId: pinOrMetric,
        value: displayValue,
        payload: displayValue,
        source: 'manual',
        status: 'queued',
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      });

      // Broadcast command lifecycle events to real-time WebSockets
      broadcast('command:created', queuedCmd);
      broadcast('commands:updated', await db.getCommands(deviceId, currentUser!.role === 'admin' ? undefined : currentUser!.id));

      res.json({
        success: true,
        message: `Çıkış komutu (${pinOrMetric}: ${displayValue}) başarıyla cihaza iletildi ve kuyruğa alındı.`,
        command: queuedCmd,
        reading,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Kontrol sinyali iletilemedi.';
      res.status(400).json({ error: msg });
    }
  }

  /**
   * Query Commands Handler: GET /api/devices/:deviceId/commands & GET /api/v1/devices/:deviceId/commands
   */
  public async getDeviceCommands(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user;
    const { deviceId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;

    const accessCheck = this.validateUserDeviceAccess(currentUser, deviceId, false);
    if (!accessCheck.authorized) {
      return res.status(accessCheck.httpStatus).json({ error: accessCheck.error });
    }

    const tenantFilter = currentUser!.role === 'admin' ? undefined : currentUser!.id;
    const cmds = await db.getCommands(deviceId, tenantFilter, limit);
    res.json(cmds);
  }

  /**
   * Get Command by ID: GET /api/commands/:commandId & GET /api/v1/commands/:commandId
   */
  public async getCommandById(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user;
    const { commandId } = req.params;

    if (!currentUser) {
      return res.status(401).json({ error: 'Erişim Engellendi (401): Oturum geçersiz.' });
    }

    const tenantFilter = currentUser.role === 'admin' ? undefined : currentUser.id;
    const cmd = await db.getCommandById(commandId, tenantFilter);

    if (!cmd) {
      return res.status(404).json({ error: `Komut bulunamadı (${commandId}).` });
    }

    res.json(cmd);
  }

  /**
   * Cancel Command Handler: POST /api/commands/:commandId/cancel & POST /api/v1/commands/:commandId/cancel
   */
  public async cancelCommand(req: express.Request, res: express.Response) {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user;
    const { commandId } = req.params;

    if (!currentUser) {
      return res.status(401).json({ error: 'Erişim Engellendi (401): Oturum geçersiz.' });
    }

    const tenantFilter = currentUser.role === 'admin' ? undefined : currentUser.id;
    const cmd = await db.getCommandById(commandId, tenantFilter);
    if (!cmd) {
      return res.status(404).json({ error: `Komut bulunamadı veya iptal etme yetkiniz yok (${commandId}).` });
    }

    const cancelled = await db.cancelCommand(commandId, tenantFilter);
    if (!cancelled) {
      return res.status(400).json({ error: 'Komut iptal edilemedi (zaten işlenmiş veya tamamlanmış olabilir).' });
    }

    const cancelledCmd: DeviceCommand = {
      ...cmd,
      status: 'cancelled',
      errorMessage: 'Kullanıcı tarafından iptal edildi',
      executedAt: new Date().toISOString(),
    };
    broadcast('command:failed', cancelledCmd);
    broadcast('commands:updated', await db.getCommands(cmd.deviceId, tenantFilter));

    res.json({
      success: true,
      message: `Komut [${commandId}] başarıyla iptal edildi.`,
    });
  }

  /**
   * Hardware Direct Polling Handler: GET /api/v1/device/commands (Atomic Claim)
   */
  public async pollDeviceCommands(req: express.Request, res: express.Response) {
    const token = (req.query.token as string) || (req.headers['x-api-key'] as string);
    if (!token) {
      return res.status(401).json({ error: 'Token eksik' });
    }
    const device = db.getDeviceByApiKey(token);
    if (!device) {
      return res.status(403).json({ error: 'Geçersiz Token' });
    }

    if (!device.tenantId) {
      return res.status(403).json({ error: 'Cihaza ait geçerli bir tenantId bulunamadı.' });
    }

    const claimedCommands = await commandService.getAndDeliverPendingCommands(device.id);

    res.json({
      deviceId: device.id,
      deviceName: device.name,
      commands: claimedCommands,
    });
  }

  /**
   * Hardware Direct Acknowledge Handler: POST /api/v1/device/commands/ack & POST /api/device/commands/ack
   */
  public async acknowledgeDeviceCommand(req: express.Request, res: express.Response) {
    // Accept either Device API Key (from device) or User Session Token (from web client)
    const token = (req.query.token as string) || (req.headers['x-api-key'] as string) || (req.headers['x-token'] as string) || req.body?.token || req.body?.apiKey;
    const authDevice = token ? db.getDeviceByApiKey(token) : null;
    let authUser: any = null;

    if (!authDevice) {
      // Check Bearer user token or Authorization header
      const authHeader = req.headers.authorization || (req.headers['x-auth-token'] as string);
      const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim() || token;
      if (userToken) {
        const session = db.verifySession(userToken);
        if (session?.user) {
          authUser = session.user;
        }
      }
    }

    const { commandId, commandIds, id, status, result, deviceId } = req.body || {};
    const targetIds = commandIds || commandId || id;

    if (!targetIds) {
      return res.status(400).json({ error: 'commandId veya commandIds parametresi gereklidir.' });
    }

    let targetDevice = authDevice;

    if (!targetDevice && authUser) {
      // If authenticated as a user, resolve deviceId from payload or command
      const targetDevId = deviceId || req.params.deviceId;
      if (targetDevId) {
        const dev = db.getDevices().find((d) => d.id === targetDevId);
        if (dev && (authUser.role === 'admin' || dev.tenantId === authUser.id)) {
          targetDevice = dev;
        }
      }
    }

    if (!targetDevice) {
      return res.status(401).json({ error: 'Yetkisiz İstek (401): Geçersiz veya eksik cihaz tokenı / kullanıcı oturumu.' });
    }

    // Strict Device ID cross-check if deviceId is provided in request body
    if (deviceId && deviceId !== targetDevice.id && deviceId !== targetDevice.apiKey) {
      return res.status(403).json({
        error: `Yetkisiz İstek (403): Belirtilen cihaz kimliği (${deviceId}) kullanılan kimlik doğrulama anahtarı (${targetDevice.id}) ile eşleşmiyor.`,
      });
    }

    let targetStatus: 'acknowledged' | 'failed' | 'executed' | 'applied' = 'acknowledged';
    if (status === 'failed') {
      targetStatus = 'failed';
    } else if (status === 'applied') {
      targetStatus = 'applied';
    } else if (status === 'executed') {
      targetStatus = 'executed';
    } else if (status === 'received' || status === 'acknowledged') {
      targetStatus = 'acknowledged';
    }

    const { error, errorMessage } = req.body || {};
    const finalResult = result !== undefined ? result : (error || errorMessage ? { error: error || errorMessage } : undefined);

    const updatedCount = await commandService.handleCommandAck(
      targetDevice.id,
      targetIds,
      targetStatus,
      finalResult
    );

    res.json({
      success: true,
      deviceId: targetDevice.id,
      acknowledgedCount: updatedCount,
      status: targetStatus,
      message: `${updatedCount} komut başarıyla güncellendi (durum: ${targetStatus}).`,
    });
  }
}

export const commandController = new CommandController();
