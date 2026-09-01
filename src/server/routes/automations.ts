import { Router } from 'express';
import { db } from '../db.js';
import { authenticateUser } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  
  const automations = db.getAutomations(user.role === 'admin' ? undefined : user.id);
  res.json(automations);
});

router.post('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const data = req.body;

  // Security checks
  if (user.role !== 'admin' && data.tenantId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized to create automation for other tenant.' });
  }

  // Ensure devices belong to tenant
  const devices = db.getDevices(user.role === 'admin' ? undefined : user.id);
  if (!devices.some(d => d.id === data.trigger.deviceId)) {
    return res.status(403).json({ error: 'Trigger device not found or unauthorized.' });
  }
  if (!devices.some(d => d.id === data.action.deviceId)) {
    return res.status(403).json({ error: 'Action device not found or unauthorized.' });
  }

  const newAuth = db.createAutomation(data);
  res.status(201).json(newAuth);
});

router.put('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const autoId = req.params.id;
  const data = req.body;

  const existing = db.getAutomations().find(a => a.id === autoId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (user.role !== 'admin' && existing.tenantId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  // Ensure devices belong to tenant
  const devices = db.getDevices(user.role === 'admin' ? undefined : user.id);
  if (data.trigger?.deviceId && !devices.some(d => d.id === data.trigger.deviceId)) {
    return res.status(403).json({ error: 'Trigger device not found or unauthorized.' });
  }
  if (data.action?.deviceId && !devices.some(d => d.id === data.action.deviceId)) {
    return res.status(403).json({ error: 'Action device not found or unauthorized.' });
  }

  const updated = db.updateAutomation(autoId, data);
  res.json(updated);
});

router.delete('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!;
  const autoId = req.params.id;

  const existing = db.getAutomations().find(a => a.id === autoId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (user.role !== 'admin' && existing.tenantId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  db.deleteAutomation(autoId);
  res.json({ success: true });
});

export const automationsRouter = router;
