import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
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

// GET /api/firmwares/public-key - Get server's Ed25519 public key for firmware verification
firmwareRouter.get('/public-key', (_req: Request, res: Response) => {
  const keys = getEd25519KeyPair();
  res.json({
    publicKeyPem: keys.publicKeyPem,
    publicKeyHex: keys.publicKeyHex,
  });
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
  const { sha256, signatureHex } = signBinaryBuffer(binaryBuffer);
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

// POST /api/firmwares/upload - Multipart / Stream upload for large binaries (Admin only)
firmwareRouter.post('/upload', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;

  try {
    const contentType = req.headers['content-type'] || '';
    let name = (req.query.name || req.headers['x-firmware-name'] || '').toString();
    let deviceType = (req.query.deviceType || req.headers['x-firmware-device-type'] || '').toString();
    let roleKey = (req.query.roleKey || req.headers['x-firmware-role-key'] || '').toString();
    let hardwareModel = (req.query.hardwareModel || req.headers['x-firmware-hardware-model'] || 'ALL').toString();
    let version = (req.query.version || req.headers['x-firmware-version'] || '').toString();
    let description = (req.query.description || req.headers['x-firmware-description'] || '').toString();
    let minHardwareRevision = (req.query.minHardwareRevision || req.headers['x-firmware-min-hardware-revision'] || '').toString();

    let binaryBuffer: Buffer;

    if (contentType.includes('multipart/form-data')) {
      // Simple multipart/form-data parser for express stream
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const fullBuffer = Buffer.concat(chunks);
      
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';

      if (!boundary) {
        return res.status(400).json({ error: 'Geçersiz multipart boundary.' });
      }

      const parts = fullBuffer.toString('binary').split('--' + boundary);
      let foundBinary: Buffer | null = null;

      for (const part of parts) {
        if (part.includes('filename=')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const bodyBinary = part.substring(headerEnd + 4, part.length - 2);
            foundBinary = Buffer.from(bodyBinary, 'binary');
          }
        } else {
          // Parse text fields from multipart form
          if (part.includes('name="name"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) name = val.trim();
          }
          if (part.includes('name="deviceType"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) deviceType = val.trim();
          }
          if (part.includes('name="roleKey"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) roleKey = val.trim();
          }
          if (part.includes('name="hardwareModel"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) hardwareModel = val.trim();
          }
          if (part.includes('name="version"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) version = val.trim();
          }
          if (part.includes('name="description"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) description = val.trim();
          }
          if (part.includes('name="minHardwareRevision"')) {
            const val = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (val) minHardwareRevision = val.trim();
          }
        }
      }

      if (!foundBinary) {
        return res.status(400).json({ error: 'Yüklenen form verisinde .bin dosyası bulunamadı.' });
      }
      binaryBuffer = foundBinary;
    } else {
      // Octet stream direct binary upload
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      binaryBuffer = Buffer.concat(chunks);
    }

    if (!name || !deviceType || !roleKey || !version) {
      return res.status(400).json({
        error: 'Firmware adı, cihaz tipi, görev kimliği (roleKey) ve sürüm zorunludur.',
      });
    }

    if (!isValidSemver(version)) {
      return res.status(400).json({
        error: `Geçersiz SemVer sürüm formatı (${version}). Örnek: 1.0.0, v2.1.0`,
      });
    }

    const validation = validateEspBinary(binaryBuffer);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { sha256, signatureHex } = signBinaryBuffer(binaryBuffer);
    const id = `fw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const filePath = saveFirmwareFileToDisk(id, binaryBuffer);

    const newFirmware: Firmware = {
      id,
      name: name.trim(),
      deviceType: deviceType.trim().toLowerCase(),
      roleKey: roleKey.trim().toUpperCase(),
      hardwareModel: hardwareModel ? hardwareModel.trim().toUpperCase() : 'ALL',
      version: version.trim(),
      description: description ? description.trim() : '',
      filePath,
      binarySize: binaryBuffer.length,
      sha256,
      signature: signatureHex,
      minHardwareRevision: minHardwareRevision ? minHardwareRevision.trim() : undefined,
      isActive: true,
      uploadedBy: user.name || user.email,
      created_at: new Date().toISOString(),
    };

    db.saveFirmware(newFirmware);

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
  } catch (err: any) {
    res.status(500).json({ error: `Firmware yükleme hatası: ${err.message}` });
  }
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
    // Device must have an active assigned OTA job for this specific firmware ID!
    const activeJob = db.getOtaJobs().find(
      (j) =>
        j.deviceId === dev!.id &&
        j.firmwareId === fw.id &&
        ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING'].includes(j.status)
    );

    const isAssignedToDevice = dev.otaTargetFirmwareId === fw.id || activeJob !== undefined;
    const isTokenMatch = downloadToken && (dev.otaDownloadToken === downloadToken || activeJob?.downloadToken === downloadToken);

    if (!isAssignedToDevice && !isTokenMatch) {
      return res.status(403).send('Bu cihaz için istenen firmware atanmış aktif bir OTA güncelleme görevi bulunmuyor.');
    }

    // Exact model & revision checks (Requirements 9 & 10)
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
      return res.status(403).send(`Uyumsuz Donanım Modeli (Cihaz: ${devModel}, Firmware: ${fw.hardwareModel}). Exact model match required.`);
    }
    if (!isHardwareRevisionCompatible(dev.hardwareRevision, fw.minHardwareRevision)) {
      return res.status(403).send(`Donanım revizyonu yetersiz (Cihaz: ${dev.hardwareRevision || 'bilinmiyor'}, Gerekli En Az: ${fw.minHardwareRevision}).`);
    }

    // Update state to DOWNLOADING and consume single-use token upon download
    if (activeJob) {
      activeJob.status = 'DOWNLOADING';
      activeJob.downloadStartedAt = new Date().toISOString();
      activeJob.updatedAt = new Date().toISOString();
      db.saveOtaJob(activeJob);
    }
    dev.otaStatus = 'DOWNLOADING';
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

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', binaryBuffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fw.roleKey}_${fw.version}.bin"`);
  res.setHeader('X-SHA256', fw.sha256);
  res.setHeader('X-Signature', fw.signature || '');
  res.setHeader('X-Public-Key', keys.publicKeyPem.replace(/\n/g, '\\n'));
  res.setHeader('X-Version', fw.version);
  res.setHeader('X-Role-Key', fw.roleKey);
  res.setHeader('X-Device-Type', fw.deviceType);

  res.send(binaryBuffer);
});


