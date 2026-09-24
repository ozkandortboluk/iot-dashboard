import { Router, type Request, type Response } from 'express';
import { serverStatusService } from '../services/serverStatus.service.js';
import { authenticateUser, requireAdmin, requireAdminOrStaff, type AuthenticatedRequest } from '../middleware/auth.js';
import { systemLogger } from '../services/systemLogger.service.js';

export const serverStatusRouter = Router();

// GET /api/server/status (or /api/server/live-status)
serverStatusRouter.get(['/status', '/live-status'], async (req: Request, res: Response) => {
  try {
    const status = await serverStatusService.getServerStatus();
    res.json(status);
  } catch (err: any) {
    systemLogger.error('server', `Sunucu durumu alınamadı: ${err?.message || err}`);
    res.status(500).json({
      error: 'Sunucu durumu verileri toplanamadı.',
      details: err?.message || String(err),
    });
  }
});

// GET /api/server/ping
serverStatusRouter.get('/ping', (req: Request, res: Response) => {
  res.json({
    status: 'pong',
    serverTime: Date.now(),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// POST /api/server/gc (Admin only)
serverStatusRouter.post('/gc', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = serverStatusService.triggerGarbageCollection();
    systemLogger.info('server', `Yönetici (${req.user?.name || req.user?.email}) tarafından bellek optimizasyonu (GC) tetiklendi.`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Bellek optimizasyonu yapılamadı: ' + (err?.message || err) });
  }
});

// POST /api/server/broadcast-ping (Staff or Admin)
serverStatusRouter.post('/broadcast-ping', authenticateUser, requireAdminOrStaff, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = serverStatusService.broadcastWsPing();
    res.json({
      success: true,
      message: `${result.count} aktif WebSocket istemcisine teşhis sinyali iletildi.`,
      clientCount: result.count,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'WebSocket yayını başarısız: ' + (err?.message || err) });
  }
});
