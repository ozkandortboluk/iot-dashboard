import express, { Router } from 'express';
import { systemLogger } from '../services/systemLogger.service.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';
import type { SystemEventLevel, SystemEventCategory } from '../../types.js';

export const systemLogsRouter = Router();

/**
 * GET /api/system-logs
 * List and filter system and error logs with pagination and stats.
 * Strictly restricted to Admin users (Rule 1).
 */
systemLogsRouter.get('/', authenticateUser, requireAdmin, (req, res) => {
  const level = req.query.level as SystemEventLevel | undefined;
  const category = req.query.category as SystemEventCategory | undefined;
  const search = req.query.search as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  const result = systemLogger.getEvents({
    level,
    category,
    search,
    startDate,
    endDate,
    limit,
    offset,
  });

  const config = systemLogger.getConfig();

  res.json({
    success: true,
    ...result,
    config,
  });
});

/**
 * GET /api/system-logs/settings
 * Retrieve current logging configuration and status.
 */
systemLogsRouter.get('/settings', authenticateUser, requireAdmin, (req, res) => {
  const config = systemLogger.getConfig();
  res.json({
    success: true,
    config,
  });
});

/**
 * POST /api/system-logs/settings
 * Toggle logging on/off and update retention / minimum level settings.
 */
systemLogsRouter.post('/settings', authenticateUser, requireAdmin, (req, res) => {
  const { enabled, minLevel, logToFile, maxInMemory, deduplication, deduplicateWindowMs } = req.body || {};

  const updatedConfig = systemLogger.updateConfig({
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    minLevel: minLevel as SystemEventLevel | undefined,
    logToFile: typeof logToFile === 'boolean' ? logToFile : undefined,
    maxInMemory: typeof maxInMemory === 'number' ? maxInMemory : undefined,
    deduplication: typeof deduplication === 'boolean' ? deduplication : undefined,
    deduplicateWindowMs: typeof deduplicateWindowMs === 'number' ? deduplicateWindowMs : undefined,
  });

  res.json({
    success: true,
    message: `Loglama sistemi ayarları güncellendi. Durum: ${updatedConfig.enabled ? 'Aktif' : 'Devre Dışı'}`,
    config: updatedConfig,
  });
});

/**
 * POST /api/system-logs/simplify
 * Cleans out redundant, repetitive and fluttering log events, keeping necessary errors and notifications.
 */
systemLogsRouter.post('/simplify', authenticateUser, requireAdmin, (req, res) => {
  const result = systemLogger.simplifyExistingLogs();
  res.json({
    success: true,
    message: `${result.removedCount} adet gereksiz/yinelenen log kaydı temizlendi ve sadeleştirildi. Kalan aktif kayıt: ${result.remainingCount}.`,
    ...result,
  });
});

/**
 * POST /api/system-logs/clear
 * Clear all in-memory events and truncate log files.
 */
systemLogsRouter.post('/clear', authenticateUser, requireAdmin, (req, res) => {
  systemLogger.clearEvents();
  res.json({
    success: true,
    message: 'Tüm sistem ve hata log kayıtları başarıyla temizlendi.',
  });
});

/**
 * POST /api/system-logs/test-error
 * Diagnostic test trigger to generate an artificial error or event and verify logging pipeline.
 */
systemLogsRouter.post('/test-error', authenticateUser, requireAdmin, (req, res) => {
  const { level = 'error', message, category = 'server' } = req.body || {};

  const simulatedStack = `SyntheticDiagnosticError: Test Tanı Hatası (Simüle Edilmiş Hata)
    at SystemDiagnostics.simulate (/api/system-logs/test-error)
    at SystemLogger.verify (/src/server/services/systemLogger.service.ts)
    [Tanı Kontrolü: Bu kayıt hata yakalama boru hattını doğrulamak için yapay olarak oluşturulmuştur]`;
  const logMessage = message || `Yönetici Tarafından Manuel Tetiklenen Tanı/Test Hatası [${new Date().toLocaleTimeString('tr-TR')}]`;

  const event = systemLogger.log(
    level as SystemEventLevel,
    category as SystemEventCategory,
    logMessage,
    {
      simulated: true,
      triggeredBy: (req as any).user?.email || 'admin',
      ip: req.ip || req.socket.remoteAddress,
      path: req.originalUrl,
      method: req.method,
      stack: simulatedStack,
    },
    'admin_diagnostics'
  );

  res.json({
    success: true,
    message: 'Test hata log kaydı başarıyla oluşturuldu ve sisteme kaydedildi.',
    event,
  });
});

/**
 * GET /api/system-logs/export
 * Download all current logs as a .json or .log file.
 */
systemLogsRouter.get('/export', authenticateUser, requireAdmin, (req, res) => {
  const format = (req.query.format as string) === 'log' ? 'log' : 'json';
  const { content, filename, mimeType } = systemLogger.exportLogs(format);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});

/**
 * POST /api/system-logs/client-error
 * Ingest uncaught frontend React / window errors with rate limiting, size capping, and strict truncation.
 */
systemLogsRouter.post('/client-error', express.json({ limit: '8kb' }), (req, res) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    // Rate limit: max 10 client error reports per minute per IP
    const rateLimit = rateLimiterService.checkIpRateLimit(`client_error:${clientIp}`, 10);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Çok fazla istemci hatası bildirimi gönderildi. Lütfen bekleyin.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }

    const { message, stack, url, componentStack, userAgent } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Geçersiz veya eksik log mesajı.' });
    }

    // Strict field truncation to prevent DoS via large strings
    const truncatedMessage = String(message).trim().slice(0, 300);
    const rawStack = stack || componentStack;
    const truncatedStack = rawStack && typeof rawStack === 'string' ? rawStack.slice(0, 1500) : undefined;
    const truncatedUrl = url && typeof url === 'string' ? url.slice(0, 255) : undefined;
    const truncatedUserAgent = userAgent && typeof userAgent === 'string' ? userAgent.slice(0, 255) : undefined;

    systemLogger.error(
      'client',
      `[İstemci/Web Arayüz Hatası] ${truncatedMessage}`,
      {
        stack: truncatedStack,
        url: truncatedUrl,
        userAgent: truncatedUserAgent,
        ip: clientIp,
      },
      'client_browser'
    );

    res.json({ success: true, logged: true });
  } catch {
    res.status(500).json({ error: 'İstemci logu kaydedilemedi.' });
  }
});
