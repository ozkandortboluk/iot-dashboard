import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import { authRouter } from '../server/routes/auth.js';
import { devicesRouter } from '../server/routes/devices.js';
import { adminRouter } from '../server/routes/system.js';
import { telemetryRouter } from '../server/routes/telemetry.js';
import { alarmsRouter, rulesRouter } from '../server/routes/alarms.js';
import { db } from '../server/db.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // CORS Middleware identical to server.ts
  const ALLOWED_ORIGIN_PATTERNS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/.*\.run\.app$/,
    /^https?:\/\/nexusnodeiot\.com\.tr$/,
    /^https?:\/\/.*\.nexusnodeiot\.com\.tr$/,
  ];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
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
  app.use('/api/devices', devicesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/alarms', alarmsRouter);
  app.use('/api/rules', rulesRouter);

  return app;
}

describe('NexusNode IoT REST API Security & Tenant Isolation Matrix', () => {
  let app: express.Application;
  let tenantAToken: string;
  let tenantBToken: string;
  let tenantADeviceId: string;
  let tenantBDeviceId: string;

  beforeAll(async () => {
    await db.waitForInitialization(2000);
    app = createTestApp();

    const timestamp = Date.now();
    // 1. Create Tenant A User & Device
    const tenantA = await db.registerUser(
      'Tenant A Corp',
      `tenant_a_sec_${timestamp}@test.com`,
      'PasswordA123!',
      'customer',
      'Tenant A Inc'
    );
    tenantAToken = await db.createSession(tenantA);

    const devA = await db.createDevice({
      userId: tenantA.id,
      tenantId: tenantA.id,
      name: 'Tenant A Sensor',
      type: 'sensor',
      status: 'online',
      location: 'Saha A',
      ipAddress: '192.168.1.50',
      rateLimitPerMin: 60,
      encryptionMethod: 'none',
      metrics: {},
    });
    tenantADeviceId = devA.id;

    // 2. Create Tenant B User & Device
    const tenantB = await db.registerUser(
      'Tenant B Corp',
      `tenant_b_sec_${timestamp}@test.com`,
      'PasswordB123!',
      'customer',
      'Tenant B Inc'
    );
    tenantBToken = await db.createSession(tenantB);

    const devB = await db.createDevice({
      userId: tenantB.id,
      tenantId: tenantB.id,
      name: 'Tenant B Sensor',
      type: 'sensor',
      status: 'online',
      location: 'Saha B',
      ipAddress: '192.168.1.51',
      rateLimitPerMin: 60,
      encryptionMethod: 'none',
      metrics: {},
    });
    tenantBDeviceId = devB.id;
  });

  it('1. Unauthenticated API access → MUST be rejected with 401', async () => {
    const res = await request(app).get('/api/devices');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Kimlik doğrulama jetonu/i);
  });

  it('2. Invalid or expired token → MUST be rejected with 401', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', 'Bearer invalid_fake_expired_token_9999');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Geçersiz veya süresi dolmuş/i);
  });

  it('3. Normal user (customer) → Admin endpoint → MUST be rejected with 403', async () => {
    const res = await request(app)
      .get('/api/admin/database-stats')
      .set('Authorization', `Bearer ${tenantAToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Yönetici \(Admin\) yetkisine sahip olmalısınız/i);
  });

  it('4. Tenant A → Tenant B device resource → MUST be rejected with 403 or 404', async () => {
    // Tenant A attempts to view Tenant B's device details
    const res = await request(app)
      .get(`/api/devices/${tenantBDeviceId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('5. Tenant A → Tenant B telemetry query → MUST NOT leak Tenant B data', async () => {
    const res = await request(app)
      .get(`/api/telemetry/history?deviceId=${tenantBDeviceId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);

    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    } else {
      expect([403, 404]).toContain(res.status);
    }
  });

  it('6. CORS unauthorized origin → MUST block credentials & set Access-Control-Allow-Origin to null', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Origin', 'https://malicious-attacker-website.com');

    expect(res.headers['access-control-allow-origin']).toBe('null');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('7. Valid authenticated API request → MUST succeed with 200 OK', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${tenantAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Tenant A should see Tenant A's device, but NOT Tenant B's device
    const deviceIds = res.body.map((d: any) => d.id);
    expect(deviceIds).toContain(tenantADeviceId);
    expect(deviceIds).not.toContain(tenantBDeviceId);
  });
});
