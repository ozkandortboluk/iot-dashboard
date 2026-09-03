import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { broadcast, sendOtaCommandViaWs, isDeviceConnectedViaWs } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { OtaDeploymentJob, Device, Firmware } from '../../types.js';
import {
  isValidSemver,
  compareSemver,
  isTargetVersionNewer,
  isHardwareModelCompatible,
  isHardwareRevisionCompatible,
} from '../utils/semver.js';
import { getEd25519KeyPair, compareTokensSafe, hashDownloadToken } from '../utils/ota-crypto.js';

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

// Valid state machine transitions map
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['DOWNLOADING', 'CANCELLED', 'FAILED', 'EXPIRED'],
  DOWNLOADING: ['FLASHING', 'CANCELLED', 'FAILED', 'EXPIRED'],
  FLASHING: ['VERIFYING', 'REBOOTING', 'CANCELLED', 'FAILED', 'EXPIRED'],
  VERIFYING: ['REBOOTING', 'SUCCESS', 'CANCELLED', 'FAILED', 'EXPIRED'],
  REBOOTING: ['SUCCESS', 'CANCELLED', 'FAILED', 'EXPIRED'],
  SUCCESS: [],
  FAILED: ['PENDING'],
  CANCELLED: ['PENDING'],
  EXPIRED: ['PENDING'],
};

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

  if (user.role !== 'admin') {
    const userDeviceIds = new Set(db.getDevices().filter((d) => d.tenantId === user.id).map((d) => d.id));
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

  const simulatedTarget = targetDevices.find((d) => d.isSimulated);
  if (simulatedTarget) {
    return res.status(400).json({
      error: 'Sanal cihazlar için fiziksel OTA dağıtımı yapılamaz. Yalnızca gerçek fiziksel cihazları seçiniz.',
    });
  }

  // Exact model & revision compatibility check (Requirement 9)
  const incompatibleDevices = targetDevices.filter((d) => {
    const roleOk = !d.roleKey || d.roleKey.toUpperCase() === fw.roleKey.toUpperCase();
    const typeOk = !d.deviceType || d.deviceType.toLowerCase() === fw.deviceType.toLowerCase() || fw.deviceType === 'all';
    const modelOk = isHardwareModelCompatible(d.hardwareModel, fw.hardwareModel);
    const revOk = isHardwareRevisionCompatible(d.hardwareRevision, fw.minHardwareRevision);
    return !(roleOk && typeOk && modelOk && revOk);
  });

  if (incompatibleDevices.length > 0 && targetScope === 'selected') {
    return res.status(400).json({
      error: `Seçilen cihazlardan ${incompatibleDevices.length} tanesi bu firmware (Model: ${fw.hardwareModel}, Tipi: ${fw.deviceType}, Görev: ${fw.roleKey}, MinRev: ${fw.minHardwareRevision || 'yok'}) ile donanım/revizyon olarak uyumsuz!`,
      incompatibleDevices: incompatibleDevices.map((d) => ({
        id: d.id,
        name: d.name,
        hardwareModel: d.hardwareModel,
        hardwareRevision: d.hardwareRevision,
        roleKey: d.roleKey,
        deviceType: d.deviceType || d.type,
      })),
    });
  }

  const validDevices = targetDevices.filter((d) => {
    const roleOk = !d.roleKey || d.roleKey.toUpperCase() === fw.roleKey.toUpperCase();
    const typeOk = !d.deviceType || d.deviceType.toLowerCase() === fw.deviceType.toLowerCase() || fw.deviceType === 'all';
    const modelOk = isHardwareModelCompatible(d.hardwareModel, fw.hardwareModel);
    const revOk = isHardwareRevisionCompatible(d.hardwareRevision, fw.minHardwareRevision);
    return roleOk && typeOk && modelOk && revOk;
  });

  if (validDevices.length === 0) {
    return res.status(400).json({
      error: `Cihazların donanım modeli, role_key veya revizyon değerleri seçilen firmware (${fw.hardwareModel} / ${fw.deviceType} / ${fw.roleKey}) ile uyuşmuyor.`,
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
    createdJobs.push(job);

    // If device is actively connected via WebSocket, send OTA trigger immediately
    if (isDeviceConnectedViaWs(dev.id)) {
      const downloadUrl = `/api/ota/download/${downloadToken}`;
      sendOtaCommandViaWs(dev.id, fw.version, downloadUrl, fw.sha256, {
        signature: fw.signature,
        keyId: fw.keyId,
        downloadToken,
      });
    }
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

// POST /api/ota/retry - Manually retry a failed/expired job (Requirement 8)
otaRouter.post('/retry', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { jobId } = req.body;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId alanı zorunludur.' });
  }

  const jobs = db.getOtaJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) {
    return res.status(404).json({ error: 'OTA görevi bulunamadı.' });
  }

  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const downloadToken = `otatkn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  job.status = 'PENDING';
  job.progressPercent = 0;
  job.errorMessage = undefined;
  job.downloadToken = downloadToken;
  job.attemptCount = 0;
  job.nextRetryAt = undefined;
  job.expiresAt = expiresAtIso;
  job.updatedAt = nowIso;

  db.saveOtaJob(job);

  const dev = db.getDeviceById(job.deviceId);
  if (dev) {
    dev.otaStatus = 'PENDING';
    dev.otaProgress = 0;
    dev.otaErrorMessage = undefined;
    dev.otaTargetFirmwareId = job.firmwareId;
    dev.otaDownloadToken = downloadToken;
    db.updateDevice(dev.id, dev);
  }


  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: 'OTA görevi yeniden başlatıldı.', job });
});

// POST /api/ota/cancel - Cancel pending/downloading OTA for device(s) (Admin only)
otaRouter.post('/cancel', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { deviceIds } = req.body;
  const ids: string[] = Array.isArray(deviceIds) ? deviceIds : [deviceIds].filter(Boolean);

  let cancelCount = 0;
  const nowIso = new Date().toISOString();

  ids.forEach((id) => {
    const dev = db.getDevices().find((d) => d.id === id);
    if (dev) {
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
      });
    }
  });

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({ success: true, message: `${cancelCount} cihaz için OTA güncellemesi iptal edildi.` });
});

// ==========================================
// 2. HARDWARE DEVICE OTA PROTOCOL (Strict X-API-Key Only)
// ==========================================

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

  let targetFw: Firmware | undefined;
  if (dev.otaTargetFirmwareId) {
    targetFw = db.getFirmwareById(dev.otaTargetFirmwareId);
  }

  // Automatic SemVer update check
  if (!targetFw && dev.roleKey) {
    const activeFws = db.getFirmwares().filter(
      (f) =>
        f.isActive &&
        f.roleKey.toUpperCase() === (dev.roleKey || '').toUpperCase() &&
        (f.deviceType.toLowerCase() === (dev.deviceType || dev.type || '').toLowerCase() || f.deviceType === 'all')
    );

    if (activeFws.length > 0) {
      activeFws.sort((a, b) => compareSemver(b.version, a.version));
      const newest = activeFws[0];

      if (isValidSemver(newest.version) && isTargetVersionNewer(newest.version, dev.firmwareVersion || '0.0.0')) {
        targetFw = newest;
      }
    }
  }

  if (targetFw && targetFw.isActive) {
    // Exact model and revision check
    const devModel = updates.hardwareModel || dev.hardwareModel;
    const devRev = updates.hardwareRevision || dev.hardwareRevision;

    if (!isHardwareModelCompatible(devModel, targetFw.hardwareModel)) {
      return res.json({
        updateAvailable: false,
        message: `Uyumsuz donanım modeli. Cihaz: ${devModel || 'bilinmiyor'}, Firmware Hedefi: ${targetFw.hardwareModel}`,
        checkIntervalSeconds: 600,
      });
    }

    if (!isHardwareRevisionCompatible(devRev, targetFw.minHardwareRevision)) {
      return res.json({
        updateAvailable: false,
        message: `Yetersiz donanım revizyonu. Cihaz: ${devRev || 'bilinmiyor'}, Gerekli En Az: ${targetFw.minHardwareRevision}`,
        checkIntervalSeconds: 600,
      });
    }

    const token = dev.otaDownloadToken || `otatkn_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
    const tokenHash = hashDownloadToken(token);

    let activeJob = db.getOtaJobs().find(
      (j) => j.deviceId === dev.id && j.firmwareId === targetFw!.id && ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
    );

    const nowIso = new Date().toISOString();
    let nonce = activeJob?.bootNonce;
    if (!nonce) {
      nonce = `boot_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
    }
    const nonceHash = hashDownloadToken(nonce);

    if (!activeJob) {
      activeJob = {
        id: `otajob_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        firmwareId: targetFw.id,
        firmwareVersion: targetFw.version,
        firmwareName: targetFw.name,
        deviceId: dev.id,
        deviceName: dev.name,
        deviceType: dev.deviceType || dev.type,
        roleKey: dev.roleKey || targetFw.roleKey,
        targetScope: 'auto',
        status: 'PENDING',
        progressPercent: 0,
        downloadToken: token,
        downloadTokenHash: tokenHash,
        bootNonce: nonce,
        bootNonceHash: nonceHash,
        attemptCount: 0,
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        initiatedBy: 'SYSTEM_AUTO',
        created_at: nowIso,
      };
      db.saveOtaJob(activeJob);
    } else {
      activeJob.downloadToken = token;
      activeJob.downloadTokenHash = tokenHash;
      activeJob.bootNonce = nonce;
      activeJob.bootNonceHash = nonceHash;
      db.saveOtaJob(activeJob);
    }

    db.updateDevice(dev.id, { otaDownloadToken: token, otaTargetFirmwareId: targetFw.id, otaStatus: activeJob.status as any });

    const downloadUrl = `/api/firmwares/${targetFw.id}/download?token=${token}`;
    const keys = getEd25519KeyPair();
    const effectiveKeyId = targetFw.keyId || keys.keyId;

    return res.json({
      updateAvailable: true,
      jobId: activeJob.id,
      firmwareId: targetFw.id,
      firmwareName: targetFw.name,
      version: targetFw.version,
      keyId: effectiveKeyId,
      deviceType: targetFw.deviceType,
      roleKey: targetFw.roleKey,
      hardwareModel: targetFw.hardwareModel,
      sha256: targetFw.sha256,
      signature: targetFw.signature || '',
      publicKeyPem: keys.publicKeyPem, // Informational only: Root of Trust must be pinned on device
      binarySize: targetFw.binarySize,
      downloadUrl,
      downloadToken: token,
      bootNonce: nonce,
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

// POST /api/ota/status - Device reports state machine progress (Requirement 3 & 5)
otaRouter.post('/status', (req: Request, res: Response) => {
  const dev = authenticateHardwareDevice(req);
  if (!dev) {
    return res.status(401).json({
      error: 'unauthorized_device',
      message: 'Yetkisiz erişim. Cihaz OTA durum bildirimi için geçerli "X-API-Key" başlığı zorunludur.',
    });
  }

  const { status, progressPercent, errorMessage, firmwareId, jobId, downloadToken } = req.body || {};

  // Requirement 3: Enforce mandatory fields
  if (!jobId || !firmwareId || !downloadToken || !status) {
    return res.status(400).json({
      error: 'Eksik parametre. OTA durum bildirimi için "jobId", "firmwareId", "downloadToken" ve "status" alanlarının tümü zorunludur.',
    });
  }

  const activeJobs = db.getOtaJobs().filter(
    (j) => j.deviceId === dev.id && ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
  );

  const activeJob = activeJobs.find((j) => j.id === jobId);

  if (!activeJob) {
    return res.status(400).json({
      error: `ID'si (${jobId}) olan aktif bir OTA güncelleme görevi bulunamadı veya görev iptal edilmiş/süresi dolmuş.`,
    });
  }

  if (firmwareId !== activeJob.firmwareId) {
    return res.status(400).json({
      error: `Uyumsuz firmwareId (${firmwareId} !== ${activeJob.firmwareId}).`,
    });
  }

  // Requirement 3: Timing-safe token comparison
  const isTokenMatch =
    compareTokensSafe(downloadToken, activeJob.downloadTokenHash || activeJob.downloadToken || '') ||
    compareTokensSafe(downloadToken, dev.otaDownloadToken || '');

  if (!isTokenMatch) {
    return res.status(403).json({
      error: 'Geçersiz veya eşleşmeyen downloadToken.',
    });
  }

  const normalizedStatus = status === 'UPDATED' ? 'SUCCESS' : status === 'ERROR' ? 'FAILED' : status;

  // Enforce valid state machine transitions
  const allowedNextStates = VALID_TRANSITIONS[activeJob.status] || [];
  if (normalizedStatus !== activeJob.status && !allowedNextStates.includes(normalizedStatus)) {
    return res.status(400).json({
      error: `Geçersiz durum geçişi: '${activeJob.status}' durumundan '${normalizedStatus}' durumuna doğrudan geçilemez.`,
      currentStatus: activeJob.status,
      allowedNextStates,
    });
  }

  // Reject direct fake SUCCESS via status endpoint! SUCCESS must be confirmed via /api/ota/confirm-boot after reboot
  if (normalizedStatus === 'SUCCESS') {
    return res.status(400).json({
      error: 'Sahte SUCCESS bildirimi reddedildi. Başarılı güncelleme yalnızca yeniden başlatma sonrası /api/ota/confirm-boot çağrısı ile onaylanabilir.',
    });
  }

  const nowIso = new Date().toISOString();
  activeJob.status = normalizedStatus as any;
  activeJob.progressPercent = Math.min(100, Math.max(0, Number(progressPercent) || activeJob.progressPercent));
  activeJob.updatedAt = nowIso;

  if (normalizedStatus === 'FAILED') {
    activeJob.errorMessage = errorMessage || 'OTA Güncelleme Hatası';
    activeJob.completedAt = nowIso;
  }

  db.saveOtaJob(activeJob);

  const updates: Partial<Device> = {
    lastSeen: nowIso,
    status: 'online',
    otaStatus: normalizedStatus as any,
    otaProgress: activeJob.progressPercent,
    otaUpdatedAt: nowIso,
  };

  if (normalizedStatus === 'FAILED') {
    updates.otaErrorMessage = activeJob.errorMessage;
    updates.otaTargetFirmwareId = undefined;
  }

  db.updateDevice(dev.id, updates);

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({
    success: true,
    message: 'OTA durumu güncellendi.',
    jobId: activeJob.id,
    currentStatus: activeJob.status,
    progressPercent: activeJob.progressPercent,
  });
});

// POST /api/ota/confirm-boot - Post-reboot boot confirmation endpoint (Requirement 4 & 6)
otaRouter.post('/confirm-boot', (req: Request, res: Response) => {
  const dev = authenticateHardwareDevice(req);
  if (!dev) {
    return res.status(401).json({
      error: 'unauthorized_device',
      message: 'Yetkisiz erişim. Boot doğrulaması için geçerli "X-API-Key" başlığı zorunludur.',
    });
  }

  const { jobId, firmwareVersion, bootNonce } = req.body || {};

  if (!jobId || !firmwareVersion || !bootNonce) {
    return res.status(400).json({
      error: 'Eksik parametre. Boot doğrulaması için "jobId", "firmwareVersion" ve "bootNonce" alanlarının tümü zorunludur.',
    });
  }

  const jobs = db.getOtaJobs().filter((j) => j.deviceId === dev.id);
  const targetJob = jobs.find((j) => j.id === jobId);

  if (!targetJob) {
    return res.status(400).json({ error: `ID'si (${jobId}) olan OTA görevi bulunamadı.` });
  }

  // Requirement 4: Restrict to REBOOTING -> SUCCESS transition ONLY!
  if (targetJob.status !== 'REBOOTING') {
    return res.status(400).json({
      error: `Geçersiz boot onay durumu. Boot doğrulaması yalnızca 'REBOOTING' durumundaki görevler için yapılabilir (Mevcut Durum: ${targetJob.status}).`,
    });
  }

  // Requirement 4: Verify bootNonce!
  const isNonceMatch = compareTokensSafe(bootNonce, targetJob.bootNonceHash || targetJob.bootNonce || '');
  if (!isNonceMatch) {
    return res.status(403).json({ error: 'Geçersiz veya eşleşmeyen bootNonce.' });
  }

  if (targetJob.bootNonceUsedAt) {
    return res.status(403).json({ error: 'Bu bootNonce daha önce kullanılmıştır (Replay attack engellendi).' });
  }

  const cleanReportedVersion = String(firmwareVersion).trim().replace(/^[vV]/, '');
  const cleanTargetVersion = String(targetJob.firmwareVersion).trim().replace(/^[vV]/, '');

  if (compareSemver(cleanReportedVersion, cleanTargetVersion) !== 0) {
    targetJob.status = 'FAILED';
    targetJob.errorMessage = `Boot doğrulama hatası: Cihaz bildirilen sürüm (${cleanReportedVersion}) ile hedef sürüm (${cleanTargetVersion}) eşleşmiyor. Rollback tetiklendi.`;
    targetJob.completedAt = new Date().toISOString();
    targetJob.bootNonceUsedAt = new Date().toISOString();
    db.saveOtaJob(targetJob);

    db.updateDevice(dev.id, {
      otaStatus: 'FAILED',
      otaErrorMessage: targetJob.errorMessage,
      otaTargetFirmwareId: undefined,
    });

    broadcast('devices:updated', db.getDevices());
    broadcast('ota:updated', { jobs: db.getOtaJobs() });

    return res.status(400).json({
      error: 'Boot doğrulaması başarısız! Sürüm uyuşmazlığı nedeniyle rollback gerçekleşti.',
      reportedVersion: cleanReportedVersion,
      targetVersion: cleanTargetVersion,
    });
  }

  // Successful boot confirmation!
  const nowIso = new Date().toISOString();
  targetJob.status = 'SUCCESS';
  targetJob.progressPercent = 100;
  targetJob.bootNonceUsedAt = nowIso;
  targetJob.bootConfirmedAt = nowIso;
  targetJob.completedAt = nowIso;
  targetJob.updatedAt = nowIso;
  db.saveOtaJob(targetJob);

  db.updateDevice(dev.id, {
    firmwareVersion: cleanReportedVersion,
    otaStatus: 'SUCCESS',
    otaProgress: 100,
    otaTargetFirmwareId: undefined,
    otaDownloadToken: undefined,
    otaErrorMessage: undefined,
    otaUpdatedAt: nowIso,
  });

  db.addAuditLog(
    'SYSTEM',
    dev.name,
    `Cihaz OTA Boot Başarıyla Onaylandı: ${dev.name} (${cleanReportedVersion}) - Job: ${targetJob.id} [Nonce: ${bootNonce}]`,
    'medium'
  );

  broadcast('devices:updated', db.getDevices());
  broadcast('ota:updated', { jobs: db.getOtaJobs() });

  res.json({
    success: true,
    message: 'Boot doğrulaması başarılı. OTA güncellemesi başarıyla tamamlandı ve rollback iptal edildi.',
    verifiedVersion: cleanReportedVersion,
    jobId: targetJob.id,
  });
});


