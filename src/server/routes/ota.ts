import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { OtaDeploymentJob, Device, Firmware } from '../../types.js';

export const otaRouter = Router();

// SemVer validation helper
export function isValidSemver(v: string): boolean {
  if (!v || typeof v !== 'string') return false;
  return /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v.trim());
}

// ==========================================
// 1. OTA JOBS & DEPLOYMENT MANAGEMENT (Admin & UI)
// ==========================================

// GET /api/ota/jobs - List deployment jobs (with optional deviceId filtering)
otaRouter.get('/jobs', authenticateUser, (req: Request, res: Response) => {
  const { deviceId, status } = req.query;
  let jobs = db.getOtaJobs();

  if (deviceId && typeof deviceId === 'string') {
    jobs = jobs.filter((j) => j.deviceId === deviceId);
  }
  if (status && typeof status === 'string') {
    jobs = jobs.filter((j) => j.status === status);
  }

  res.json(jobs);
});

// POST /api/ota/deploy - Deploy OTA update to devices (Admin only)
otaRouter.post('/deploy', authenticateUser, requireAdmin, (req: Request, res: Response) => {
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

  if (!fw.isActive) {
    return res.status(400).json({ error: 'Pasif durumdaki firmware dağıtıma çıkarılamaz. Lütfen önce aktifleştirin.' });
  }

  if (!isValidSemver(fw.version)) {
    return res.status(400).json({ error: `Firmware sürüm formatı (${fw.version}) geçerli bir SemVer değil.` });
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

  // Reject simulated devices from physical OTA deployment
  const simulatedTarget = targetDevices.find((d) => d.isSimulated);
  if (simulatedTarget) {
    return res.status(400).json({
      error: 'Sanal cihazlar için fiziksel OTA dağıtımı yapılamaz. Yalnızca gerçek fiziksel cihazları seçiniz.',
    });
  }

  // Validate hardware & role compatibility
  const incompatibleDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();

    if (devRole && devRole !== fwRole) return true;
    if (devType && devType !== fwType && fwType !== 'all') return true;
    return false;
  });

  if (incompatibleDevices.length > 0 && targetScope === 'selected') {
    return res.status(400).json({
      error: `Seçilen cihazlardan ${incompatibleDevices.length} tanesi bu firmware (${fw.deviceType} / ${fw.roleKey}) ile uyumsuz!`,
      incompatibleDevices: incompatibleDevices.map((d) => ({
        id: d.id,
        name: d.name,
        roleKey: d.roleKey,
        deviceType: d.deviceType || d.type,
      })),
    });
  }

  const validDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();
    return (!devRole || devRole === fwRole) && (!devType || devType === fwType || fwType === 'all');
  });

  if (validDevices.length === 0) {
    return res.status(400).json({
      error: `Cihazların role_key veya device_type değerleri seçilen firmware (${fw.deviceType} / ${fw.roleKey}) ile uyuşmuyor.`,
    });
  }

  const createdJobs: OtaDeploymentJob[] = [];
  const now = new Date().toISOString();

  validDevices.forEach((dev) => {
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

// POST /api/ota/cancel - Cancel pending OTA for device(s) (Admin only)
otaRouter.post('/cancel', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { deviceIds } = req.body;
  const ids: string[] = Array.isArray(deviceIds) ? deviceIds : [deviceIds].filter(Boolean);

  let cancelCount = 0;
  ids.forEach((id) => {
    const dev = db.getDevices().find((d) => d.id === id);
    if (dev && (dev.otaStatus === 'PENDING' || dev.otaStatus === 'DOWNLOADING')) {
      dev.otaStatus = 'IDLE';
      dev.otaTargetFirmwareId = undefined;
      dev.otaProgress = 0;
      dev.otaErrorMessage = 'Yönetici tarafından iptal edildi';
      db.updateDevice(dev.id, {
        otaStatus: 'IDLE',
        otaTargetFirmwareId: undefined,
        otaProgress: 0,
        otaErrorMessage: 'Yönetici tarafından iptal edildi',
      });
      cancelCount++;
    }
  });

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: `${cancelCount} cihaz için OTA güncellemesi iptal edildi.` });
});

// ==========================================
// 2. HARDWARE DEVICE OTA PROTOCOL (Strict X-API-Key Only)
// ==========================================

// Helper to authenticate device strictly via X-API-Key header
function authenticateHardwareDevice(req: Request): Device | null {
  const apiKey = (
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  ).toString().trim();

  if (!apiKey) return null;
  const dev = db.deviceRepository.getDeviceByApiKey(apiKey);
  if (!dev || dev.isSimulated) return null;
  return dev;
}

// POST or GET /api/ota/check - Device checks for pending OTA firmware update
otaRouter.all('/check', (req: Request, res: Response) => {
  const dev = authenticateHardwareDevice(req);
  if (!dev) {
    return res.status(401).json({
      error: 'unauthorized_device',
      message: 'Yetkisiz erişim. Cihaz OTA kontrolü için geçerli "X-API-Key" başlığı zorunludur.',
    });
  }

  const headers = req.headers;
  const body = req.body || {};

  // Update hardware runtime metadata
  const deviceType = (headers['x-device-type'] || body.deviceType || body.device_type)?.toString().trim();
  const roleKey = (headers['x-role-key'] || body.roleKey || body.role_key)?.toString().trim();
  const hardwareModel = (headers['x-hardware-model'] || body.hardwareModel || body.hardware_model)?.toString().trim();
  const currentFirmwareVersion = (headers['x-firmware-version'] || body.firmwareVersion || body.firmware_version)?.toString().trim();

  const updates: Partial<Device> = {
    lastSeen: new Date().toISOString(),
    status: 'online',
    otaLastCheckAt: new Date().toISOString(),
  };

  if (deviceType) updates.deviceType = deviceType;
  if (roleKey) updates.roleKey = roleKey;
  if (hardwareModel) updates.hardwareModel = hardwareModel;
  if (currentFirmwareVersion) updates.firmwareVersion = currentFirmwareVersion;

  db.updateDevice(dev.id, updates);

  // Check if explicit target firmware exists
  let targetFw: Firmware | undefined;
  if (dev.otaTargetFirmwareId) {
    targetFw = db.getFirmwareById(dev.otaTargetFirmwareId);
  }

  // Automatic SemVer update check if no explicit job is active
  if (!targetFw && dev.roleKey) {
    const activeFws = db.getFirmwares().filter(
      (f) =>
        f.isActive &&
        f.roleKey.toUpperCase() === (dev.roleKey || '').toUpperCase() &&
        (f.deviceType.toLowerCase() === (dev.deviceType || dev.type || '').toLowerCase() || f.deviceType === 'all')
    );

    if (activeFws.length > 0) {
      activeFws.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
      const newest = activeFws[0];
      if (dev.firmwareVersion !== newest.version && isValidSemver(newest.version)) {
        targetFw = newest;
      }
    }
  }

  if (targetFw && targetFw.isActive) {
    const downloadUrl = `/api/firmwares/${targetFw.id}/download`;
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

  return res.json({
    updateAvailable: false,
    message: 'Cihaz firmware sürümü güncel.',
    currentVersion: dev.firmwareVersion || 'v1.0.0',
    roleKey: dev.roleKey || 'GENERIC',
    checkIntervalSeconds: 300,
  });
});

// POST /api/ota/status - Device reports OTA download, flash, and success/failure progress
otaRouter.post('/status', (req: Request, res: Response) => {
  const dev = authenticateHardwareDevice(req);
  if (!dev) {
    return res.status(401).json({
      error: 'unauthorized_device',
      message: 'Yetkisiz erişim. Cihaz OTA durum bildirimi için geçerli "X-API-Key" başlığı zorunludur.',
    });
  }

  const { status, progressPercent, errorMessage, newVersion, firmwareId } = req.body || {};

  if (!status || !['PENDING', 'DOWNLOADING', 'FLASHING', 'SUCCESS', 'UPDATED', 'FAILED', 'ERROR'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz OTA durum değeri (status).' });
  }

  const updates: Partial<Device> = {
    lastSeen: new Date().toISOString(),
    status: 'online',
    otaUpdatedAt: new Date().toISOString(),
  };

  const normalizedStatus = status === 'UPDATED' ? 'SUCCESS' : status === 'ERROR' ? 'FAILED' : status;

  if (normalizedStatus === 'DOWNLOADING' || normalizedStatus === 'FLASHING') {
    updates.otaStatus = 'DOWNLOADING';
    updates.otaProgress = normalizedStatus === 'FLASHING' ? 95 : Math.min(100, Math.max(0, Number(progressPercent) || 0));
  } else if (normalizedStatus === 'SUCCESS') {
    updates.otaStatus = 'SUCCESS';
    updates.otaProgress = 100;
    updates.otaTargetFirmwareId = undefined;
    if (newVersion) {
      updates.firmwareVersion = String(newVersion);
    } else if (firmwareId) {
      const fw = db.getFirmwareById(firmwareId);
      if (fw) updates.firmwareVersion = fw.version;
    }
  } else if (normalizedStatus === 'FAILED') {
    updates.otaStatus = 'FAILED';
    updates.otaErrorMessage = errorMessage || 'OTA Güncelleme Hatası';
  }

  db.updateDevice(dev.id, updates);

  // Update corresponding OTA deployment job in history
  const jobs = db.getOtaJobs().filter((j) => j.deviceId === dev.id && j.status !== 'SUCCESS');
  if (jobs.length > 0) {
    const job = jobs[jobs.length - 1];
    if (normalizedStatus === 'DOWNLOADING' || normalizedStatus === 'FLASHING') {
      job.status = 'DOWNLOADING';
      job.progressPercent = normalizedStatus === 'FLASHING' ? 95 : Math.min(100, Math.max(0, Number(progressPercent) || 0));
    } else if (normalizedStatus === 'SUCCESS') {
      job.status = 'SUCCESS';
      job.progressPercent = 100;
      job.completedAt = new Date().toISOString();
    } else if (normalizedStatus === 'FAILED') {
      job.status = 'FAILED';
      job.errorMessage = errorMessage || 'OTA Güncelleme Hatası';
    }
    db.saveOtaJob(job);
    (db.postgresRepo as any)?.saveOtaJob?.(job)?.catch?.(() => {});
  }

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({
    success: true,
    message: 'Cihaz OTA durumu kaydedildi.',
    otaStatus: updates.otaStatus,
    firmwareVersion: updates.firmwareVersion || dev.firmwareVersion,
  });
});
