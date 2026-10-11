import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import net from 'node:net';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { NetworkScanJob, NetworkPingResult, NetworkAgent } from '../../types.js';

export const networkRouter = Router();

// In-memory store for active scan jobs and field agents (for MVP/architecture)
const activeScans = new Map<string, NetworkScanJob>();
const connectedAgents = new Map<string, NetworkAgent>();
const MAX_PENDING_SCAN_JOBS = 100;

// Role check middleware for network ops
const requireNetworkAdminOrOperator = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
  if (authReq.user.role !== 'admin' && authReq.user.role !== 'operator') {
    return res.status(403).json({ error: 'Bu işlem için admin veya operatör yetkisi gereklidir.' });
  }
  next();
};

// 1. GET /api/network/discovered - Refreshes & returns the latest known device list
networkRouter.get('/discovered', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomer = currentUser.role === 'admin' ? (req.query.targetCustomerId as string | undefined) : undefined;
  
  const discovered = db.getDiscoveredDevices(currentUser.id, targetCustomer);
  
  // Rate limiting (simple) could be added here if needed
  db.addAuditLog(currentUser.id, currentUser.name, `Ağ cihaz listesi görüntülendi`, 'low');
  
  res.json(discovered);
});

// 2. POST /api/network/scans - Initiates a new async scan job on the customer's LAN via Field Agent
networkRouter.post('/scans', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const { subnet, agentId } = req.body || {};
  if (!subnet || typeof subnet !== 'string' || subnet.split('/').length !== 2 || !/^\d{1,2}$/.test(subnet.split('/')[1]) || Number(subnet.split('/')[1]) > 32 || net.isIP(subnet.split('/')[0]) !== 4) {
    return res.status(400).json({ error: 'Geçerli bir subnet belirtilmelidir (Örn: 192.168.1.0/24)' });
  }

  if (activeScans.size >= MAX_PENDING_SCAN_JOBS) {
    return res.status(429).json({ error: 'Ağ tarama görev kapasitesi dolu.' });
  }

  // Create an async job
  const jobId = `scan_${crypto.randomBytes(8).toString('hex')}`;
  
  const newJob: NetworkScanJob = {
    id: jobId,
    tenantId: currentUser.role === 'admin' ? (req.body.tenantId || currentUser.id) : currentUser.id,
    status: 'pending',
    subnet,
    progress: 0,
    discoveredDevices: [],
    agentId: agentId || 'auto', // In real app, route to specific field agent
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  activeScans.set(jobId, newJob);
  db.addAuditLog(currentUser.id, currentUser.name, `Yeni ağ taraması başlatıldı (${subnet})`, 'medium');

  // Broadcast to Field Agents via WebSocket or MQTT (Mocked here for now)
  // Simulate field agent taking the job...
  setTimeout(() => {
    const job = activeScans.get(jobId);
    if (job && job.status === 'pending') {
      job.status = 'in_progress';
      job.startedAt = new Date().toISOString();
      
      // Simulate progress updates from field agent
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        if (progress >= 100) {
          clearInterval(interval);
          job.progress = 100;
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          // In real app, agent reports discovered devices here
          activeScans.set(jobId, job);
          setTimeout(() => activeScans.delete(jobId), 5 * 60 * 1000).unref();
        } else {
          job.progress = progress;
          job.updatedAt = new Date().toISOString();
          activeScans.set(jobId, job);
        }
      }, 1000);
    }
  }, 500);

  res.status(202).json({
    message: 'Tarama görevi saha ajanına iletildi.',
    jobId,
    job: newJob
  });
});

// 3. GET /api/network/scans/:id - Gets the status of a specific scan job
networkRouter.get('/scans/:id', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const { id } = req.params;
  const job = activeScans.get(id);
  
  if (!job) {
    return res.status(404).json({ error: 'Tarama görevi bulunamadı.' });
  }

  // Role check for tenant
  const authReq = req as AuthenticatedRequest;
  if (authReq.user!.role !== 'admin' && job.tenantId !== authReq.user!.id) {
    return res.status(403).json({ error: 'Bu görevi görüntüleme yetkiniz yok.' });
  }

  res.json(job);
});

// 4. POST /api/network/ping - Issues a real ICMP ping (delegated to agent)
networkRouter.post('/ping', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const { ip, agentId } = req.body || {};
  if (!ip || typeof ip !== 'string' || net.isIP(ip) !== 4) {
    return res.status(400).json({ error: 'Geçerli bir IP adresi belirtilmelidir.' });
  }

  // Generate cryptographically secure task ID
  const taskId = crypto.randomBytes(8).toString('hex');
  
  // In a real implementation, this pushes a request to the field agent queue.
  // We'll simulate the agent's async response.
  
  res.status(202).json({
    message: 'Ping isteği kuyruğa alındı.',
    taskId
  });
});

// 5. GET /api/network/ping/:taskId - Fetches the ping result
networkRouter.get('/ping/:taskId', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const { taskId } = req.params;
  
  // Mock logic: immediately resolve with a fake but structured response representing field agent work.
  // In production, this would poll a redis queue or database for the agent's reply.
  
  const result: NetworkPingResult = {
    ip: 'unknown',
    success: true,
    timeMs: Math.floor(Math.random() * 20 + 2),
    output: `PING completed by field agent for task ${taskId}`
  };
  
  res.json(result);
});

// 6. POST /api/network/check-duplicate - Checks collisions for MAC, IP, or Device Name
networkRouter.post('/check-duplicate', authenticateUser, (req, res) => {
  const { mac, ip, name, excludeDeviceId, tenantId } = req.body;
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const targetTenant = currentUser.role === 'admin' ? (tenantId || currentUser.id) : currentUser.id;
  const result = db.checkDuplicateIdentity({
    mac,
    ip,
    name,
    excludeDeviceId,
    tenantId: targetTenant,
  });

  res.json(result);
});

// 7. POST /api/network/pair - Full Provisioning & Pairing Wizard Execution
networkRouter.post('/pair', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const {
    name,
    type,
    location,
    ipAddress,
    macAddress,
    pairingCode,
    method,
    tenantId,
    siteId,
    zoneId,
    groupId,
    tags,
    apiKey,
    collisionStrategy,
    targetDeviceIdToReplace,
  } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Cihaz adı belirtilmelidir.' });
  }

  const actor = {
    id: currentUser.id,
    name: currentUser.name,
    role: currentUser.role,
  };

  const result = await db.pairDevice(
    {
      name: name.trim(),
      type: type || 'ESP32',
      location: location || 'Merkez Tesis',
      ipAddress: ipAddress ? ipAddress.trim() : undefined,
      macAddress: macAddress ? macAddress.trim() : undefined,
      pairingCode: pairingCode ? pairingCode.trim() : undefined,
      method: method || 'manual',
      tenantId: currentUser.role === 'admin' ? tenantId : currentUser.id,
      siteId,
      zoneId,
      groupId,
      tags: Array.isArray(tags) ? tags : [],
      apiKey: apiKey && typeof apiKey === 'string' && apiKey.trim() && apiKey !== '__USE_CACHED_TOKEN__' && !apiKey.includes('USE_CACHED') && apiKey !== 'Yok'
        ? apiKey.trim()
        : undefined,
      collisionStrategy: collisionStrategy || 'reject',
      targetDeviceIdToReplace,
    },
    actor
  );

  if (!result.success) {
    return res.status(409).json(result);
  }

  res.status(201).json(result);
});

// 8. GET /api/network/pairing-history - Returns historical pairing audits
networkRouter.get('/pairing-history', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetTenant = currentUser.role === 'admin' ? (req.query.tenantId as string | undefined) : currentUser.id;

  const history = db.getPairingHistory(targetTenant);
  res.json(history);
});

// 9. PATCH /api/network/lifecycle - Updates discovered device lifecycle state
networkRouter.patch('/lifecycle', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const { target, state } = req.body;
  if (!target || !state) {
    return res.status(400).json({ error: 'target (mac/ip/code) ve state belirtilmelidir.' });
  }

  db.updateDiscoveredLifecycle(target, state);
  res.json({ success: true, message: `Cihaz yaşam döngüsü durumu ${state} olarak güncellendi.` });
});

// 10. DELETE /api/network/discovered/:target - Removes a specific node from the discovered pool
networkRouter.delete('/discovered/:target', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const { target } = req.params;
  if (!target) {
    return res.status(400).json({ error: 'Hedef (IP, MAC veya Kod) belirtilmelidir.' });
  }

  db.removeUnregisteredDevice(decodeURIComponent(target));
  broadcast('network:updated', db.getDiscoveredDevices());
  res.json({ success: true, message: 'Cihaz keşif havuzundan kaldırıldı.' });
});

// 11. POST /api/network/discovered/clear - Clears all unassigned/mock nodes from discovered pool
networkRouter.post('/discovered/clear', authenticateUser, requireNetworkAdminOrOperator, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetTenant = currentUser.role === 'admin' ? (req.body.tenantId as string | undefined) : currentUser.id;
  
  const clearedCount = db.clearUnregisteredDevices(targetTenant);
  broadcast('network:updated', db.getDiscoveredDevices());
  res.json({ success: true, count: clearedCount, message: `Keşif havuzu temizlendi (${clearedCount} adet kayıt silindi).` });
});

// 12. GET /api/network/archived - Returns all deleted/archived devices with preserved settings and compression stats
networkRouter.get('/archived', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetTenant = currentUser.role === 'admin' ? (req.query.tenantId as string | undefined) : currentUser.id;

  const archived = db.getArchivedDevices(currentUser.id, targetTenant);
  res.json(archived);
});

// 13. GET /api/network/archived/:id/telemetry - Decompresses and returns preserved historical telemetry points
networkRouter.get('/archived/:id/telemetry', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { id } = req.params;

  const telemetry = db.getArchivedTelemetry(id, currentUser.id);
  res.json(telemetry);
});

// 14. POST /api/network/archived/:id/restore - Restores archived device back to active system with original configurations & telemetry
networkRouter.post('/archived/:id/restore', authenticateUser, requireNetworkAdminOrOperator, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { id } = req.params;

  try {
    const restored = await db.restoreArchivedDevice(id, currentUser.id, currentUser.name);
    if (!restored) {
      return res.status(404).json({ error: 'Arşivde belirtilen ID ile cihaz bulunamadı.' });
    }

    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());
    res.json({ success: true, device: restored, message: `"${restored.name}" cihazı tüm ayarları ve telemetrisiyle sisteme başarıyla geri yüklendi.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Cihaz geri yüklenirken hata oluştu.' });
  }
});

// 15. DELETE /api/network/archived/:id - Permanently deletes the device and its compressed archives
networkRouter.delete('/archived/:id', authenticateUser, requireNetworkAdminOrOperator, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { id } = req.params;

  try {
    const deleted = await db.permanentlyDeleteArchivedDevice(id, currentUser.id, currentUser.name);
    if (!deleted) {
      return res.status(404).json({ error: 'Arşivde silinecek cihaz bulunamadı.' });
    }

    res.json({ success: true, message: 'Cihaz ve tüm arşiv verileri kalıcı olarak silindi.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Cihaz kalıcı olarak silinirken hata oluştu.' });
  }
});

// 15b. POST /api/network/archived/bulk-delete - Permanently deletes multiple archived devices
networkRouter.post('/archived/bulk-delete', authenticateUser, requireNetworkAdminOrOperator, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Silinecek cihaz ID listesi geçerli değil.' });
  }

  try {
    const count = await db.bulkDeleteArchivedDevices(ids, currentUser.id, currentUser.name);
    res.json({ success: true, count, message: `Seçilen ${count} adet arşivlenmiş cihaz kalıcı olarak silindi.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Toplu silme işlemi sırasında hata oluştu.' });
  }
});

// 15c. POST /api/network/archived/bulk-restore - Restores multiple archived devices
networkRouter.post('/archived/bulk-restore', authenticateUser, requireNetworkAdminOrOperator, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Geri yüklenecek cihaz ID listesi geçerli değil.' });
  }

  try {
    const restored = await db.bulkRestoreArchivedDevices(ids, currentUser.id, currentUser.name);
    broadcast('devices:updated', db.getDevices());
    broadcast('network:updated', db.getDiscoveredDevices());
    res.json({ success: true, count: restored.length, devices: restored, message: `Seçilen ${restored.length} cihaz tüm ayarları ve telemetrisiyle başarıyla sisteme geri yüklendi.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Toplu geri yükleme işlemi sırasında hata oluştu.' });
  }
});

// 16. POST /api/network/archived/clear - Clears all archived devices
networkRouter.post('/archived/clear', authenticateUser, requireNetworkAdminOrOperator, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetTenant = currentUser.role === 'admin' ? (req.body.tenantId as string | undefined) : currentUser.id;

  try {
    const count = await db.clearArchivedDevices(currentUser.id, targetTenant);
    res.json({ success: true, count, message: `Arşiv temizlendi (${count} adet kayıt tamamen kaldırıldı).` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Arşiv temizlenirken hata oluştu.' });
  }
});

