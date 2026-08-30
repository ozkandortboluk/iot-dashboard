import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { alarmEngine } from '../services/alarmEngine.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { maskSecret } from '../utils/crypto.js';

const router = Router();

// Active Alarms Endpoints
router.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const requestedUserId = (req.query.tenantId as string) || currentUser.id;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;
  
  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    cursor: req.query.cursor as string | undefined,
    status: req.query.status as string | undefined,
    severity: req.query.severity as string | undefined,
    deviceId: req.query.deviceId as string | undefined,
    search: req.query.search as string | undefined,
  };

  const hasOptions = options.limit !== undefined || options.cursor !== undefined || options.status !== undefined || options.severity !== undefined || options.deviceId !== undefined || options.search !== undefined;

  const result = db.getAlarms(
    targetUserId,
    currentUser.role === 'admin' ? targetCustomerId : currentUser.id,
    hasOptions ? options : undefined
  );
  res.json(result);
});

// Alarm Events History Endpoint
router.get('/events', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const incidentId = req.query.incidentId as string | undefined;
  const alarmId = req.query.alarmId as string | undefined;
  const deviceId = req.query.deviceId as string | undefined;
  
  let events = db.data.alarmEvents || [];

  if (currentUser.role !== 'admin') {
    events = events.filter((e) => e.tenantId === currentUser.id);
  }

  if (incidentId) {
    events = events.filter((e) => e.incidentId === incidentId);
  }
  if (alarmId) {
    events = events.filter((e) => e.alarmId === alarmId);
  }
  if (deviceId) {
    events = events.filter((e) => e.deviceId === deviceId);
  }

  // Sort descending by creation date
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(events);
});

router.post('/:id/acknowledge', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const success = alarmEngine.acknowledge(req.params.id, currentUser);
    if (!success) {
      return res.status(404).json({ error: 'Alarm bulunamadı.' });
    }
    res.json({ success: true, message: 'Alarm onaylandı.' });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Yetkisiz işlem.' });
  }
});

router.post('/:id/ack', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const success = alarmEngine.acknowledge(req.params.id, currentUser);
    if (!success) {
      return res.status(404).json({ error: 'Alarm bulunamadı.' });
    }
    res.json({ success: true, message: 'Alarm onaylandı.' });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Yetkisiz işlem.' });
  }
});

router.post('/:id/silence', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { durationMinutes = 15 } = req.body;
  try {
    const success = alarmEngine.silence(req.params.id, Number(durationMinutes), currentUser);
    if (!success) {
      return res.status(404).json({ error: 'Alarm bulunamadı.' });
    }
    res.json({ success: true, message: `Alarm ${durationMinutes} dakika boyunca susturuldu.` });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Yetkisiz işlem.' });
  }
});

router.post('/:id/resolve', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const success = alarmEngine.resolve(req.params.id, currentUser);
    if (!success) {
      return res.status(404).json({ error: 'Alarm bulunamadı.' });
    }
    res.json({ success: true, message: 'Alarm manuel olarak kapatıldı.' });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Yetkisiz işlem.' });
  }
});

export const alarmsRouter = router;

// Threshold Rules Router
const rulesRouter = Router();

rulesRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    cursor: req.query.cursor as string | undefined,
    severity: req.query.severity as string | undefined,
    enabled: req.query.enabled as string | undefined,
    deviceId: req.query.deviceId as string | undefined,
    search: req.query.search as string | undefined,
  };

  const hasOptions = options.limit !== undefined || options.cursor !== undefined || options.severity !== undefined || options.enabled !== undefined || options.deviceId !== undefined || options.search !== undefined;

  const result = db.getRules(currentUser.id, targetCustomerId, hasOptions ? options : undefined);
  res.json(result);
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
  const incomingVersion = req.body.version !== undefined ? Number(req.body.version) : undefined;
  const result = db.updateRule(req.params.id, req.body, currentUser, incomingVersion);

  if (result.conflict) {
    return res.status(409).json({
      error: 'Versiyon uyuşmazlığı: Bu kural başka bir kullanıcı veya oturum tarafından güncellenmiş. Lütfen kuralı yeniden yükleyin.',
      currentVersion: result.currentVersion,
      rule: result.rule,
    });
  }

  if (result.forbidden) {
    return res.status(403).json({ error: 'Bu kuralı güncelleme yetkiniz bulunmuyor.' });
  }

  if (result.notFound || !result.success) {
    return res.status(404).json({ error: 'Kural bulunamadı.' });
  }

  broadcast('rules:updated', db.getRules());
  res.json(result.rule);
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

  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    cursor: req.query.cursor as string | undefined,
    status: req.query.status as string | undefined,
    channel: req.query.channel as string | undefined,
    search: req.query.search as string | undefined,
  };

  const hasOptions = options.limit !== undefined || options.cursor !== undefined || options.status !== undefined || options.channel !== undefined || options.search !== undefined;

  const queue = db.getNotificationQueue(currentUser.id, targetCustomerId, hasOptions ? options : undefined);
  res.json(queue);
});

notificationQueueRouter.post('/:id/retry', authenticateUser, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const currentUser = authReq.user!;
    const updatedItem = db.retryQueueItem(req.params.id, currentUser);
    broadcast('notification-queue:updated', db.getNotificationQueue());
    res.json({ item: updatedItem, message: 'Gönderim tekrar denemeye alındı.' });
  } catch (err: any) {
    const isAuthErr = err.message?.includes('Yetkisiz') || err.message?.includes('yetkiniz');
    res.status(isAuthErr ? 403 : 400).json({ error: err.message || 'Tekrar deneme başarısız.' });
  }
});

notificationQueueRouter.post('/clear', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  db.clearQueue(currentUser.id);
  broadcast('notification-queue:updated', db.getNotificationQueue());
  res.json({ success: true, message: 'Gönderim kuyruğu temizlendi.' });
});

export { notificationQueueRouter };

// Dispatch Logs Router
const dispatchLogsRouter = Router();
dispatchLogsRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const targetCustomerId = req.query.targetCustomerId as string | undefined;

  const options = {
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    cursor: req.query.cursor as string | undefined,
    status: req.query.status as string | undefined,
    channel: req.query.channel as string | undefined,
    search: req.query.search as string | undefined,
  };

  const hasOptions = options.limit !== undefined || options.cursor !== undefined || options.status !== undefined || options.channel !== undefined || options.search !== undefined;

  const logs = db.getDispatchLogs(currentUser.id, targetCustomerId, hasOptions ? options : undefined);
  res.json(logs);
});
export { dispatchLogsRouter };

// Notification Services Router (Admin-Only and Secret Masked)
const notificationServicesRouter = Router();

notificationServicesRouter.get('/', authenticateUser, requireAdmin, (_req, res) => {
  const config = db.getServiceConfig(true);

  res.json({
    ...config,
    whatsapp: {
      ...config.whatsapp,
      apiToken: config.whatsapp?.apiToken ? maskSecret(config.whatsapp.apiToken) : '',
    },
    telegram: {
      ...config.telegram,
      botToken: config.telegram?.botToken ? maskSecret(config.telegram.botToken) : '',
    },
    webhook: {
      ...config.webhook,
      secretHeader: config.webhook?.secretHeader ? maskSecret(config.webhook.secretHeader) : '',
    },
  });
});

notificationServicesRouter.put('/', authenticateUser, requireAdmin, (req, res) => {
  try {
    const updatedConfig = db.updateServiceConfig(req.body);
    const maskedConfig = {
      ...updatedConfig,
      whatsapp: {
        ...updatedConfig.whatsapp,
        apiToken: updatedConfig.whatsapp?.apiToken ? maskSecret(updatedConfig.whatsapp.apiToken) : '',
      },
      telegram: {
        ...updatedConfig.telegram,
        botToken: updatedConfig.telegram?.botToken ? maskSecret(updatedConfig.telegram.botToken) : '',
      },
      webhook: {
        ...updatedConfig.webhook,
        secretHeader: updatedConfig.webhook?.secretHeader ? maskSecret(updatedConfig.webhook.secretHeader) : '',
      },
    };
    res.json({ config: maskedConfig, message: 'Bildirim servis ayarları kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ayarlar kaydedilemedi.' });
  }
});

const testMessageRateLimits = new Map<string, { count: number; resetAt: number }>();

export function isSsrfSafeWebhookUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase();
    
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
    
    // Check local IPv4 ranges
    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const p1 = parseInt(ipv4Match[1], 10);
      const p2 = parseInt(ipv4Match[2], 10);
      
      // 10.0.0.0/8
      if (p1 === 10) return false;
      // 172.16.0.0/12
      if (p1 === 172 && p2 >= 16 && p2 <= 31) return false;
      // 192.168.0.0/16
      if (p1 === 192 && p2 === 168) return false;
      // 169.254.0.0/16
      if (p1 === 169 && p2 === 254) return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

notificationServicesRouter.post('/test', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { channel, recipient, title, message } = req.body;

  if (!channel || !recipient) {
    return res.status(400).json({ error: 'Kanal ve alıcı adresi zorunludur.' });
  }

  // Rate Limiting (Max 3 requests per minute)
  const now = Date.now();
  let rateRecord = testMessageRateLimits.get(currentUser.id);
  if (!rateRecord || rateRecord.resetAt < now) {
    rateRecord = { count: 0, resetAt: now + 60_000 };
  }
  rateRecord.count++;
  testMessageRateLimits.set(currentUser.id, rateRecord);

  if (rateRecord.count > 3) {
    return res.status(429).json({ error: 'Dakika başına test mesajı sınırını aştınız. Lütfen biraz bekleyin.' });
  }

  // SSRF Protection for Webhooks
  if (channel === 'webhook') {
    if (!isSsrfSafeWebhookUrl(recipient)) {
      return res.status(403).json({ error: 'Geçersiz veya engellenmiş webhook adresi (SSRF koruması).' });
    }
  }

  // Role Based Recipient Restriction
  if (currentUser.role !== 'admin') {
    let allowed = false;
    const recStr = String(recipient).trim().toLowerCase();

    if (channel === 'email') {
      if (
        (currentUser.email && currentUser.email.toLowerCase() === recStr) ||
        (currentUser.notificationEmail && currentUser.notificationEmail.toLowerCase() === recStr)
      ) {
        allowed = true;
      }
    } else if (channel === 'whatsapp' || channel === 'sms') {
      const phoneRegex = /[^0-9+]/g;
      const recPhone = String(recipient).replace(phoneRegex, '');
      const userPhone = currentUser.phone ? currentUser.phone.replace(phoneRegex, '') : '';
      const userWa = currentUser.whatsappNumber ? currentUser.whatsappNumber.replace(phoneRegex, '') : '';
      
      if (recPhone && (recPhone === userPhone || recPhone === userWa)) {
        allowed = true;
      }
    } else if (channel === 'telegram') {
      if (currentUser.telegramChatId && currentUser.telegramChatId.trim() === String(recipient).trim()) {
        allowed = true;
      }
    } else if (channel === 'webhook') {
      return res.status(403).json({ error: 'Webhook testi yalnızca yöneticiler tarafından yapılabilir.' });
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Müşteriler sadece kendi profilinde kayıtlı doğrulanmış adreslere test mesajı gönderebilir.' });
    }
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
  const requestedUserId = (req.query.userId as string) || (req.query.tenantId as string) || currentUser.id;
  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;

  const dash = db.getDashboard(targetUserId);
  res.json(dash);
});

dashboardRouter.put('/widgets', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { userId, tenantId, widgets, title } = req.body;
  const requestedUserId = userId || tenantId || currentUser.id;
  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;

  const updated = db.saveDashboardWidgets(targetUserId, widgets, title);
  broadcast('dashboard:layout', updated);
  res.json(updated);
});

dashboardRouter.post('/widgets/reset', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { userId, tenantId } = req.body;
  const requestedUserId = userId || tenantId || currentUser.id;
  const targetUserId = currentUser.role === 'admin' ? requestedUserId : currentUser.id;

  const resetDash = db.resetDashboard(targetUserId);
  broadcast('dashboard:layout', resetDash);
  res.json(resetDash);
});

export { dashboardRouter };
