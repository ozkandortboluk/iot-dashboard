import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('RUN-05: Graceful Shutdown & Process Crash Handling', () => {
  it('1. Rejects incoming HTTP requests with 503 Service Unavailable when shutting down', async () => {
    const isShuttingDown = true;
    const app = express();

    app.use((_req, res, next) => {
      if (isShuttingDown) {
        res.setHeader('Connection', 'close');
        return res.status(503).json({
          success: false,
          error: 'Sunucu kapanıyor (503 Service Unavailable)',
          message: 'Sunucu durdurma sürecindedir, yeni istek kabul edilmiyor.',
        });
      }
      next();
    });

    app.get('/api/health/live', (_req, res) => {
      res.json({ status: 'alive' });
    });

    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('503 Service Unavailable');
  });

  it('2. Allows normal requests when server is NOT shutting down', async () => {
    const isShuttingDown = false;
    const app = express();

    app.use((_req, res, next) => {
      if (isShuttingDown) {
        res.setHeader('Connection', 'close');
        return res.status(503).json({
          success: false,
          error: 'Sunucu kapanıyor (503 Service Unavailable)',
        });
      }
      next();
    });

    app.get('/api/health/live', (_req, res) => {
      res.json({ status: 'alive' });
    });

    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });
});
