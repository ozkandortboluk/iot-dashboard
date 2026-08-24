import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { alarmEngine } from '../services/alarmEngine.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Active Alarms Endpoints
router.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const requestedUserId = (req.query.tenantId as string) || currentUser.id;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;
  res.json(db.getAlarms(targetUserId, currentUser.role === 'admin' ? targetCustomerId : currentUser.id));
});

router.post('/:id/acknowledge', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  alarmEngine.acknowledge(req.params.id, currentUser);
  res.json({ success: true, message: 'Alarm onaylandı.' });
});

router.post('/:id/silence', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { durationMinutes = 15 } = req.body;
  alarmEngine.silence(req.params.id, Number(durationMinutes), currentUser);
  res.json({ success: true, message: `Alarm ${durationMinutes} dakika boyunca susturuldu.` });
});

router.post('/:id/resolve', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  alarmEngine.resolve(req.params.id, currentUser);
  res.json({ success: true, message: 'Alarm manuel olarak kapatıldı.' });
});

export const alarmsRouter = router;

// Threshold Rules Router
const rulesRouter = Router();

rulesRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;
  res.json(db.getRules(currentUser.id, targetCustomerId));
});

rulesRouter.post('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const newRule = db.createRule(req.body, currentUser);
  broadcast('rules:updated', db.getRules());
  res.status(201).json(newRule);
});

rulesRouter.put('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const updated = db.updateRule(req.params.id, req.body, currentUser);
  if (!updated) return res.status(403).json({ error: 'Kural bulunamadı veya güncelleme yetkiniz yok.' });
  broadcast('rules:updated', db.getRules());
  res.json(updated);
});

rulesRouter.delete('/:id', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const deleted = db.deleteRule(req.params.id, currentUser);
  if (!deleted) return res.status(403).json({ error: 'Kural bulunamadı veya silme yetkiniz yok.' });
  broadcast('rules:updated', db.getRules());
  res.json({ success: true, message: 'Kural silindi.' });
});

rulesRouter.put('/:id/toggle', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { enabled } = req.body;
  const toggled = db.toggleRule(req.params.id, Boolean(enabled), currentUser);
  if (!toggled) return res.status(403).json({ error: 'Kural bulunamadı veya yetkiniz yok.' });
  broadcast('rules:updated', db.getRules());
  res.json({ success: true });
});

export { rulesRouter };

// Notifications Router
const notificationsRouter = Router();

notificationsRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const requestedUserId = (req.query.tenantId as string) || currentUser.id;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;
  res.json(db.getNotifications(targetUserId, currentUser.role === 'admin' ? targetCustomerId : currentUser.id));
});

notificationsRouter.put('/:id/read', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  db.markNotificationRead(req.params.id, currentUser.id);
  res.json({ success: true });
});

notificationsRouter.post('/clear', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { userId } = req.body;
  const targetUserId = currentUser.role === 'admin' ? (userId || currentUser.id) : currentUser.id;

  db.markAllNotificationsRead(targetUserId);
  res.json({ success: true });
});

export { notificationsRouter };

// Notification Queue & Dispatch Router
const notificationQueueRouter = Router();

notificationQueueRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;
  const queue = db.getNotificationQueue(currentUser.id, targetCustomerId);
  res.json(queue);
});

notificationQueueRouter.post('/:id/retry', authenticateUser, async (req, res) => {
  try {
    const updatedItem = db.retryQueueItem(req.params.id);
    res.json({ item: updatedItem, message: 'Gönderim tekrar denemeye alındı.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Tekrar deneme başarısız.' });
  }
});

notificationQueueRouter.post('/clear', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  db.clearQueue(currentUser.id);
  res.json({ success: true, message: 'Gönderim kuyruğu temizlendi.' });
});

export { notificationQueueRouter };

// Dispatch Logs Router
const dispatchLogsRouter = Router();
dispatchLogsRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;
  const logs = db.getDispatchLogs(currentUser.id, targetCustomerId);
  res.json(logs);
});
export { dispatchLogsRouter };

// Notification Services Router
const notificationServicesRouter = Router();

notificationServicesRouter.get('/', authenticateUser, (req, res) => {
  res.json(db.getServiceConfig());
});

notificationServicesRouter.put('/', authenticateUser, requireAdmin, (req, res) => {
  try {
    const updatedConfig = db.updateServiceConfig(req.body);
    res.json({ config: updatedConfig, message: 'Bildirim servis ayarları kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ayarlar kaydedilemedi.' });
  }
});

notificationServicesRouter.post('/test', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { channel, recipient, title, message } = req.body;

  if (!channel || !recipient) {
    return res.status(400).json({ error: 'Kanal ve alıcı adresi zorunludur.' });
  }

  try {
    const dispatchResult = await db.testChannelDispatch(
      channel,
      recipient,
      title || 'Test Bildirimi',
      message || 'Bu bir IoT platformu test iletisidir.',
      { id: currentUser.id, name: currentUser.name }
    );
    res.json(dispatchResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Test gönderimi yapılamadı.' });
  }
});

export { notificationServicesRouter };

// Audit Logs Router
const auditLogsRouter = Router();
auditLogsRouter.get('/', authenticateUser, requireAdmin, (req, res) => {
  res.json(db.getAuditLogs());
});
export { auditLogsRouter };

// Dashboard Widgets Router
const dashboardRouter = Router();

dashboardRouter.get('/widgets', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const requestedUserId = (req.query.tenantId as string) || currentUser.id;
  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;

  const dash = db.getDashboard(targetUserId);
  res.json(dash);
});

dashboardRouter.put('/widgets', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { userId, widgets, title } = req.body;
  const targetUserId = currentUser.role === 'admin' ? (userId || currentUser.id) : currentUser.id;

  const updated = db.saveDashboardWidgets(targetUserId, widgets, title);
  broadcast('dashboard:layout', updated);
  res.json(updated);
});

dashboardRouter.post('/widgets/reset', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { userId } = req.body;
  const targetUserId = currentUser.role === 'admin' ? (userId || currentUser.id) : currentUser.id;

  const resetDash = db.resetDashboard(targetUserId);
  broadcast('dashboard:layout', resetDash);
  res.json(resetDash);
});

export { dashboardRouter };
