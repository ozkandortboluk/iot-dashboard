import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Firmware, Device } from '../../types.js';
import { isValidSemver } from './ota.js';

export const firmwareRouter = Router();

// Helper to strip heavy binary data from public/admin firmware payloads
function sanitizeFirmware(fw: Firmware): Omit<Firmware, 'binaryData'> {
  const meta = { ...fw };
  delete meta.binaryData;
  return meta;
}

// ==========================================
// FIRMWARE MANAGEMENT ENDPOINTS (Admin & System)
// ==========================================

// GET /api/firmwares - List all firmwares (Excludes bulky binaryData)
firmwareRouter.get('/', authenticateUser, (_req: Request, res: Response) => {
  const firmwares = db.getFirmwares().map(sanitizeFirmware);
  res.json(firmwares);
});

// GET /api/firmwares/:id - Get firmware details (Excludes binaryData)
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
    if (binaryBuffer.length < 16) {
      return res.status(400).json({
        error: 'Yüklenen firmware ikili dosyası çok küçük veya geçersiz.',
      });
    }
  } catch {
    return res.status(400).json({
      error: 'Firmware binary verisi geçerli base64 formatında değil.',
    });
  }

  const sha256 = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
  const binarySize = binaryBuffer.length;

  const newFirmware: Firmware = {
    id: `fw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    deviceType: deviceType.trim().toLowerCase(),
    roleKey: roleKey.trim().toUpperCase(),
    hardwareModel: hardwareModel ? hardwareModel.trim() : 'ALL',
    version: version.trim(),
    description: description ? description.trim() : '',
    binaryData: binaryBuffer.toString('base64'),
    binarySize,
    sha256,
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
    `Yeni Firmware Yüklendi: ${newFirmware.name} (${newFirmware.version}) - ${newFirmware.roleKey}`,
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
  broadcast('firmwares:updated', db.getFirmwares().map(sanitizeFirmware));

  res.json({ success: true, message: 'Firmware başarıyla silindi.' });
});

// GET /api/firmwares/:id/download - Secure binary download for authenticated devices & admin sessions
firmwareRouter.get('/:id/download', (req: Request, res: Response) => {
  const { id } = req.params;

  // Strict Authentication: Either authenticated user session OR authenticated device X-API-Key header (NO query string keys allowed)
  const authHeader = req.headers['authorization'];
  const devApiKey = (req.headers['x-api-key'] || req.headers['x-token'] || '').toString().trim();

  let isAuthenticated = false;
  let dev: Device | undefined;

  if (devApiKey) {
    dev = db.deviceRepository.getDeviceByApiKey(devApiKey);
    if (dev && !dev.isSimulated) {
      isAuthenticated = true;
    }
  } else if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const verified = db.verifySession(token);
    if (verified?.user) {
      isAuthenticated = true;
    }
  }

  if (!isAuthenticated) {
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
    // Check roleKey or deviceType compatibility
    const devRole = (dev.roleKey || '').toUpperCase();
    const devType = (dev.deviceType || dev.type || '').toLowerCase();
    const fwRole = fw.roleKey.toUpperCase();
    const fwType = fw.deviceType.toLowerCase();

    if (devRole && devRole !== fwRole) {
      return res.status(403).send(`Uyumsuz Firmware Görev Kimliği (Cihaz: ${devRole}, Firmware: ${fwRole}).`);
    }
    if (devType && devType !== fwType && fwType !== 'all') {
      return res.status(403).send(`Uyumsuz Donanım Tipi (Cihaz: ${devType}, Firmware: ${fwType}).`);
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
