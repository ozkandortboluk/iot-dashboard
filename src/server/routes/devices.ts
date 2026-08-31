import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { runSimulationStep } from '../services/simulator.js';
import { telemetryController } from '../controllers/telemetry.controller.js';
import { commandController } from '../controllers/command.controller.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Dedicated Ping / Heartbeat route for IoT Hardware
router.all('/ping', (req, res) => telemetryController.ping(req, res));

// Devices Endpoints (Protected with Role-based filtering)
router.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const userId = req.query.tenantId as string | undefined;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  if (currentUser.role === 'admin') {
    res.json(db.getDevices(userId, targetCustomerId));
  } else {
    // Non-admin users can ONLY view their own devices
    res.json(db.getDevices(currentUser.id, currentUser.id));
  }
});

router.post('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { id, userId, name, type, location, ipAddress, macAddress, rateLimitPerMin, encryptionMethod, apiKey, isSimulated, saveSimulatedDataToDb, heartbeatTimeoutSeconds, expectedIntervalSeconds, simulatedMetrics } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Cihaz adı ve türü zorunludur.' });
  }

  // Non-admins can only create devices for themselves and CANNOT create simulated devices
  const targetOwnerId = currentUser.role === 'admin' ? (userId || currentUser.id) : currentUser.id;
  const allowSimulated = currentUser.role === 'admin';

  let finalApiKey = apiKey && apiKey.trim() ? apiKey.trim() : undefined;
  
  if (finalApiKey === '__USE_CACHED_TOKEN__') {
    // Try to recover token from unregistered devices cache
    const unreg = (db.data.unregisteredDevices || []).find((d: any) => 
      (ipAddress && d.ip === ipAddress) || (macAddress && d.mac === macAddress) || (name && d.hostname === name)
    );
    if (unreg && (unreg as any).tokenProvided) {
      finalApiKey = (unreg as any).tokenProvided;
    } else {
      finalApiKey = undefined;
    }
  }

  const device = db.createDevice({
    id: id && id.trim() ? id.trim() : undefined,
    tenantId: targetOwnerId,
    name,
    type,
    location: location || 'Tanımsız Konum',
    ipAddress: ipAddress || '127.0.0.1',
    macAddress: macAddress || undefined,
    status: 'online',
    rateLimitPerMin: rateLimitPerMin || 120,
    encryptionMethod: encryptionMethod || 'AES-256-GCM',
    apiKey: finalApiKey,
    heartbeatTimeoutSeconds: heartbeatTimeoutSeconds ? Number(heartbeatTimeoutSeconds) : 300,
    expectedIntervalSeconds: expectedIntervalSeconds ? Number(expectedIntervalSeconds) : undefined,
    isSimulated: allowSimulated && isSimulated !== undefined ? Boolean(isSimulated) : false,
    saveSimulatedDataToDb: allowSimulated && saveSimulatedDataToDb !== undefined ? Boolean(saveSimulatedDataToDb) : false,
    simulatedMetrics: allowSimulated && Array.isArray(simulatedMetrics) ? simulatedMetrics : undefined,
    metrics: {},
  });

  if (ipAddress) db.removeUnregisteredDevice(ipAddress);
  if (macAddress) db.removeUnregisteredDevice(macAddress);
  if (name) db.removeUnregisteredDevice(name);

  broadcast('device:created', device);
  broadcast('devices:updated', db.getDevices());
  broadcast('network:updated', db.getDiscoveredDevices());
  if (device.isSimulated && device.dataFlowActive !== false) {
    runSimulationStep();
  }
  res.status(201).json(device);
});

router.put('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const devices = db.getDevices();
  const existingDev = devices.find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (currentUser.role === 'admin') {
    if (req.body.userId && !req.body.tenantId) {
      req.body.tenantId = req.body.userId;
    }
  } else {
    if (existingDev.tenantId !== currentUser.id) {
      return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca kendi cihazlarınızı düzenleyebilirsiniz.' });
    }
    delete req.body.tenantId;
    delete req.body.userId;
    delete req.body.isSimulated;
    delete req.body.saveSimulatedDataToDb;
    delete req.body.simulatedMetrics;
  }

  try {
    const updated = db.updateDevice(deviceId, req.body);
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());
    if (updated.isSimulated && updated.dataFlowActive !== false) {
      runSimulationStep();
    }
    res.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Cihaz güncellenemedi.';
    res.status(400).json({ error: msg });
  }
});

router.post('/:id/convert-to-physical', authenticateUser, requireAdmin, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  try {
    const updated = db.convertToPhysicalDevice(deviceId, currentUser.id, currentUser.name);
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());
    res.json({
      success: true,
      device: updated,
      apiKey: updated.apiKey,
      message: `"${updated.name}" cihazı başarıyla fiziksel donanıma dönüştürüldü ve yeni fiziksel API Anahtarı üretildi.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Cihaz dönüştürülemedi.';
    res.status(400).json({ error: msg });
  }
});

router.put('/:id/owner', authenticateUser, requireAdmin, (req, res) => {
  const { targetUserId } = req.body;
  db.assignDeviceOwner(req.params.id, targetUserId);
  broadcast('devices:updated', db.getDevices());
  broadcast('network:updated', db.getDiscoveredDevices());
  res.json({ success: true, message: 'Cihaz sahibi değiştirildi.' });
});

router.post('/:id/regen-key', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const devices = db.getDevices();
  const existingDev = devices.find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (currentUser.role !== 'admin' && existingDev.tenantId !== currentUser.id) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca kendi cihazınızın API anahtarını yenileyebilirsiniz.' });
  }

  try {
    const newKey = db.regenerateApiKey(deviceId);
    broadcast('devices:updated', db.getDevices());
    res.json({ apiKey: newKey, message: 'API Anahtarı başarıyla yenilendi.' });
  } catch {
    res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }
});

router.post('/:id/clear-metrics', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const devices = db.getDevices();
  const existingDev = devices.find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (currentUser.role !== 'admin' && existingDev.tenantId !== currentUser.id) {
    return res.status(403).json({ error: 'Yetkisiz erişim!' });
  }

  try {
    const updated = db.updateDevice(deviceId, { metrics: {} });
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    res.json({ success: true, message: 'Cihaz metrik önbelleği temizlendi.', device: updated });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Metrikler temizlenemedi.' });
  }
});

router.post('/:id/replace', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { pairingCode } = req.body;

  const devices = db.getDevices();
  const existingDev = devices.find((d) => d.id === deviceId);
  
  if (!existingDev) {
    return res.status(404).json({ error: 'Değiştirilecek cihaz bulunamadı.' });
  }

  if (currentUser.role !== 'admin' && existingDev.tenantId !== currentUser.id) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca kendi cihazınızı değiştirebilirsiniz.' });
  }

  if (!pairingCode) {
    return res.status(400).json({ error: 'Eşleştirme kodu gereklidir.' });
  }

  try {
    const discovered = db.getDiscoveredDevices().find(d => d.pairingCode === pairingCode);
    if (!discovered) {
      return res.status(404).json({ error: 'Eşleştirme kodu ile bekleyen cihaz bulunamadı. Lütfen cihazın açık olduğundan emin olun.' });
    }

    const updates: Partial<any> = {
      macAddress: discovered.mac
    };
    if (discovered.ip) updates.ipAddress = discovered.ip;
    if (discovered.firmwareVersion) updates.firmwareVersion = discovered.firmwareVersion;
    if (discovered.hardwareModel) updates.hardwareModel = discovered.hardwareModel;

    const updated = db.updateDevice(deviceId, updates);

    // Remove from discovered pool
    if (discovered.ip) db.removeUnregisteredDevice(discovered.ip);
    if (discovered.mac) db.removeUnregisteredDevice(discovered.mac);

    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());

    res.json({
      success: true,
      device: updated,
      message: 'Cihaz donanımı başarıyla değiştirildi.'
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Donanım değişikliği yapılamadı.';
    res.status(400).json({ error: msg });
  }
});

router.post('/:id/control', authenticateUser, (req, res) => commandController.controlDeviceOutput(req, res));
router.post('/:deviceId/commands', authenticateUser, (req, res) => commandController.createCommand(req, res));
router.post('/:deviceId/command', authenticateUser, (req, res) => commandController.createCommand(req, res));
router.get('/:deviceId/commands', authenticateUser, (req, res) => commandController.getDeviceCommands(req, res));

router.delete('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const devices = db.getDevices();
  const existingDev = devices.find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (currentUser.role !== 'admin' && existingDev.tenantId !== currentUser.id) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca kendi cihazınızı silebilirsiniz.' });
  }

  db.deleteDevice(deviceId);
  broadcast('device:deleted', { id: deviceId });
  broadcast('devices:updated', db.getDevices());
  broadcast('network:updated', db.getDiscoveredDevices());
  res.json({ message: 'Cihaz silindi.' });
});

export const devicesRouter = router;

// Device Commands Router (v1 API)
const deviceCommandsRouter = Router();

deviceCommandsRouter.post('/devices/:deviceId/commands', authenticateUser, (req, res) => commandController.createCommand(req, res));
deviceCommandsRouter.post('/devices/:deviceId/command', authenticateUser, (req, res) => commandController.createCommand(req, res));
deviceCommandsRouter.get('/devices/:deviceId/commands', authenticateUser, (req, res) => commandController.getDeviceCommands(req, res));

// Endpoint for ESP devices to poll commands directly (Atomic Claim)
deviceCommandsRouter.get('/device/commands', (req, res) => commandController.pollDeviceCommands(req, res));

// Endpoint for field devices (ESP32 / Python) to acknowledge command execution
deviceCommandsRouter.post('/device/commands/ack', (req, res) => commandController.acknowledgeDeviceCommand(req, res));

export { deviceCommandsRouter };
