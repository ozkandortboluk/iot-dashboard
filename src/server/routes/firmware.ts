import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Busboy from 'busboy';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Firmware, Device } from '../../types.js';
import { isValidSemver, isHardwareModelCompatible, isHardwareRevisionCompatible } from '../utils/semver.js';

import {
  signBinaryBuffer,
  validateEspBinary,
  saveFirmwareFileToDisk,
  readFirmwareFileFromDisk,
  getEd25519KeyPair,
  getTrustedPublicKeys,
  getPublicKeyByKeyId,
  compareTokensSafe,
  hashDownloadToken,
} from '../utils/ota-crypto.js';

export const firmwareRouter = Router();

// Helper to strip heavy binary data from public/admin firmware payloads
function sanitizeFirmware(fw: Firmware): Omit<Firmware, 'binaryData'> {
  const meta = { ...fw };
  delete meta.binaryData;
  return meta;
}

// ==========================================
// FIRMWARE MANAGEMENT ENDPOINTS (Admin & Tenant)
// ==========================================

// GET /api/firmwares - List all firmwares (Excludes bulky binaryData, Tenant-scoped for non-admin)
firmwareRouter.get('/', authenticateUser, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  
  let firmwares = db.getFirmwares();

  // Tenant Isolation: Non-admin customers only see active firmwares relevant to their devices
  if (user.role !== 'admin') {
    const userDevices = db.getDevices().filter((d) => d.userId === user.id);
    const userRoleKeys = new Set(userDevices.map((d) => (d.roleKey || '').toUpperCase()).filter(Boolean));
    const userDeviceTypes = new Set(userDevices.map((d) => (d.deviceType || d.type || '').toLowerCase()).filter(Boolean));

    firmwares = firmwares.filter(
      (fw) =>
        fw.isActive &&
        (userRoleKeys.has(fw.roleKey.toUpperCase()) ||
          userDeviceTypes.has(fw.deviceType.toLowerCase()) ||
          fw.deviceType === 'all')
    );
  }

  res.json(firmwares.map(sanitizeFirmware));
});

// GET /api/firmwares/public-key - Get server's Ed25519 public key (Informational / Audit Only)
firmwareRouter.get('/public-key', (_req: Request, res: Response) => {
  try {
    const keys = getEd25519KeyPair();
    const trustedKeys = getTrustedPublicKeys();
    res.json({
      keyId: keys.keyId,
      publicKeyPem: keys.publicKeyPem,
      publicKeyHex: keys.publicKeyHex,
      trustedKeys,
      securityNotice: 'Root of Trust Ed25519 public key(s) must be compiled directly into the hardware firmware at build-time. Network-provided keys are for administrative auditing and informational inspection only.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firmwares/keys/trusted - Get active and transitional trusted public keys for key rotation auditing
firmwareRouter.get('/keys/trusted', authenticateUser, (_req: Request, res: Response) => {
  const trustedKeys = getTrustedPublicKeys();
  res.json(trustedKeys);
});

// GET /api/firmwares/:id - Get firmware details
firmwareRouter.get('/:id', authenticateUser, (req: Request, res: Response) => {
  const { id } = req.params;
  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).json({ error: 'Firmware bulunamadı.' });
  }

  res.json(sanitizeFirmware(fw));
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

  // Enforce SemVer validation
  if (!isValidSemver(version)) {
    return res.status(400).json({
      error: `Geçersiz sürüm formatı (${version}). SemVer formatında olmalıdır (örnek: 1.0.0, v2.1.4, 1.2.0-beta.1).`,
    });
  }

  // Reject dummy or empty binary uploads
  if (!binaryData || typeof binaryData !== 'string' || binaryData.trim().length === 0) {
    return res.status(400).json({
      error: 'Firmware ikili binary dosyası (.bin) zorunludur. Boş veya sahte binary yüklenemez.',
    });
  }

  let base64String = binaryData.trim();
  if (base64String.includes(',')) {
    base64String = base64String.split(',')[1].trim();
  }

  let binaryBuffer: Buffer;
  try {
    binaryBuffer = Buffer.from(base64String, 'base64');
  } catch {
    return res.status(400).json({
      error: 'Firmware binary verisi geçerli base64 formatında değil.',
    });
  }

  // Real ESP Binary Magic Byte & Minimum Size Validation
  const validation = validateEspBinary(binaryBuffer);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Generate SHA-256 and Ed25519 Signature
  const { sha256, signatureHex, keyId } = signBinaryBuffer(binaryBuffer);
  const binarySize = binaryBuffer.length;
  const id = `fw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  // Save binary directly to disk to prevent RAM bloat
  const filePath = saveFirmwareFileToDisk(id, binaryBuffer);

  const newFirmware: Firmware = {
    id,
    name: name.trim(),
    deviceType: deviceType.trim().toLowerCase(),
    roleKey: roleKey.trim().toUpperCase(),
    hardwareModel: hardwareModel ? hardwareModel.trim() : 'ALL',
    version: version.trim(),
    description: description ? description.trim() : '',
    filePath,
    binarySize,
    sha256,
    signature: signatureHex,
    keyId: keyId || 'root_ed25519_v1',
    minHardwareRevision: minHardwareRevision ? minHardwareRevision.trim() : undefined,
    isActive: true,
    uploadedBy: user.name || user.email,
    created_at: new Date().toISOString(),
  };

  db.saveFirmware(newFirmware);
  (db.postgresRepo as any)?.saveFirmware?.(newFirmware)?.catch?.(() => {});

  db.addAuditLog(
    user.id,
    user.name,
    `Yeni Firmware Yüklendi ve Imzalandı: ${newFirmware.name} (${newFirmware.version}) - ${newFirmware.roleKey} [Ed25519 Imzalı]`,
    'high'
  );

  const safeFw = sanitizeFirmware(newFirmware);
  broadcast('firmware:created', safeFw);
  broadcast('firmwares:updated', db.getFirmwares().map(sanitizeFirmware));

  res.status(201).json(safeFw);
});

// PUT /api/firmwares/:id - Update firmware info/status (Admin only)
firmwareRouter.put('/:id', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).json({ error: 'Firmware bulunamadı.' });
  }

  const { name, description, isActive, minHardwareRevision } = req.body;
  if (name !== undefined) fw.name = String(name).trim();
  if (description !== undefined) fw.description = String(description).trim();
  if (isActive !== undefined) fw.isActive = Boolean(isActive);
  if (minHardwareRevision !== undefined) fw.minHardwareRevision = String(minHardwareRevision).trim();

  db.saveFirmware(fw);
  (db.postgresRepo as any)?.saveFirmware?.(fw)?.catch?.(() => {});

  const safeFw = sanitizeFirmware(fw);
  broadcast('firmware:updated', safeFw);
  broadcast('firmwares:updated', db.getFirmwares().map(sanitizeFirmware));

  res.json(safeFw);
});

// DELETE /api/firmwares/:id - Delete firmware safely (Admin only)
firmwareRouter.delete('/:id', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).json({ error: 'Firmware bulunamadı.' });
  }

  // Safe Deletion Guard (Point 10): Cannot delete if assigned to active OTA jobs or target devices!
  const assignedDevices = db.getDevices().filter((d) => d.otaTargetFirmwareId === id);
  const activeJobs = db.getOtaJobs().filter(
    (j) =>
      j.firmwareId === id &&
      ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
  );

  if (assignedDevices.length > 0 || activeJobs.length > 0) {
    return res.status(400).json({
      error: `Bu firmware sürümü şu anda ${assignedDevices.length} cihaza atanmış veya ${activeJobs.length} aktif OTA görevinde kullanılıyor. Silmeden önce pasifleştirin veya ilgili OTA görevlerini iptal edin.`,
      assignedDevicesCount: assignedDevices.length,
      activeJobsCount: activeJobs.length,
    });
  }

  // Clean file from disk if exists
  if (fw.filePath && fs.existsSync(fw.filePath)) {
    try {
      fs.unlinkSync(fw.filePath);
    } catch {
      // Ignore
    }
  }

  db.deleteFirmware(id);
  (db.postgresRepo as any)?.deleteFirmware?.(id)?.catch?.(() => {});

  broadcast('firmware:deleted', { id });
  broadcast('firmwares:updated', db.getFirmwares().map(sanitizeFirmware));

  res.json({ success: true, message: 'Firmware başarıyla silindi.' });
});

// POST /api/firmwares/upload - Streaming Busboy parser for binaries (Admin only)
firmwareRouter.post('/upload', authenticateUser, requireAdmin, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'İçerik türü multipart/form-data olmalıdır.' });
  }

  let busboy: any;
  try {
    busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 16 * 1024 * 1024, // 16 MB limit
        files: 1, // Single file
      },
    });
  } catch (err: any) {
    return res.status(400).json({ error: `Busboy başlatılamadı: ${err.message}` });
  }

  const fields: Record<string, string> = {};
  const tempId = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(process.cwd(), 'uploads', 'firmware', `${tempId}.tmp`);

  let fileWriteError: string | null = null;
  let fileUploaded = false;
  let fileTruncated = false;

  busboy.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  busboy.on('file', (fieldname, fileStream, info) => {
    const filename = info.filename || '';
    if (!filename.toLowerCase().endsWith('.bin')) {
      fileWriteError = 'Yalnızca .bin uzantılı ikili firmware dosyaları kabul edilir.';
      fileStream.resume();
      return;
    }

    fileUploaded = true;
    const writeStream = fs.createWriteStream(tempPath);

    fileStream.on('limit', () => {
      fileTruncated = true;
      fileWriteError = 'Dosya boyutu maksimum sınırı (16 MB) aştı.';
    });

    fileStream.pipe(writeStream);

    writeStream.on('error', (err) => {
      fileWriteError = `Geçici dosyaya yazma hatası: ${err.message}`;
    });
  });

  busboy.on('error', (err: any) => {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    if (!res.headersSent) {
      res.status(500).json({ error: `Yükleme hatası: ${err.message}` });
    }
  });

  busboy.on('finish', () => {
    if (fileWriteError || fileTruncated) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(400).json({ error: fileWriteError || 'Dosya yükleme sınırı aşıldı.' });
    }

    if (!fileUploaded || !fs.existsSync(tempPath)) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(400).json({ error: 'Yüklenen form verisinde geçerli .bin dosyası bulunamadı.' });
    }

    const name = fields.name || req.query.name || fields.firmwareName;
    const deviceType = fields.deviceType || req.query.deviceType;
    const roleKey = fields.roleKey || req.query.roleKey;
    const version = fields.version || req.query.version;
    const hardwareModel = fields.hardwareModel || req.query.hardwareModel || 'ALL';
    const description = fields.description || req.query.description || '';
    const minHardwareRevision = fields.minHardwareRevision || req.query.minHardwareRevision;

    if (!name || !deviceType || !roleKey || !version) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(400).json({
        error: 'Firmware adı, cihaz tipi, görev kimliği (roleKey) ve sürüm zorunludur.',
      });
    }

    if (!isValidSemver(String(version))) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(400).json({
        error: `Geçersiz SemVer sürüm formatı (${version}). Örnek: 1.0.0, v2.1.0`,
      });
    }

    let binaryBuffer: Buffer;
    try {
      binaryBuffer = fs.readFileSync(tempPath);
    } catch (err: any) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(500).json({ error: `Geçici dosya okunamadı: ${err.message}` });
    }

    const validation = validateEspBinary(binaryBuffer);
    if (!validation.valid) {
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
      return res.status(400).json({ error: validation.error });
    }

    const { sha256, signatureHex, keyId } = signBinaryBuffer(binaryBuffer);
    const id = `fw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const permPath = path.join(process.cwd(), 'uploads', 'firmware', `${id}.bin`);

    try {
      fs.renameSync(tempPath, permPath);
    } catch {
      fs.writeFileSync(permPath, binaryBuffer);
      if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
    }

    const newFirmware: Firmware = {
      id,
      name: String(name).trim(),
      deviceType: String(deviceType).trim().toLowerCase(),
      roleKey: String(roleKey).trim().toUpperCase(),
      hardwareModel: hardwareModel ? String(hardwareModel).trim().toUpperCase() : 'ALL',
      version: String(version).trim(),
      description: description ? String(description).trim() : '',
      filePath: permPath,
      binarySize: binaryBuffer.length,
      sha256,
      signature: signatureHex,
      keyId: keyId || 'root_ed25519_v1',
      minHardwareRevision: minHardwareRevision ? String(minHardwareRevision).trim() : undefined,
      isActive: true,
      uploadedBy: user.name || user.email,
      created_at: new Date().toISOString(),
    };

    db.saveFirmware(newFirmware);
    (db.postgresRepo as any)?.saveFirmware?.(newFirmware)?.catch?.(() => {});

    db.addAuditLog(
      user.id,
      user.name,
      `Firmware Akış Yüklemesi ile Oluşturuldu: ${newFirmware.name} (${newFirmware.version})`,
      'high'
    );

    const safeFw = sanitizeFirmware(newFirmware);
    broadcast('firmware:created', safeFw);
    broadcast('firmwares:updated', db.getFirmwares().map(sanitizeFirmware));

    res.status(201).json(safeFw);
  });

  req.pipe(busboy);
});

// GET /api/firmwares/:id/download - Secure binary download for authorized devices & user sessions
firmwareRouter.get('/:id/download', (req: Request, res: Response) => {
  const { id } = req.params;
  const downloadToken = (req.headers['x-ota-token'] || req.query.token || '').toString().trim();

  // Strict Authentication: Either authenticated user session OR authenticated device X-API-Key header
  const authHeader = req.headers['authorization'];
  const devApiKey = (req.headers['x-api-key'] || req.headers['x-token'] || '').toString().trim();

  let userReq: AuthenticatedRequest['user'] | undefined;
  let dev: Device | undefined;

  if (devApiKey) {
    dev = db.deviceRepository.getDeviceByApiKey(devApiKey);
  } else if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const verified = db.verifySession(token);
    if (verified?.user) {
      userReq = verified.user;
    }
  }

  if (!dev && !userReq) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Firmware indirmek için "X-API-Key" cihaz başlığı veya "Authorization: Bearer <token>" kullanıcı oturumu zorunludur.',
    });
  }

  const fw = db.getFirmwareById(id);
  if (!fw) {
    return res.status(404).send('Firmware bulunamadı.');
  }

  if (!fw.isActive) {
    return res.status(403).send('Bu firmware sürümü pasif durumdadır.');
  }

  if (dev) {
    // Exact Requirement 1: MUST have activeJob AND downloadToken AND valid token match!
    const activeJob = db.getOtaJobs().find(
      (j) =>
        j.deviceId === dev!.id &&
        j.firmwareId === fw.id &&
        ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
    );

    if (!activeJob) {
      return res.status(403).send('Bu cihaz için istenen firmware atanmış aktif bir OTA güncelleme görevi bulunmuyor.');
    }

    if (!downloadToken) {
      return res.status(403).send('Firmware indirmek için "downloadToken" (token query parametresi veya X-OTA-Token başlığı) zorunludur.');
    }

    const isTokenMatch =
      compareTokensSafe(downloadToken, activeJob.downloadTokenHash || activeJob.downloadToken || '') ||
      compareTokensSafe(downloadToken, dev.otaDownloadToken || '');

    if (!isTokenMatch) {
      return res.status(403).send('Geçersiz veya eşleşmeyen OTA indirme tokenı.');
    }

    // Exact Requirement 2: Token single-use and expiration checks!
    if (activeJob.downloadTokenUsedAt) {
      return res.status(403).send('Bu OTA indirme tokenı daha önce kullanılmıştır. İndirme için /api/ota/check üzerinden yeni bir token temin edin.');
    }

    if (activeJob.expiresAt && new Date() > new Date(activeJob.expiresAt)) {
      return res.status(403).send('OTA güncelleme ve indirme tokenının süresi dolmuştur.');
    }

    // Exact model & revision checks
    const devRole = (dev.roleKey || '').toUpperCase();
    const devType = (dev.deviceType || dev.type || '').toLowerCase();
    const devModel = (dev.hardwareModel || '').toUpperCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();

    if (devRole && devRole !== fwRole) {
      return res.status(403).send(`Uyumsuz Firmware Görev Kimliği (Cihaz: ${devRole}, Firmware: ${fwRole}).`);
    }
    if (devType && devType !== fwType && fwType !== 'all') {
      return res.status(403).send(`Uyumsuz Donanım Tipi (Cihaz: ${devType}, Firmware: ${fwType}).`);
    }
    if (!isHardwareModelCompatible(devModel, fw.hardwareModel)) {
      return res.status(403).send(`Uyumsuz Donanım Modeli (Cihaz: ${devModel}, Firmware: ${fw.hardwareModel}).`);
    }
    if (!isHardwareRevisionCompatible(dev.hardwareRevision, fw.minHardwareRevision)) {
      return res.status(403).send(`Donanım revizyonu yetersiz (Cihaz: ${dev.hardwareRevision || 'bilinmiyor'}, Gerekli En Az: ${fw.minHardwareRevision}).`);
    }

    // Consume single-use token immediately upon download initiation
    const nowIso = new Date().toISOString();
    activeJob.status = 'DOWNLOADING';
    activeJob.downloadTokenUsedAt = nowIso;
    activeJob.downloadStartedAt = nowIso;
    activeJob.updatedAt = nowIso;
    db.saveOtaJob(activeJob);

    dev.otaStatus = 'DOWNLOADING';
    dev.otaDownloadToken = undefined; // Consumed
    db.updateDevice(dev.id, dev);

  } else if (userReq) {
    if (userReq.role !== 'admin') {
      const userOwnsTargetDevice = db.getDevices().some(
        (d) => d.userId === userReq!.id && (d.otaTargetFirmwareId === fw.id || (d.roleKey || '').toUpperCase() === fw.roleKey.toUpperCase())
      );
      if (!userOwnsTargetDevice) {
        return res.status(403).send('Bu firmware dosyasına erişim yetkiniz bulunmamaktadır.');
      }
    }
  }

  let binaryBuffer: Buffer | null = null;
  if (fw.filePath) {
    binaryBuffer = readFirmwareFileFromDisk(fw.filePath);
  }
  if (!binaryBuffer && fw.binaryData) {
    binaryBuffer = Buffer.from(fw.binaryData, 'base64');
  }

  if (!binaryBuffer || binaryBuffer.length === 0) {
    return res.status(500).send('Firmware ikili binary dosyası okunamadı.');
  }

  const keys = getEd25519KeyPair();
  const effectiveKeyId = fw.keyId || keys.keyId;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', binaryBuffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fw.roleKey}_${fw.version}.bin"`);
  res.setHeader('X-Key-ID', effectiveKeyId);
  res.setHeader('X-SHA256', fw.sha256);
  res.setHeader('X-Signature', fw.signature || '');
  // Note: Hardware clients must verify against hardcoded compiled-in Root of Trust matching X-Key-ID.
  res.setHeader('X-Public-Key-Info-Only', keys.publicKeyPem.replace(/\n/g, '\\n'));
  res.setHeader('X-Public-Key', keys.publicKeyPem.replace(/\n/g, '\\n'));
  res.setHeader('X-Version', fw.version);
  res.setHeader('X-Role-Key', fw.roleKey);
  res.setHeader('X-Device-Type', fw.deviceType);

  res.send(binaryBuffer);
});


