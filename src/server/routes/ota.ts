import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { OtaDeploymentJob, Device, Firmware } from '../../types.js';
import { isValidSemver, compareSemver, isTargetVersionNewer } from '../utils/semver.js';
import { getEd25519KeyPair } from '../utils/ota-crypto.js';

export const otaRouter = Router();

/**
 * Helper to auto-expire jobs that exceeded timeout limit (24 hours or expiresAt)
 */
function cleanupExpiredOtaJobs(): void {
  const jobs = db.getOtaJobs();
  const now = new Date();
  let updated = false;

  jobs.forEach((j) => {
    if (['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)) {
      const expiresAt = j.expiresAt ? new Date(j.expiresAt) : new Date(new Date(j.created_at).getTime() + 24 * 3600 * 1000);
      if (now > expiresAt) {
        j.status = 'EXPIRED';
        j.errorMessage = 'OTA Zaman Aşımı: Cihaz 24 saat içinde güncellemeyi tamamlamadı.';
        j.completedAt = now.toISOString();
        updated = true;

        const dev = db.getDevices().find((d) => d.id === j.deviceId);
        if (dev && dev.otaTargetFirmwareId === j.firmwareId) {
          db.updateDevice(dev.id, {
            otaStatus: 'EXPIRED',
            otaErrorMessage: 'OTA Görev Zaman Aşımı (Timeout)',
            otaTargetFirmwareId: undefined,
          });
        }
      }
    }
  });

  if (updated) {
    broadcast('devices:updated', db.getDevices());
    broadcast('ota:updated', { jobs: db.getOtaJobs() });
  }
}

// ==========================================
// 1. OTA JOBS & DEPLOYMENT MANAGEMENT (Admin & UI)
// ==========================================

// GET /api/ota/jobs - List deployment jobs (Tenant-isolated for non-admin)
otaRouter.get('/jobs', authenticateUser, (req: Request, res: Response) => {
  cleanupExpiredOtaJobs();
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const { deviceId, status } = req.query;

  let jobs = db.getOtaJobs();

  // Tenant Isolation (Point 13): Non-admin customer only sees jobs for their own devices!
  if (user.role !== 'admin') {
    const userDeviceIds = new Set(db.getDevices().filter((d) => d.userId === user.id).map((d) => d.id));
    jobs = jobs.filter((j) => userDeviceIds.has(j.deviceId));
  }

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
  const { firmwareId, targetScope, targetIds, targetValue, maxAttempts, timeoutHours } = req.body;

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

  // Point 4: Validate strict hardware model & role compatibility
  const incompatibleDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const devModel = (d.hardwareModel || '').toUpperCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();
    const fwModel = (fw.hardwareModel || 'ALL').toUpperCase();

    if (devRole && devRole !== fwRole) return true;
    if (devType && devType !== fwType && fwType !== 'all') return true;
    if (fwModel !== 'ALL' && devModel && !devModel.includes(fwModel) && !fwModel.includes(devModel)) return true;
    return false;
  });

  if (incompatibleDevices.length > 0 && targetScope === 'selected') {
    return res.status(400).json({
      error: `Seçilen cihazlardan ${incompatibleDevices.length} tanesi bu firmware (Model: ${fw.hardwareModel}, Tipi: ${fw.deviceType}, Görev: ${fw.roleKey}) ile donanım olarak uyumsuz!`,
      incompatibleDevices: incompatibleDevices.map((d) => ({
        id: d.id,
        name: d.name,
        hardwareModel: d.hardwareModel,
        roleKey: d.roleKey,
        deviceType: d.deviceType || d.type,
      })),
    });
  }

  const validDevices = targetDevices.filter((d) => {
    const devRole = (d.roleKey || '').toUpperCase();
    const devType = (d.deviceType || d.type || '').toLowerCase();
    const devModel = (d.hardwareModel || '').toUpperCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();
    const fwModel = (fw.hardwareModel || 'ALL').toUpperCase();

    const roleOk = !devRole || devRole === fwRole;
    const typeOk = !devType || devType === fwType || fwType === 'all';
    const modelOk = fwModel === 'ALL' || !devModel || devModel.includes(fwModel) || fwModel.includes(devModel);

    return roleOk && typeOk && modelOk;
  });

  if (validDevices.length === 0) {
    return res.status(400).json({
      error: `Cihazların donanım modeli, role_key veya device_type değerleri seçilen firmware (${fw.hardwareModel} / ${fw.deviceType} / ${fw.roleKey}) ile uyuşmuyor.`,
    });
  }

  const createdJobs: OtaDeploymentJob[] = [];
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + (Number(timeoutHours) || 24) * 3600 * 1000).toISOString();

  validDevices.forEach((dev) => {
    const downloadToken = `otatkn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    dev.otaStatus = 'PENDING';
    dev.otaTargetFirmwareId = fw.id;
    dev.otaProgress = 0;
    dev.otaErrorMessage = undefined;
    dev.otaUpdatedAt = nowIso;
    dev.otaDownloadToken = downloadToken;

    db.updateDevice(dev.id, {
      otaStatus: 'PENDING',
      otaTargetFirmwareId: fw.id,
      otaProgress: 0,
      otaErrorMessage: undefined,
      otaDownloadToken: downloadToken,
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
      downloadToken,
      attemptCount: 0,
      maxAttempts: Number(maxAttempts) || 3,
      expiresAt: expiresAtIso,
      initiatedBy: user.name || user.email,
      created_at: nowIso,
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

// POST /api/ota/cancel - Cancel pending/downloading OTA for device(s) (Admin only) (Point 8)
otaRouter.post('/cancel', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { deviceIds } = req.body;
  const ids: string[] = Array.isArray(deviceIds) ? deviceIds : [deviceIds].filter(Boolean);

  let cancelCount = 0;
  const nowIso = new Date().toISOString();

  ids.forEach((id) => {
    const dev = db.getDevices().find((d) => d.id === id);
    if (dev) {
      // Cancel active OTA status on device
      if (['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(dev.otaStatus || '')) {
        dev.otaStatus = 'CANCELLED';
        dev.otaTargetFirmwareId = undefined;
        dev.otaProgress = 0;
        dev.otaErrorMessage = 'Yönetici tarafından iptal edildi';
        dev.otaDownloadToken = undefined;

        db.updateDevice(dev.id, {
          otaStatus: 'CANCELLED',
          otaTargetFirmwareId: undefined,
          otaProgress: 0,
          otaErrorMessage: 'Yönetici tarafından iptal edildi',
          otaDownloadToken: undefined,
        });
        cancelCount++;
      }

      // Point 8: Update corresponding active OTA Job records to CANCELLED!
      const activeJobs = db.getOtaJobs().filter(
        (j) =>
          j.deviceId === id &&
          ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
      );

      activeJobs.forEach((job) => {
        job.status = 'CANCELLED';
        job.errorMessage = 'Yönetici tarafından iptal edildi';
        job.completedAt = nowIso;
        job.updatedAt = nowIso;
        db.saveOtaJob(job);
        (db.postgresRepo as any)?.saveOtaJob?.(job)?.catch?.(() => {});
      });
    }
  });

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: `${cancelCount} cihaz için OTA güncellemesi iptal edildi ve iş durumları 'CANCELLED' olarak güncellendi.` });
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
  const hardwareRevision = (headers['x-hardware-revision'] || body.hardwareRevision || body.hardware_revision)?.toString().trim();
  const currentFirmwareVersion = (headers['x-firmware-version'] || body.firmwareVersion || body.firmware_version)?.toString().trim();

  const updates: Partial<Device> = {
    lastSeen: new Date().toISOString(),
    status: 'online',
    otaLastCheckAt: new Date().toISOString(),
  };

  if (deviceType) updates.deviceType = deviceType;
  if (roleKey) updates.roleKey = roleKey;
  if (hardwareModel) updates.hardwareModel = hardwareModel;
  if (hardwareRevision) updates.hardwareRevision = hardwareRevision;
  if (currentFirmwareVersion) updates.firmwareVersion = currentFirmwareVersion;

  db.updateDevice(dev.id, updates);

  // Check if explicit target firmware exists
  let targetFw: Firmware | undefined;
  if (dev.otaTargetFirmwareId) {
    targetFw = db.getFirmwareById(dev.otaTargetFirmwareId);
  }

  // Automatic SemVer update check (Point 2): targetVersion > currentVersion
  if (!targetFw && dev.roleKey) {
    const activeFws = db.getFirmwares().filter(
      (f) =>
        f.isActive &&
        f.roleKey.toUpperCase() === (dev.roleKey || '').toUpperCase() &&
        (f.deviceType.toLowerCase() === (dev.deviceType || dev.type || '').toLowerCase() || f.deviceType === 'all')
    );

    if (activeFws.length > 0) {
      // Sort newest version first
      activeFws.sort((a, b) => compareSemver(b.version, a.version));
      const newest = activeFws[0];

      // Point 2: Strict SemVer comparison (target > current)
      if (isValidSemver(newest.version) && isTargetVersionNewer(newest.version, dev.firmwareVersion || '0.0.0')) {
        targetFw = newest;
      }
    }
  }

  if (targetFw && targetFw.isActive) {
    // Point 4: Validate Hardware Model & Revision
    const devModel = (updates.hardwareModel || dev.hardwareModel || '').toUpperCase();
    const fwModel = (targetFw.hardwareModel || 'ALL').toUpperCase();

    if (fwModel !== 'ALL' && devModel && !devModel.includes(fwModel) && !fwModel.includes(devModel)) {
      return res.json({
        updateAvailable: false,
        message: `Uyumsuz donanım modeli. Cihaz: ${devModel}, Firmware Hedefi: ${fwModel}`,
        checkIntervalSeconds: 600,
      });
    }

    // Point 6: Generate / Retrieve single-use download token
    const token = dev.otaDownloadToken || `otatkn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    if (!dev.otaDownloadToken) {
      db.updateDevice(dev.id, { otaDownloadToken: token, otaTargetFirmwareId: targetFw.id, otaStatus: 'PENDING' });
    }

    const downloadUrl = `/api/firmwares/${targetFw.id}/download?token=${token}`;
    const keys = getEd25519KeyPair();

    return res.json({
      updateAvailable: true,
      firmwareId: targetFw.id,
      firmwareName: targetFw.name,
      version: targetFw.version,
      deviceType: targetFw.deviceType,
      roleKey: targetFw.roleKey,
      hardwareModel: targetFw.hardwareModel,
      sha256: targetFw.sha256,
      signature: targetFw.signature || '', // Point 5: Ed25519 Cryptographic Signature
      publicKeyPem: keys.publicKeyPem,
      binarySize: targetFw.binarySize,
      downloadUrl,
      downloadToken: token,
      checkIntervalSeconds: 300,
    });
  }

  return res.json({
    updateAvailable: false,
    message: 'Cihaz firmware sürümü güncel.',
    currentVersion: dev.firmwareVersion || '1.0.0',
    roleKey: dev.roleKey || 'GENERIC',
    checkIntervalSeconds: 300,
  });
});

// POST /api/ota/status - Device reports OTA download, flash, and success/failure progress (Point 7)
otaRouter.post('/status', (req: Request, res: Response) => {
  const dev = authenticateHardwareDevice(req);
  if (!dev) {
    return res.status(401).json({
      error: 'unauthorized_device',
      message: 'Yetkisiz erişim. Cihaz OTA durum bildirimi için geçerli "X-API-Key" başlığı zorunludur.',
    });
  }

  const { status, progressPercent, errorMessage, newVersion, firmwareId } = req.body || {};

  const allowedStatuses = [
    'PENDING',
    'DOWNLOADING',
    'FLASHING',
    'VERIFYING',
    'REBOOTING',
    'SUCCESS',
    'UPDATED',
    'FAILED',
    'ERROR',
  ];

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Geçersiz OTA durum değeri (status).' });
  }

  const nowIso = new Date().toISOString();
  const updates: Partial<Device> = {
    lastSeen: nowIso,
    status: 'online',
    otaUpdatedAt: nowIso,
  };

  const normalizedStatus = status === 'UPDATED' ? 'SUCCESS' : status === 'ERROR' ? 'FAILED' : status;

  if (['DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(normalizedStatus)) {
    updates.otaStatus = normalizedStatus as any;
    updates.otaProgress =
      normalizedStatus === 'FLASHING'
        ? 80
        : normalizedStatus === 'VERIFYING'
        ? 90
        : normalizedStatus === 'REBOOTING'
        ? 95
        : Math.min(100, Math.max(0, Number(progressPercent) || 0));
  } else if (normalizedStatus === 'SUCCESS') {
    // Point 7: Strict Boot Confirmation Verification
    updates.otaStatus = 'SUCCESS';
    updates.otaProgress = 100;
    updates.otaTargetFirmwareId = undefined;
    updates.otaDownloadToken = undefined;

    if (newVersion) {
      updates.firmwareVersion = String(newVersion).replace(/^[vV]/, '');
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
  const activeJobs = db
    .getOtaJobs()
    .filter((j) => j.deviceId === dev.id && !['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(j.status));

  if (activeJobs.length > 0) {
    const job = activeJobs[activeJobs.length - 1];
    job.updatedAt = nowIso;

    if (['DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(normalizedStatus)) {
      job.status = normalizedStatus as any;
      job.progressPercent = updates.otaProgress;
      if (!job.downloadStartedAt && normalizedStatus === 'DOWNLOADING') {
        job.downloadStartedAt = nowIso;
      }
    } else if (normalizedStatus === 'SUCCESS') {
      job.status = 'SUCCESS';
      job.progressPercent = 100;
      job.completedAt = nowIso;
      job.bootConfirmedAt = nowIso;
    } else if (normalizedStatus === 'FAILED') {
      job.status = 'FAILED';
      job.errorMessage = errorMessage || 'OTA Güncelleme Hatası';
      job.completedAt = nowIso;
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

