import { Router } from 'express';
import { db } from '../db.js';
import { broadcast, terminateDeviceSockets } from '../services/websocket.js';
import { runSimulationStep } from '../services/simulator.js';
import { telemetryController } from '../controllers/telemetry.controller.js';
import { commandController } from '../controllers/command.controller.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { tenantSecurityService } from '../services/tenantSecurity.service.js';
import { smartIntervalService } from '../services/smartInterval.service.js';

const router = Router();

// Dedicated Ping / Heartbeat route for IoT Hardware
router.all('/ping', (req, res) => telemetryController.ping(req, res));

// ==========================================
// HIERARCHY ENDPOINTS: SITES, ZONES & GROUPS
// ==========================================

router.get('/hierarchy/sites', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const tenantId = currentUser.role === 'admin' ? (req.query.tenantId as string) : currentUser.id;
  res.json(db.getSites(tenantId));
});

router.post('/hierarchy/sites', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { name, address, tenantId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tesis/Lokasyon adı zorunludur.' });
  }
  const targetTenantId = currentUser.role === 'admin' ? (tenantId || currentUser.id) : currentUser.id;
  const newSite = db.createSite({ name, address, tenantId: targetTenantId });
  broadcast('hierarchy:sites:updated', db.getSites());
  res.status(201).json(newSite);
});

router.delete('/hierarchy/sites/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const siteId = req.params.id;
  const tenantId = currentUser.role === 'admin' ? undefined : currentUser.id;
  const success = db.deleteSite(siteId, tenantId);
  if (!success) {
    return res.status(404).json({ error: 'Tesis bulunamadı veya silme yetkiniz yok.' });
  }
  broadcast('hierarchy:sites:updated', db.getSites());
  broadcast('devices:updated', db.getDevices());
  res.json({ success: true, message: 'Tesis silindi.' });
});

router.get('/hierarchy/zones', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const tenantId = currentUser.role === 'admin' ? (req.query.tenantId as string) : currentUser.id;
  const siteId = req.query.siteId as string;
  res.json(db.getZones(tenantId, siteId));
});

router.post('/hierarchy/zones', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { name, description, siteId, tenantId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Bölge/Alan adı zorunludur.' });
  }
  const targetTenantId = currentUser.role === 'admin' ? (tenantId || currentUser.id) : currentUser.id;
  const newZone = db.createZone({ name, description, siteId, tenantId: targetTenantId });
  broadcast('hierarchy:zones:updated', db.getZones());
  res.status(201).json(newZone);
});

router.delete('/hierarchy/zones/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const zoneId = req.params.id;
  const tenantId = currentUser.role === 'admin' ? undefined : currentUser.id;
  const success = db.deleteZone(zoneId, tenantId);
  if (!success) {
    return res.status(404).json({ error: 'Bölge bulunamadı veya silme yetkiniz yok.' });
  }
  broadcast('hierarchy:zones:updated', db.getZones());
  broadcast('devices:updated', db.getDevices());
  res.json({ success: true, message: 'Bölge silindi.' });
});

router.get('/hierarchy/groups', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const tenantId = currentUser.role === 'admin' ? (req.query.tenantId as string) : currentUser.id;
  const siteId = req.query.siteId as string;
  const zoneId = req.query.zoneId as string;
  res.json(db.getDeviceGroups(tenantId, siteId, zoneId));
});

router.post('/hierarchy/groups', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { name, description, color, siteId, zoneId, tenantId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Grup adı zorunludur.' });
  }
  const targetTenantId = currentUser.role === 'admin' ? (tenantId || currentUser.id) : currentUser.id;
  const newGroup = db.createDeviceGroup({ name, description, color, siteId, zoneId, tenantId: targetTenantId });
  broadcast('hierarchy:groups:updated', db.getDeviceGroups());
  res.status(201).json(newGroup);
});

router.delete('/hierarchy/groups/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const groupId = req.params.id;
  const tenantId = currentUser.role === 'admin' ? undefined : currentUser.id;
  const success = db.deleteDeviceGroup(groupId, tenantId);
  if (!success) {
    return res.status(404).json({ error: 'Grup bulunamadı veya silme yetkiniz yok.' });
  }
  broadcast('hierarchy:groups:updated', db.getDeviceGroups());
  broadcast('devices:updated', db.getDevices());
  res.json({ success: true, message: 'Grup silindi.' });
});

// ==========================================
// HEALTH SUMMARIES & REPLACEMENT RECORDS
// ==========================================

router.get('/health-summaries', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const tenantId = currentUser.role === 'admin' ? (req.query.tenantId as string) : currentUser.id;
  res.json(db.getDeviceHealthSummaries(tenantId));
});

router.get('/replacement-history', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const tenantId = currentUser.role === 'admin' ? (req.query.tenantId as string) : currentUser.id;
  const deviceId = req.query.deviceId as string;
  res.json(db.getReplacementHistory(tenantId, deviceId));
});

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

router.get('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Bu cihaz hesabınıza ait değildir.' });
  }

  res.json(existingDev);
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
    heartbeatTimeoutSeconds: heartbeatTimeoutSeconds ? Number(heartbeatTimeoutSeconds) : 60,
    expectedIntervalSeconds: expectedIntervalSeconds ? Number(expectedIntervalSeconds) : 30,
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

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın API anahtarını yenileyebilirsiniz.' });
  }

  try {
    const newKey = db.regenerateApiKey(deviceId);
    terminateDeviceSockets(deviceId, 'API Anahtarı yenilendi (Regenerated)');
    broadcast('devices:updated', db.getDevices());
    res.json({ apiKey: newKey, message: 'API Anahtarı başarıyla yenilendi.' });
  } catch {
    res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }
});

router.post('/:id/rotate-key', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { expiresDays, scopes } = req.body || {};

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın anahtarını döndürebilirsiniz.' });
  }

  try {
    const updated = await db.rotateApiKey(deviceId, {
      expiresDays: expiresDays ? Number(expiresDays) : undefined,
      scopes: Array.isArray(scopes) ? scopes : undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    terminateDeviceSockets(deviceId, 'API Anahtarı döndürüldü (Rotated)');
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      apiKey: updated.apiKey,
      apiKeyExpiresAt: updated.expiresAt,
      message: 'Cihaz API anahtarı başarıyla döndürüldü (rotated).'
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Anahtar döndürülemedi.' });
  }
});

router.post('/:id/revoke-key', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { reason } = req.body || {};

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın anahtarını iptal edebilirsiniz.' });
  }

  try {
    const updated = await db.revokeApiKey(deviceId, reason || 'Kullanıcı tarafından askıya alındı');
    if (!updated) return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    // Immediately terminate any active WebSockets for this revoked device
    terminateDeviceSockets(deviceId, `API Key iptal edildi: ${reason || 'Revoked'}`);
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      apiKeyRevoked: updated.apiKeyRevoked ?? true,
      message: 'Cihaz API anahtarı iptal edildi ve tüm aktif bağlantılar sonlandırıldı.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Anahtar iptal edilemedi.' });
  }
});

router.post('/:id/restore-key', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın anahtarını geri yükleyebilirsiniz.' });
  }

  try {
    const updated = await db.restoreApiKey(deviceId);
    if (!updated) return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      apiKeyRevoked: false,
      message: 'Cihaz API anahtarı başarıyla yeniden aktif edildi.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Anahtar geri yüklenemedi.' });
  }
});

router.put('/:id/credentials', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { apiKeyScopes, apiKeyExpiresAt } = req.body || {};

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın kimlik ayarlarını güncelleyebilirsiniz.' });
  }

  try {
    const updated = await db.updateApiKeySettings(deviceId, {
      scopes: Array.isArray(apiKeyScopes) ? apiKeyScopes : undefined,
      expiresAt: apiKeyExpiresAt !== undefined ? apiKeyExpiresAt : undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Cihaz bulunamadı.' });
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      device: updated,
      message: 'Cihaz kimlik ve yetki ayarları güncellendi.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Kimlik ayarları güncellenemedi.' });
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

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın metrik önbelleğini temizleyebilirsiniz.' });
  }

  const isStaleOnly = req.body?.staleOnly === true || req.query.staleOnly === 'true';

  try {
    const result = smartIntervalService.filterLiveMetricsCache(existingDev, isStaleOnly);
    const updated = db.updateDevice(deviceId, { metrics: existingDev.metrics });
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      scope: 'live_cache_only',
      historicalDatabasePreserved: true,
      databaseEngine: 'TimescaleDB / PostgreSQL',
      message: isStaleOnly
        ? `Veri gönderim sıklığının 2 katını (${result.thresholdSeconds} sn) aşan anlık gösterge metrik önbelleği temizlendi. TimescaleDB/PostgreSQL kalıcı telemetri geçmişi ve analiz kayıtları KESİNLİKLE korunmaktadır.`
        : 'Cihazın anlık pano metrik önbelleği temizlendi. TimescaleDB/PostgreSQL kalıcı telemetri geçmişi ve analiz kayıtları KESİNLİKLE korunmaktadır.',
      device: updated,
      thresholdSeconds: result.thresholdSeconds,
      cleanedCount: result.cleanedCount,
      remainingCount: result.remainingCount,
    });
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

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazı değiştirebilirsiniz.' });
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

router.get('/:id/health-summary', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Bu cihaz hesabınıza ait değildir.' });
  }

  const summary = db.getDeviceHealthSummary(deviceId);
  res.json(summary);
});

router.put('/:id/maintenance', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { enabled, reason, until } = req.body;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın bakım modunu değiştirebilirsiniz.' });
  }

  try {
    const updated = db.setDeviceMaintenanceMode(deviceId, enabled, reason, until, currentUser);
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      maintenanceMode: updated.maintenanceMode,
      maintenanceReason: updated.maintenanceReason,
      maintenanceUntil: updated.maintenanceUntil,
      message: enabled
        ? 'Cihaz bakım moduna alındı. Alarmlar ve bildirimler geçici olarak susturuldu.'
        : 'Cihaz bakım modundan çıkarıldı ve normal operasyona döndü.',
      device: updated,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Bakım modu güncellenemedi.' });
  }
});

router.put('/:id/tags', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { tags } = req.body;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın etiketlerini güncelleyebilirsiniz.' });
  }

  try {
    const updated = db.updateDeviceTags(deviceId, Array.isArray(tags) ? tags : [], currentUser);
    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    res.json({
      success: true,
      tags: updated.tags,
      message: 'Cihaz etiketleri başarıyla güncellendi.',
      device: updated,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Etiketler güncellenemedi.' });
  }
});

router.post('/:id/replace-hardware', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deviceId = req.params.id;
  const { newName, newIp, newMac, pairingCode, reason, notes } = req.body;

  const existingDev = db.getDeviceById(deviceId) || db.getDevices().find((d) => d.id === deviceId);
  if (!existingDev) {
    return res.status(404).json({ error: 'Değiştirilecek cihaz bulunamadı.' });
  }

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazın donanımını değiştirebilirsiniz.' });
  }

  try {
    const { device: updated, record } = db.replaceDeviceHardware(
      deviceId,
      { newName, newIp, newMac, pairingCode, reason, notes },
      currentUser
    );

    broadcast('device:updated', updated);
    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());

    res.json({
      success: true,
      device: updated,
      record,
      message: `"${updated.name}" cihazının donanım değişimi başarıyla tamamlandı ve tarihçe kaydedildi.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Donanım değişimi gerçekleştirilemedi.' });
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

  if (!tenantSecurityService.canUserAccessDevice(currentUser, existingDev, db.data.tenantMemberships || [])) {
    return res.status(403).json({ error: 'Yetkisiz erişim! Yalnızca yetkiniz dahilindeki cihazı silebilirsiniz.' });
  }

  db.deleteDevice(deviceId);
  terminateDeviceSockets(deviceId, 'Cihaz sistemden silindi');
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
