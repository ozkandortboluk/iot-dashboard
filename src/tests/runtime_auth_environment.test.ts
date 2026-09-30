import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import WebSocket from 'ws';

import { authRouter } from '../server/routes/auth.js';
import { systemRouter } from '../server/routes/system.js';
import { authenticateUser } from '../server/middleware/auth.js';
import { isOriginAllowed } from '../server/utils/corsOrigins.js';
import { resolveRuntimeEnvironment, getRuntimeConfig } from '../server/config/runtimeEnvironment.js';
import { initWebSocketServer, stopWebSocketServer } from '../server/services/websocket.js';
import { db } from '../server/db.js';
import type { User } from '../types.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // CORS middleware matching server.ts
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed = isOriginAllowed(origin);
      if (isAllowed) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      } else {
        res.header('Access-Control-Allow-Origin', 'null');
      }
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);

  // Protected test endpoints
  app.get('/api/protected/data', authenticateUser, (req, res) => {
    res.json({ success: true, user: (req as any).user });
  });

  app.post('/api/protected/action', authenticateUser, (req, res) => {
    res.json({ success: true, action: 'executed' });
  });

  return app;
}

describe('Runtime Environment & Authentication Architecture Test Suite', () => {
  let testUser: User;
  let validSessionToken: string;

  beforeAll(async () => {
    await db.waitForInitialization();

    // Create a known test user with known password
    const email = 'env_test_admin@nexusnode.local';
    const existing = db.getUsers().find((u) => u.email === email);
    if (!existing) {
      testUser = await db.registerUser('Env Test Admin', email, 'SuperSecurePassword123!', 'admin', 'Test Corp');
    } else {
      testUser = existing;
      db.data.passwords[testUser.id] = await import('bcryptjs').then((b) => b.hash('SuperSecurePassword123!', 10));
    }

    validSessionToken = await db.createSession(testUser);
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.VPS_PRODUCTION;
    delete process.env.APP_URL;
    delete process.env.CLIENT_ORIGIN;
  });

  // A) Local development: login -> cookie -> /api/auth/me -> 200
  it('A) Local development: login sets cookie and /api/auth/me verifies session with 200 OK', async () => {
    process.env.APP_ENV = 'local';
    expect(resolveRuntimeEnvironment()).toBe('local');

    const app = createTestApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'env_test_admin@nexusnode.local', password: 'SuperSecurePassword123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user).toBeDefined();

    // Verify cookie attributes for local development
    const cookieHeader = loginRes.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
    expect(cookieStr).toContain('nexus_session_token=');
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toContain('SameSite=Lax');
    // Local development does not force Secure over plain HTTP
    expect(cookieStr).not.toContain('Secure');

    // Extract cookie value and verify /api/auth/me
    const tokenMatch = cookieStr.match(/nexus_session_token=([^;]+)/);
    const token = tokenMatch![1];

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nexus_session_token=${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('env_test_admin@nexusnode.local');
  });

  // B) AI Studio environment: APP_ENV=aistudio -> login -> cookie (Secure=true) -> protected GET -> 200
  it('B) AI Studio environment: APP_ENV=aistudio sets Secure=true cookie and allows protected GET', async () => {
    process.env.APP_ENV = 'aistudio';
    expect(resolveRuntimeEnvironment()).toBe('aistudio');

    const app = createTestApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'env_test_admin@nexusnode.local', password: 'SuperSecurePassword123!' });

    expect(loginRes.status).toBe(200);

    const cookieHeader = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
    expect(cookieStr).toContain('nexus_session_token=');
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toContain('Secure'); // AI Studio runs over HTTPS
    expect(cookieStr).toContain('SameSite=None');

    const token = cookieStr.match(/nexus_session_token=([^;]+)/)![1];

    const protectedRes = await request(app)
      .get('/api/protected/data')
      .set('Cookie', `nexus_session_token=${token}`);

    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body.success).toBe(true);
  });

  // C) VPS: APP_ENV=vps -> cookie Secure=true, SameSite=lax -> login -> protected endpoint -> 200
  it('C) VPS: APP_ENV=vps sets Secure=true, SameSite=Lax and authorizes protected endpoint', async () => {
    process.env.APP_ENV = 'vps';
    expect(resolveRuntimeEnvironment()).toBe('vps');

    const app = createTestApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'env_test_admin@nexusnode.local', password: 'SuperSecurePassword123!' });

    expect(loginRes.status).toBe(200);

    const cookieHeader = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
    expect(cookieStr).toContain('Secure');
    expect(cookieStr).toContain('SameSite=Lax');

    const token = cookieStr.match(/nexus_session_token=([^;]+)/)![1];

    const protectedRes = await request(app)
      .get('/api/protected/data')
      .set('Cookie', `nexus_session_token=${token}`);

    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body.success).toBe(true);
  });

  // D) Cookie yok: protected endpoint -> 401
  it('D) Missing cookie returns 401 Unauthorized with descriptive error', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/protected/data');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Erişim Engellendi (401)');
  });

  // E) Geçersiz session cookie: protected endpoint -> 401
  it('E) Invalid session cookie returns 401 Unauthorized', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/protected/data')
      .set('Cookie', 'nexus_session_token=invalid_forged_session_token_12345');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Geçersiz veya süresi dolmuş oturum jetonu');
  });

  // F) Cookie auth + yetkisiz Origin + POST: 403 CSRF
  it('F) Cookie auth with unauthorized Origin on state-changing POST is blocked with 403 CSRF', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/protected/action')
      .set('Cookie', `nexus_session_token=${validSessionToken}`)
      .set('Origin', 'https://malicious-attacker-website.com')
      .send({ payload: 'test' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CSRF');
  });

  // G) AI Studio izinli Origin (.europe-west1.run.app) + valid cookie + POST: başarılı
  it('G) Cookie auth with multi-segment Cloud Run Origin on POST passes CSRF successfully', async () => {
    process.env.APP_ENV = 'aistudio';
    const app = createTestApp();

    const allowedOrigin = 'https://ais-dev-syx4swk7ixseyi2fqdyyu4-568507365413.europe-west1.run.app';
    expect(isOriginAllowed(allowedOrigin)).toBe(true);

    const res = await request(app)
      .post('/api/protected/action')
      .set('Cookie', `nexus_session_token=${validSessionToken}`)
      .set('Origin', allowedOrigin)
      .send({ payload: 'test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // H) WebSocket valid session cookie: auth success
  it('H) WebSocket upgrade with valid session cookie succeeds', async () => {
    const server = http.createServer();
    initWebSocketServer(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: {
          Cookie: `nexus_session_token=${validSessionToken}`,
        },
      });

      const openPromise = new Promise<boolean>((resolve, reject) => {
        ws.on('open', () => resolve(true));
        ws.on('error', (err) => reject(err));
      });

      const opened = await openPromise;
      expect(opened).toBe(true);
      ws.close();
    } finally {
      stopWebSocketServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // I) WebSocket cookie yok: unauthorized (upgrade rejected 401)
  it('I) WebSocket upgrade without cookie or credentials is rejected with 401 Unauthorized', async () => {
    const server = http.createServer();
    initWebSocketServer(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

      const errorPromise = new Promise<{ rejected: boolean; code?: number }>((resolve) => {
        ws.on('unexpected-response', (_req, res) => {
          resolve({ rejected: true, code: res.statusCode });
        });
        ws.on('error', () => {
          resolve({ rejected: true });
        });
      });

      const result = await errorPromise;
      expect(result.rejected).toBe(true);
      if (result.code) {
        expect(result.code).toBe(401);
      }
    } finally {
      stopWebSocketServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // J) Runtime Diagnostics Endpoint
  it('J) GET /api/system/runtime returns correct environment info without leaking secrets', async () => {
    process.env.APP_ENV = 'aistudio';
    const app = createTestApp();

    const res = await request(app).get('/api/system/runtime');
    expect(res.status).toBe(200);
    expect(res.body.environment).toBe('aistudio');
    expect(res.body.production).toBe(false);
    expect(res.body.cookieMode).toBe('same-origin-secure');
    expect(res.body.sshTunnelAllowed).toBe(true);

    // Verify zero secrets leaked
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('secret');
    expect(jsonStr).not.toContain('key');
  });
});
