import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Firmware, OtaDeploymentJob, Device } from '../../types.js';

export const firmwareRouter = Router();

// ==========================================
// 1. FIRMWARE CRUD ENDPOINTS
// ==========================================

// GET /api/firmwares - List all firmwares
firmwareRouter.get('/', authenticateUser, (req: Request, res: Response) => {
  const firmwares = db.getFirmwares();
  res.json(firmwares);
});

// POST /api/firmwares - Upload new firmware (Admin only)
firmwareRouter.post('/', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const {
    name,
    deviceType,
    roleKey,
    hardwareModel,
    version,
    description,
    binaryData,
    minHardwareRevision,
  } = req.body;

  if (!name || !deviceType || !roleKey || !version) {
    return res.status(400).json({
      error: 'Firmware adı, cihaz tipi (deviceType), görev kimliği (roleKey) ve sürüm (version) alanları zorunludur.',
    });
  }

  let base64String = binaryData || '';
  if (base64String.includes(',')) {
    base64String = base64String.split(',')[1];
  }

  const binaryBuffer = base64String ? Buffer.from(base64String, 'base64') : Buffer.from(`DUMMY_FIRMWARE_BINARY_${version}_${Date.now()}`);
  const sha256 = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
  const binarySize = binaryBuffer.length;

  const newFirmware: Firmware = {
    id: `fw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    deviceType: deviceType.trim().toLowerCase(),
    roleKey: roleKey.trim().toUpperCase(),
    hardwareModel: hardwareModel ? hardwareModel.trim() : 'ALL',
    version: version.trim(),
    description: description || '',
    binaryData: binaryBuffer.toString('base64'),
    binarySize,
    sha256,
    minHardwareRevision: minHardwareRevision || undefined,
    isActive: true,
    uploadedBy: user.name || user.email,
    created_at: new Date().toISOString(),
  };

  db.saveFirmware(newFirmware);
  (db.postgresRepo as any)?.saveFirmware?.(newFirmware)?.catch?.(() => {});

  db.addAuditLog(
    user.id,
    user.name,
    `Yeni Firmware Yüklendi: ${newFirmware.name} (${newFirmware.version}) - ${newFirmware.roleKey}`,
    'high'
  );

  broadcast('firmware:created', newFirmware);
  broadcast('firmwares:updated', db.getFirmwares());

  res.status(201).json(newFirmware);
});

// PUT /api/firmwares/:id - Update firmware info/status (Admin only)
firmwareRouter.put('/:id', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).json({ error: 'Firmware bulunamadı.' });
  }

  const { name, description, isActive, minHardwareRevision } = req.body;
  if (name !== undefined) fw.name = name;
  if (description !== undefined) fw.description = description;
  if (isActive !== undefined) fw.isActive = Boolean(isActive);
  if (minHardwareRevision !== undefined) fw.minHardwareRevision = minHardwareRevision;

  db.saveFirmware(fw);
  (db.postgresRepo as any)?.saveFirmware?.(fw)?.catch?.(() => {});

  broadcast('firmware:updated', fw);
  broadcast('firmwares:updated', db.getFirmwares());

  res.json(fw);
});

// DELETE /api/firmwares/:id - Delete firmware (Admin only)
firmwareRouter.delete('/:id', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).json({ error: 'Firmware bulunamadı.' });
  }

  db.deleteFirmware(id);
  (db.postgresRepo as any)?.deleteFirmware?.(id)?.catch?.(() => {});

  broadcast('firmware:deleted', { id });
  broadcast('firmwares:updated', db.getFirmwares());

  res.json({ success: true, message: 'Firmware başarıyla silindi.' });
});

// GET /api/firmwares/:id/download - Binary download for devices & clients
firmwareRouter.get('/:id/download', (req: Request, res: Response) => {
  const { id } = req.params;
  const apiKey = (req.query.key || req.query.apiKey || req.headers['x-api-key'] || '').toString();

  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).send('Firmware bulunamadı.');
  }

  if (!fw.isActive) {
    return res.status(403).send('Bu firmware sürümü pasif durumdadır.');
  }

  // If apiKey provided, verify device exists
  if (apiKey) {
    const dev = db.deviceRepository.getDeviceByApiKey(apiKey);
    if (!dev) {
      return res.status(401).send('Geçersiz Cihaz API Anahtarı.');
    }
  }

  const binaryBuffer = fw.binaryData ? Buffer.from(fw.binaryData, 'base64') : Buffer.from('');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', binaryBuffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fw.roleKey}_${fw.version}.bin"`);
  res.setHeader('X-SHA256', fw.sha256);
  res.setHeader('X-Version', fw.version);
  res.setHeader('X-Role-Key', fw.roleKey);
  res.setHeader('X-Device-Type', fw.deviceType);

  res.send(binaryBuffer);
});

// ==========================================
// 2. OTA DEPLOYMENT JOBS & TARGETING ENDPOINTS
// ==========================================

// GET /api/ota/jobs - List deployment jobs
firmwareRouter.get('/ota/jobs', authenticateUser, (req: Request, res: Response) => {
  res.json(db.getOtaJobs());
});

// POST /api/ota/deploy - Deploy OTA to devices (Admin only)
firmwareRouter.post('/ota/deploy', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const { firmwareId, targetScope, targetIds, targetValue } = req.body;

  if (!firmwareId || !targetScope) {
    return res.status(400).json({ error: 'firmwareId ve targetScope alanları zorunludur.' });
  }

  const fw = db.getFirmwareById(firmwareId);
  if (!fw) {
    return res.status(404).json({ error: 'Seçilen Firmware bulunamadı.' });
  }

  const allDevices = db.getDevices();
  let targetDevices: Device[] = [];

  if (targetScope === 'single') {
    const deviceId = Array.isArray(targetIds) ? targetIds[0] : (targetIds || targetValue);
    const d = allDevices.find((dev) => dev.id === deviceId);
    if (d) targetDevices.push(d);
  } else if (targetScope === 'selected') {
    const ids = Array.isArray(targetIds) ? targetIds : [];
    targetDevices = allDevices.filter((dev) => ids.includes(dev.id));
  } else if (targetScope === 'role_key') {
    const role = (targetValue || fw.roleKey || '').trim().toUpperCase();
    targetDevices = allDevices.filter(
      (dev) => (dev.roleKey || '').toUpperCase() === role
    );
  } else if (targetScope === 'device_type') {
    const typeCode = (targetValue || fw.deviceType || '').trim().toLowerCase();
    targetDevices = allDevices.filter(
      (dev) => (dev.deviceType || dev.type || '').toLowerCase() === typeCode
    );
  }

  if (targetDevices.length === 0) {
    return res.status(400).json({
      error: 'Güncelleme için uygun cihaz bulunamadı. Lütfen hedef filtrelerini kontrol edin.',
    });
  }

  // Validate hardware & role compatibility
  const incompatibleDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();

    // Check if role or type mismatch
    if (devRole && devRole !== fwRole) return true;
    if (devType && devType !== fwType) return true;
    return false;
  });

  if (incompatibleDevices.length > 0 && targetScope === 'selected') {
    return res.status(400).json({
      error: `Seçilen cihazlardan ${incompatibleDevices.length} tanesi bu firmware (${fw.deviceType} / ${fw.roleKey}) ile uyumsuz!`,
      incompatibleDevices: incompatibleDevices.map((d) => ({ id: d.id, name: d.name, roleKey: d.roleKey, deviceType: d.deviceType })),
    });
  }

  // Filter only compatible devices for group deploys
  const validDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();
    return (!devRole || devRole === fwRole) && (!devType || devType === fwType);
  });

  if (validDevices.length === 0) {
    return res.status(400).json({
      error: `Cihazların role_key veya device_type değerleri seçilen firmware (${fw.deviceType} / ${fw.roleKey}) ile uyuşmuyor.`,
    });
  }

  const createdJobs: OtaDeploymentJob[] = [];
  const now = new Date().toISOString();

  validDevices.forEach((dev) => {
    // Set device OTA status
    dev.otaStatus = 'PENDING';
    dev.otaTargetFirmwareId = fw.id;
    dev.otaProgress = 0;
    dev.otaErrorMessage = undefined;
    dev.otaUpdatedAt = now;

    db.updateDevice(dev.id, {
      otaStatus: 'PENDING',
      otaTargetFirmwareId: fw.id,
      otaProgress: 0,
      otaErrorMessage: undefined,
    });

    const job: OtaDeploymentJob = {
      id: `otajob_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      firmwareId: fw.id,
      firmwareVersion: fw.version,
      firmwareName: fw.name,
      deviceId: dev.id,
      deviceName: dev.name,
      deviceType: dev.deviceType || dev.type,
      roleKey: dev.roleKey || fw.roleKey,
      targetScope,
      status: 'PENDING',
      progressPercent: 0,
      initiatedBy: user.name || user.email,
      created_at: now,
    };

    db.saveOtaJob(job);
    (db.postgresRepo as any)?.saveOtaJob?.(job)?.catch?.(() => {});
    createdJobs.push(job);
  });

  db.addAuditLog(
    user.id,
    user.name,
    `OTA Güncellemesi Başlatıldı: ${fw.name} (${fw.version}) -> ${validDevices.length} Cihaz`,
    'high'
  );

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({
    success: true,
    message: `${validDevices.length} cihaz için OTA güncellemesi sıraya alındı (Bekliyor).`,
    jobCount: createdJobs.length,
    jobs: createdJobs,
  });
});

// POST /api/ota/cancel - Cancel pending OTA for device(s)
firmwareRouter.post('/ota/cancel', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { deviceIds } = req.body;
  const ids: string[] = Array.isArray(deviceIds) ? deviceIds : [deviceIds];

  let cancelCount = 0;
  ids.forEach((id) => {
    const dev = db.getDevices().find((d) => d.id === id);
    if (dev && (dev.otaStatus === 'PENDING' || dev.otaStatus === 'DOWNLOADING')) {
      dev.otaStatus = 'IDLE';
      dev.otaTargetFirmwareId = undefined;
      dev.otaProgress = 0;
      dev.otaErrorMessage = 'Yönetici tarafından iptal edildi';
      db.updateDevice(dev.id, dev);
      cancelCount++;
    }
  });

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: `${cancelCount} cihaz için OTA iptal edildi.` });
});

// ==========================================
// 3. DEVICE OTA HANDSHAKE & STATUS CHECK ENDPOINTS
// ==========================================

// POST or GET /api/ota/check - Device OTA Polling / Handshake
firmwareRouter.all('/check', (req: Request, res: Response) => {
  const body = req.method === 'POST' ? req.body || {} : req.query || {};
  const headers = req.headers;

  const apiKey = (
    body.apiKey ||
    body.api_key ||
    headers['x-api-key'] ||
    req.query.key ||
    ''
  ).toString().trim();

  const deviceId = (
    body.deviceId ||
    body.device_id ||
    headers['x-device-id'] ||
    ''
  ).toString().trim();

  let dev: Device | undefined;
  if (apiKey) {
    dev = db.deviceRepository.getDeviceByApiKey(apiKey);
  } else if (deviceId) {
    dev = db.getDevices().find((d) => d.id === deviceId);
  }

  if (!dev) {
    return res.status(401).json({ error: 'Cihaz doğrulanamadı. API Key veya Device ID eksik/geçersiz.' });
  }

  // Update real-time device identity metadata sent by hardware
  const deviceType = body.deviceType || body.device_type || headers['x-device-type'];
  const roleKey = body.roleKey || body.role_key || headers['x-role-key'];
  const hardwareModel = body.hardwareModel || body.hardware_model || headers['x-hardware-model'];
  const firmwareVersion = body.firmwareVersion || body.firmware_version || headers['x-firmware-version'];

  const updates: Partial<Device> = {
    lastSeen: new Date().toISOString(),
    status: 'online',
    otaLastCheckAt: new Date().toISOString(),
  };

  if (deviceType) updates.deviceType = deviceType.toString();
  if (roleKey) updates.roleKey = roleKey.toString();
  if (hardwareModel) updates.hardwareModel = hardwareModel.toString();
  if (firmwareVersion) updates.firmwareVersion = firmwareVersion.toString();

  db.updateDevice(dev.id, updates);

  // Check if target OTA firmware is set
  let targetFw: Firmware | undefined;
  if (dev.otaTargetFirmwareId) {
    targetFw = db.getFirmwareById(dev.otaTargetFirmwareId);
  }

  // If no explicit target, check active firmware for matching role_key + device_type with newer version
  if (!targetFw && dev.roleKey) {
    const activeFws = db.getFirmwares().filter(
      (f) =>
        f.isActive &&
        f.roleKey.toUpperCase() === (dev?.roleKey || '').toUpperCase() &&
        (f.deviceType.toLowerCase() === (dev?.deviceType || dev?.type || '').toLowerCase() || f.deviceType === 'all')
    );

    // Filter firmwares newer than current version
    if (activeFws.length > 0) {
      activeFws.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
      const newest = activeFws[0];
      if (dev.firmwareVersion !== newest.version) {
        targetFw = newest;
      }
    }
  }

  if (targetFw && targetFw.isActive) {
    const downloadUrl = `/api/firmwares/${targetFw.id}/download?key=${dev.apiKey}`;
    return res.json({
      updateAvailable: true,
      firmwareId: targetFw.id,
      firmwareName: targetFw.name,
      version: targetFw.version,
      deviceType: targetFw.deviceType,
      roleKey: targetFw.roleKey,
      sha256: targetFw.sha256,
      binarySize: targetFw.binarySize,
      downloadUrl,
      checkIntervalSeconds: 300,
    });
  }

  res.json({
    updateAvailable: false,
    message: 'Cihaz firmware sürümü güncel.',
    currentVersion: dev.firmwareVersion || 'v1.0.0',
    roleKey: dev.roleKey || 'GENERIC',
    checkIntervalSeconds: 300,
  });
});

// POST /api/ota/status - Device reports OTA progress & status
firmwareRouter.post('/status', (req: Request, res: Response) => {
  const body = req.body || {};
  const headers = req.headers;

  const apiKey = (body.apiKey || body.api_key || headers['x-api-key'] || '').toString().trim();
  const deviceId = (body.deviceId || body.device_id || headers['x-device-id'] || '').toString().trim();

  let dev: Device | undefined;
  if (apiKey) {
    dev = db.deviceRepository.getDeviceByApiKey(apiKey);
  } else if (deviceId) {
    dev = db.getDevices().find((d) => d.id === deviceId);
  }

  if (!dev) {
    return res.status(401).json({ error: 'Cihaz bulunamadı.' });
  }

  const { status, progressPercent, errorMessage, newVersion, firmwareId } = body;

  const updates: Partial<Device> = {
    lastSeen: new Date().toISOString(),
    status: 'online',
  };

  if (status === 'DOWNLOADING') {
    updates.otaStatus = 'DOWNLOADING';
    updates.otaProgress = Math.min(100, Math.max(0, Number(progressPercent) || 0));
  } else if (status === 'SUCCESS' || status === 'UPDATED') {
    updates.otaStatus = 'SUCCESS';
    updates.otaProgress = 100;
    updates.otaTargetFirmwareId = undefined;
    if (newVersion) {
      updates.firmwareVersion = newVersion;
    } else if (firmwareId) {
      const fw = db.getFirmwareById(firmwareId);
      if (fw) updates.firmwareVersion = fw.version;
    }
  } else if (status === 'FAILED' || status === 'ERROR') {
    updates.otaStatus = 'FAILED';
    updates.otaErrorMessage = errorMessage || 'Bilinmeyen OTA hatası oluştu';
  }

  db.updateDevice(dev.id, updates);

  // Update corresponding OTA deployment job
  const jobs = db.getOtaJobs().filter((j) => j.deviceId === dev?.id && j.status !== 'SUCCESS');
  if (jobs.length > 0) {
    const job = jobs[jobs.length - 1];
    if (status === 'DOWNLOADING') {
      job.status = 'DOWNLOADING';
      job.progressPercent = Math.min(100, Math.max(0, Number(progressPercent) || 0));
    } else if (status === 'SUCCESS' || status === 'UPDATED') {
      job.status = 'SUCCESS';
      job.progressPercent = 100;
      job.completedAt = new Date().toISOString();
    } else if (status === 'FAILED' || status === 'ERROR') {
      job.status = 'FAILED';
      job.errorMessage = errorMessage || 'OTA Güncelleme Hatası';
    }
    db.saveOtaJob(job);
  }

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: 'OTA durumu kaydedildi.' });
});
