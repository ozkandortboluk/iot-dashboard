import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db.js';
import { NetworkScanJob, NetworkPingResult, NetworkAgent } from '../../types.js';

export const networkRouter = Router();

// In-memory store for active scan jobs and field agents (for MVP/architecture)
const activeScans = new Map<string, NetworkScanJob>();
const connectedAgents = new Map<string, NetworkAgent>();

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
  
  const { subnet, agentId } = req.body;
  if (!subnet || typeof subnet !== 'string' || !subnet.includes('/')) {
    return res.status(400).json({ error: 'Geçerli bir subnet belirtilmelidir (Örn: 192.168.1.0/24)' });
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
  const { ip, agentId } = req.body;
  if (!ip || typeof ip !== 'string') {
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
      apiKey,
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

