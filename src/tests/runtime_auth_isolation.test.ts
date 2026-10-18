import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import WebSocket from 'ws';
import { db } from '../server/db.js';
import { authRouter } from '../server/routes/auth.js';
import { devicesRouter } from '../server/routes/devices.js';
import { hashPassword } from '../server/utils/crypto.js';
import { resolveRuntimeEnvironment, isVps, isAiStudio, isLocal, isTest } from '../server/config/runtimeEnvironment.js';
import { isOriginAllowed } from '../server/utils/corsOrigins.js';
import { initWebSocketServer } from '../server/services/websocket.js';

describe('Centralized Runtime Environment & Cookie Auth Isolation Suite', () => {
  const originalEnv = { ...process.env };
  const adminEmail = 'isolation_admin@nexusnodeiot.com.tr';
  const adminPassword = 'Password123!';
  let app: express.Application;
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    await db.waitForInitialization();

    // Create user in memory DB
    let user = db.getUsers().find((u: any) => u.email.toLowerCase() === adminEmail.toLowerCase());
    if (!user) {
      user = await db.registerUser(
        'Isolation Admin',
        adminEmail,
        adminPassword,
        'admin',
        'Isolation Lab'
      );
    }
    if (user) {
      if (!db.data.passwords) db.data.passwords = {};
      db.data.passwords[user.id] = hashPassword(adminPassword);
      user.status = 'active';
      user.deletedAt = undefined;
    }

    // Build express app
    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // CORS & Origin middleware
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      next();
    });

    app.use('/api/auth', authRouter);
    app.use('/api/devices', devicesRouter);

    server = http.createServer(app);
    initWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Runtime Environment Resolution', () => {
    it('should resolve APP_ENV accurately', () => {
      process.env.APP_ENV = 'vps';
      expect(resolveRuntimeEnvironment()).toBe('vps');
      expect(isVps()).toBe(true);

      process.env.APP_ENV = 'aistudio';
      expect(resolveRuntimeEnvironment()).toBe('aistudio');
      expect(isAiStudio()).toBe(true);

      process.env.APP_ENV = 'local';
      expect(resolveRuntimeEnvironment()).toBe('local');
      expect(isLocal()).toBe(true);

      process.env.APP_ENV = 'test';
      expect(resolveRuntimeEnvironment()).toBe('test');
      expect(isTest()).toBe(true);
    });

    it('should fallback to vps when VPS_PRODUCTION=true if APP_ENV is unset', () => {
      delete process.env.APP_ENV;
      process.env.VPS_PRODUCTION = 'true';
      expect(resolveRuntimeEnvironment()).toBe('vps');
      delete process.env.VPS_PRODUCTION;
    });
  });

  describe('2. Scenario A & B & C: Cookie Auth & Environment Cookie Properties', () => {
    it('Scenario A (Local): login -> cookie -> /api/auth/me -> 200', async () => {
      process.env.APP_ENV = 'local';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });

      expect(loginRes.status).toBe(200);
      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/nexus_session_token=/);
      expect(cookies[0]).toMatch(/HttpOnly/);
      expect(cookies[0]).toMatch(/SameSite=Lax/);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies[0]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe(adminEmail);
    });

    it('Scenario B (AI Studio): APP_ENV=aistudio -> login -> cookie -> protected GET -> 200', async () => {
      process.env.APP_ENV = 'aistudio';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });

      expect(loginRes.status).toBe(200);
      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/HttpOnly/);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies[0]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe(adminEmail);
    });

    it('Scenario C (VPS): APP_ENV=vps -> cookie Secure=true, SameSite=Lax -> login -> protected endpoint -> 200', async () => {
      process.env.APP_ENV = 'vps';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });

      expect(loginRes.status).toBe(200);
      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/HttpOnly/);
      expect(cookies[0]).toMatch(/Secure/);
      expect(cookies[0]).toMatch(/SameSite=Lax/);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies[0]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe(adminEmail);
    });
  });

  describe('3. Scenario D & E: Unauthenticated & Invalid Cookie', () => {
    it('Scenario D: No cookie -> protected endpoint returns 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Kimlik doğrulama/);
    });

    it('Scenario E: Invalid session cookie -> protected endpoint returns 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'nexus_session_token=forged_invalid_session_token_123');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Geçersiz veya süresi dolmuş/);
    });
  });

  describe('4. Scenario F & G: CSRF and Origin Checks on State-Changing POST', () => {
    it('Scenario F: Valid cookie + Unauthorized Origin + POST -> 403 CSRF', async () => {
      process.env.APP_ENV = 'test';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const cookie = loginRes.headers['set-cookie'][0];

      const res = await request(app)
        .post('/api/devices')
        .set('Cookie', cookie)
        .set('Origin', 'https://attacker-evil-site.com')
        .send({ name: 'Hacked Device', type: 'sensor' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/CSRF/);
    });

    it('Scenario G: Valid cookie + AI Studio allowed Origin (.run.app) + POST -> allowed', async () => {
      process.env.APP_ENV = 'aistudio';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const cookie = loginRes.headers['set-cookie'][0];

      const res = await request(app)
        .post('/api/devices')
        .set('Cookie', cookie)
        .set('Origin', 'https://ais-dev-syx4swk7ixseyi2fqdyyu4-568507365413.europe-west1.run.app')
        .send({ name: 'Allowed AI Studio Device', type: 'generic' });

      expect(res.status).not.toBe(403);
    });
  });

  describe('5. Scenario H & I: WebSocket Cookie Authentication', () => {
    it('Scenario H: WebSocket with valid session cookie -> authenticates successfully', async () => {
      process.env.APP_ENV = 'test';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const rawCookie = loginRes.headers['set-cookie'][0];
      const match = rawCookie.match(/nexus_session_token=([^;]+)/);
      const token = match ? match[1] : '';

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`, {
          headers: {
            Cookie: `nexus_session_token=${token}`,
            Origin: `http://127.0.0.1:${serverPort}`,
          },
        });

        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error('WebSocket connection timeout'));
        }, 3000);

        ws.on('open', () => {
          clearTimeout(timer);
          ws.close();
          resolve();
        });

        ws.on('unexpected-response', (_, res) => {
          clearTimeout(timer);
          reject(new Error(`WS rejected with ${res.statusCode}`));
        });

        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    });

    it('Scenario I: WebSocket without cookie -> rejects with 401 Unauthorized', async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);

        ws.on('open', () => {
          ws.close();
          reject(new Error('Unauthenticated WS was unexpectedly allowed!'));
        });

        ws.on('unexpected-response', (_, res) => {
          expect(res.statusCode).toBe(401);
          resolve();
        });

        ws.on('error', () => {
          resolve();
        });
      });
    });
  });
});
