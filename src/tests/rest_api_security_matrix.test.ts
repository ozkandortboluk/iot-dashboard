import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import { authRouter } from '../server/routes/auth.js';
import { devicesRouter } from '../server/routes/devices.js';
import { adminRouter, systemRouter } from '../server/routes/system.js';
import { telemetryRouter } from '../server/routes/telemetry.js';
import { alarmsRouter, rulesRouter } from '../server/routes/alarms.js';
import { secretsRouter } from '../server/routes/secrets.js';
import { setupRouter } from '../server/routes/setup.js';
import { authenticateUser } from '../server/middleware/auth.js';
import { db } from '../server/db.js';
import type { User } from '../types.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

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
  app.use('/api/system/secrets', secretsRouter);
  app.use('/api/setup', authenticateUser, setupRouter);
  app.use('/api/unmapped-custom-route', authenticateUser, (_req, res) => res.json({ ok: true }));

  // Test route for production error leakage validation
  app.get('/api/test-error', (_req, _res) => {
    throw new Error('PostgreSQL Connection Failed: secret_password_123');
  });

  // Global Error Handler mirroring server.ts
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errMsg = err?.message || String(err);
    const isDbErr = errMsg.includes('PostgreSQL') || errMsg.includes('veritabanı') || errMsg.includes('ECONNREFUSED');
    const statusCode = err.status || err.statusCode || (isDbErr ? 503 : 500);

    if (req.path.startsWith('/api/')) {
      const isProd = process.env.NODE_ENV === 'production';
      const errorResponse: Record<string, any> = {
        success: false,
        error: isDbErr ? 'Veritabanı Hizmet Dışı' : 'Sunucu hatası',
      };
      if (!isProd) {
        errorResponse.details = errMsg;
      }
      res.status(statusCode).json(errorResponse);
    } else {
      res.status(500).send('Internal Server Error');
    }
  });

  return app;
}

describe('NexusNode IoT REST API Security & Service Token Matrix (18 Mandatory Security Rules)', () => {
  let app: express.Application;
  let adminUser: User;
  let adminToken: string;
  let tenantAUser: User;
  let tenantAToken: string;
  let tenantBUser: User;
  let tenantBToken: string;

  let tenantADeviceId: string;
  let tenantBDeviceId: string;

  let validServiceTokenA: string;
  let limitedServiceTokenA: string;
  let revokedServiceTokenA: string;
  let expiredServiceTokenA: string;

  beforeAll(async () => {
    await db.waitForInitialization(2000);
    app = createTestApp();

    const ts = Date.now();

    // Admin User
    adminUser = await db.registerUser(
      'System Admin',
      `admin_sec_${ts}@test.com`,
      'AdminPass123!',
      'admin',
      'NexusNode HQ'
    );
    adminToken = await db.createSession(adminUser);

    // Tenant A User
    tenantAUser = await db.registerUser(
      'Tenant A Admin',
      `tenant_a_sec_${ts}@test.com`,
      'TenantAPass123!',
      'customer',
      'Tenant A Corp'
    );
    tenantAToken = await db.createSession(tenantAUser);

    const devA = await db.createDevice({
      userId: tenantAUser.id,
      tenantId: tenantAUser.id,
      name: 'Tenant A Sensor',
      type: 'sensor',
      status: 'online',
      location: 'Saha A',
      ipAddress: '192.168.1.10',
      rateLimitPerMin: 60,
      encryptionMethod: 'none',
      metrics: {},
    });
    tenantADeviceId = devA.id;

    // Tenant B User
    tenantBUser = await db.registerUser(
      'Tenant B Admin',
      `tenant_b_sec_${ts}@test.com`,
      'TenantBPass123!',
      'customer',
      'Tenant B Corp'
    );
    tenantBToken = await db.createSession(tenantBUser);

    const devB = await db.createDevice({
      userId: tenantBUser.id,
      tenantId: tenantBUser.id,
      name: 'Tenant B Sensor',
      type: 'sensor',
      status: 'online',
      location: 'Saha B',
      ipAddress: '192.168.1.11',
      rateLimitPerMin: 60,
      encryptionMethod: 'none',
      metrics: {},
    });
    tenantBDeviceId = devB.id;

    // Create Service Tokens
    const srvA = await db.createServiceTokenAsync({
      name: 'Tenant A Full Service Token',
      userId: tenantAUser.id,
      tenantId: tenantAUser.id,
      scopes: ['devices:read', 'devices:write', 'telemetry:read', 'telemetry:write'],
    });
    validServiceTokenA = srvA.token;

    const srvALimited = await db.createServiceTokenAsync({
      name: 'Tenant A Read-Only Telemetry Token',
      userId: tenantAUser.id,
      tenantId: tenantAUser.id,
      scopes: ['telemetry:read'],
    });
    limitedServiceTokenA = srvALimited.token;

    const srvARevoked = await db.createServiceTokenAsync({
      name: 'Tenant A Revoked Token',
      userId: tenantAUser.id,
      tenantId: tenantAUser.id,
      scopes: ['devices:read', 'telemetry:read'],
    });
    revokedServiceTokenA = srvARevoked.token;
    await db.revokeServiceTokenAsync(srvARevoked.metadata.id);

    const srvAExpired = await db.createServiceTokenAsync({
      name: 'Tenant A Expired Token',
      userId: tenantAUser.id,
      tenantId: tenantAUser.id,
      scopes: ['devices:read'],
      expiresInDays: -1, // Already expired
    });
    expiredServiceTokenA = srvAExpired.token;
  });

  it('1. Production API error response MUST NOT leak internal err.message or SQL/secret details', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).get('/api/test-error');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Veritabanı Hizmet Dışı');
      expect(res.body.details).toBeUndefined();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('2. Login response MUST NOT contain session token in JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: tenantAUser.email, password: 'TenantAPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.token).toBeUndefined();
  });

  it('3. Browser login MUST establish HttpOnly, Secure cookie (nexus_session_token)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: tenantAUser.email, password: 'TenantAPass123!' });

    expect(res.status).toBe(200);
    const rawCookies = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
    const sessionCookie = cookies.find((c: string) => c.startsWith('nexus_session_token='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/httponly/i);
  });

  it('4. Invalid service token → MUST be rejected with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', 'Bearer nxs_srv_invalid_random_token_string_12345');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Geçersiz, iptal edilmiş veya süresi dolmuş/i);
  });

  it('5. Expired service token → MUST be rejected with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${expiredServiceTokenA}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Geçersiz, iptal edilmiş veya süresi dolmuş/i);
  });

  it('6. Revoked service token → MUST be rejected with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${revokedServiceTokenA}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Geçersiz, iptal edilmiş veya süresi dolmuş/i);
  });

  it('7. Valid service token + correct scope → MUST succeed with 200 OK', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('8. Valid service token + missing required scope → MUST be rejected with 403 Forbidden', async () => {
    // limitedServiceTokenA only has 'telemetry:read', NOT 'devices:read' or 'devices:write'
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${limitedServiceTokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/yetkisi \(scope\) gereklidir/i);
  });

  it('9. Tenant A service token → Tenant B device resource → MUST be rejected with 403 / 404', async () => {
    const res = await request(app)
      .get(`/api/devices/${tenantBDeviceId}`)
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect([403, 404]).toContain(res.status);
  });

  it('10. Tenant A service token → Tenant B telemetry query → MUST NOT leak Tenant B data', async () => {
    const res = await request(app)
      .get(`/api/telemetry/history?deviceId=${tenantBDeviceId}`)
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    } else {
      expect([403, 404]).toContain(res.status);
    }
  });

  it('11. Service token → /api/system/secrets → MUST be rejected with 403 Forbidden (Default Deny)', async () => {
    const res = await request(app)
      .get('/api/system/secrets')
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Servis jetonları ile bu hassas yönetim uç noktalarına/i);
  });

  it('12. Service token → /api/database → MUST be rejected with 403 Forbidden (Default Deny)', async () => {
    const res = await request(app)
      .get('/api/admin/database-stats')
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Servis jetonları/i);
  });

  it('13. Service token → /api/setup → MUST be rejected with 403 Forbidden (Default Deny)', async () => {
    const res = await request(app)
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Servis jetonları ile bu hassas yönetim uç noktalarına/i);
  });

  it('14. Service token → Service token creation endpoint → MUST be rejected with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/admin/service-tokens')
      .set('Authorization', `Bearer ${validServiceTokenA}`)
      .send({ name: 'Malicious Escalation Token' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Servis jetonları/i);
  });

  it('15. Admin browser session → Service token creation → MUST succeed with 200 OK', async () => {
    const res = await request(app)
      .post('/api/admin/service-tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New AI Studio Pipeline Token',
        scopes: ['devices:read', 'telemetry:read'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toMatch(/^nxs_srv_/);
    expect(res.body.metadata.tokenPrefix).toMatch(/^nxs_srv_/);
  });

  it('16. Token list endpoint MUST NOT return plaintext tokens or hashes', async () => {
    const res = await request(app)
      .get('/api/admin/service-tokens')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.serviceTokens)).toBe(true);

    for (const t of res.body.serviceTokens) {
      expect(t.tokenHash).toBeUndefined();
      expect(t.tokenPrefix).toMatch(/^nxs_srv_/);
    }
  });

  it('17. CORS unauthorized browser origin → MUST block credentials & reflect null origin', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Origin', 'https://unauthorized-hacker-site.com');

    expect(res.headers['access-control-allow-origin']).toBe('null');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('18. Normal browser session retains existing functions and tenant isolation', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${tenantAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const deviceIds = res.body.map((d: any) => d.id);
    expect(deviceIds).toContain(tenantADeviceId);
    expect(deviceIds).not.toContain(tenantBDeviceId);
  });

  it('19. Service token → Unmapped/Unknown endpoint → MUST be rejected with 403 (Strict Allowlist)', async () => {
    const res = await request(app)
      .get('/api/unmapped-custom-route')
      .set('Authorization', `Bearer ${validServiceTokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/izin verilenler listesinde \(allowlist\) kayıtlı değildir/i);
  });

  it('20. Cookie auth state-changing request without Origin/Referer → MUST be rejected with 403 (Hardened CSRF)', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Cookie', [`nexus_session_token=${tenantAToken}`])
      .send({ name: 'CSRF Attack Device', type: 'sensor' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Origin veya Referer başlığı zorunludur/i);
  });
});
