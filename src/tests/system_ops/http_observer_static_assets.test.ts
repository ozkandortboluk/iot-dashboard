import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { systemLogger } from '../../server/services/systemLogger.service.js';

describe('Express HTTP Observer Static Asset Filter Test Suite', () => {
  let app: express.Express;
  let infoSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(systemLogger, 'info').mockImplementation(() => undefined as any);
    warnSpy = vi.spyOn(systemLogger, 'warn').mockImplementation(() => undefined as any);
    errorSpy = vi.spyOn(systemLogger, 'error').mockImplementation(() => undefined as any);

    app = express();

    // Re-create exact express_http_observer middleware logic from server.ts
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const isSystemLogPath = req.path.startsWith('/api/system-logs') || req.path.startsWith('/api/system/logs');
        const isHealthProbe = req.path === '/api/health/live' || req.path === '/api/health/ready' || req.path === '/health';
        const isStaticAsset =
          req.path === '/' ||
          req.path === '/index.html' ||
          req.path === '/favicon.svg' ||
          req.path === '/favicon.ico' ||
          req.path === '/site.webmanifest' ||
          req.path.startsWith('/assets/') ||
          req.path.startsWith('/public/') ||
          req.path.startsWith('/src/') ||
          req.path.startsWith('/@') ||
          req.path.startsWith('/node_modules/') ||
          /\.(js|jsx|ts|tsx|css|scss|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map|json|html)$/i.test(req.path);

        if (isSystemLogPath) return;
        if (isStaticAsset && res.statusCode < 400) return;

        const duration = Date.now() - start;
        const clientIp = String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
        const traceId = (req as any).traceId;
        const userId = (req as any).user?.id || (req as any).userId;

        const logDetails = {
          method: req.method,
          url: req.path,
          statusCode: res.statusCode,
          ip: clientIp,
          durationMs: duration,
          traceId,
          userId,
          userAgent: req.headers['user-agent'],
        };

        if (res.statusCode >= 500) {
          systemLogger.error(
            'http',
            `[HTTP ${res.statusCode}] ${req.method} ${req.path} (${duration}ms)`,
            logDetails,
            'express_http_observer'
          );
        } else if (res.statusCode >= 400) {
          systemLogger.warn(
            'http',
            `[HTTP ${res.statusCode}] ${req.method} ${req.path} (${duration}ms)`,
            logDetails,
            'express_http_observer'
          );
        } else {
          const isStateChangingMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
          const shouldLogSuccessfulRequest = isHealthProbe
            ? duration > 500
            : (isStateChangingMethod || duration > 1000);
          if (shouldLogSuccessfulRequest) {
            systemLogger.info(
              'http',
              `[HTTP ${res.statusCode}] ${req.method} ${req.path} (${duration}ms)`,
              logDetails,
              'express_http_observer'
            );
          }
        }
      });
      next();
    });

    // Dynamic test routes
    app.get('/favicon.svg', (req, res) => {
      if (req.headers['x-test-status'] === '304') {
        return res.status(304).end();
      }
      if (req.headers['x-test-status'] === '404') {
        return res.status(404).send('Not Found');
      }
      return res.status(200).send('<svg></svg>');
    });

    app.get('/site.webmanifest', (_req, res) => res.status(200).send('{}'));

    app.get('/assets/app.js', (req, res) => {
      if (req.headers['x-test-status'] === '304') {
        return res.status(304).end();
      }
      if (req.headers['x-test-status'] === '500') {
        return res.status(500).send('Server Error');
      }
      return res.status(200).send('console.log(1)');
    });

    app.get('/', (_req, res) => res.status(200).send('<html></html>'));
    app.get('/api/devices', (_req, res) => res.status(200).json([{ id: 1 }]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. favicon 200 response: systemLogger is NOT called', async () => {
    await request(app).get('/favicon.svg');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('2. favicon 304 response: systemLogger is NOT called', async () => {
    await request(app).get('/favicon.svg').set('x-test-status', '304');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('3. asset 304 response: systemLogger is NOT called', async () => {
    await request(app).get('/assets/app.js').set('x-test-status', '304');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('4. favicon 404 error response: systemLogger.warn IS called', async () => {
    await request(app).get('/favicon.svg').set('x-test-status', '404');
    expect(warnSpy).toHaveBeenCalledWith(
      'http',
      expect.stringContaining('[HTTP 404] GET /favicon.svg'),
      expect.objectContaining({ statusCode: 404 }),
      'express_http_observer'
    );
  });

  it('5. asset 500 error response: systemLogger.error IS called', async () => {
    await request(app).get('/assets/app.js').set('x-test-status', '500');
    expect(errorSpy).toHaveBeenCalledWith(
      'http',
      expect.stringContaining('[HTTP 500] GET /assets/app.js'),
      expect.objectContaining({ statusCode: 500 }),
      'express_http_observer'
    );
  });

  it('6. routine successful API GET is suppressed to reduce log volume', async () => {
    await request(app).get('/api/devices?token=must-not-be-logged');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('7. successful state-changing requests are logged without query strings', async () => {
    app.post('/api/devices', (_req, res) => res.status(201).json({ ok: true }));
    await request(app).post('/api/devices?token=must-not-be-logged');
    expect(infoSpy).toHaveBeenCalledWith(
      'http',
      expect.stringContaining('[HTTP 201] POST /api/devices'),
      expect.objectContaining({ statusCode: 201, url: '/api/devices' }),
      'express_http_observer'
    );
    expect(infoSpy.mock.calls[0][1]).not.toContain('must-not-be-logged');
  });

  it('8. root / 200 response: systemLogger is NOT called to keep logs clean and free of ping spam', async () => {
    await request(app).get('/');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('9. vite client and source files: systemLogger is NOT called for 200 responses', async () => {
    app.get('/@vite/client', (_req, res) => res.status(200).send('// vite'));
    app.get('/src/App.tsx', (_req, res) => res.status(200).send('export default () => null'));

    await request(app).get('/@vite/client');
    await request(app).get('/src/App.tsx');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
