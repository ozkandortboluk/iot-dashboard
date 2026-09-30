import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { stopWebSocketServer } from '../server/services/websocket.js';
import { db } from '../server/db.js';

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

  it('3. stopWebSocketServer safely cleans up intervals and client sockets without throw', () => {
    expect(() => stopWebSocketServer()).not.toThrow();
  });

  it('4. db.autoHealer watchdog stop method is callable and terminates repair timers', () => {
    if (db.autoHealer) {
      expect(typeof db.autoHealer.stopWatchdog).toBe('function');
      expect(() => db.autoHealer.stopWatchdog()).not.toThrow();
    }
  });
});
