import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { systemRouter } from '../../server/routes/system.js';
import { db } from '../../server/db.js';
import { APP_VERSION, APP_RELEASE_TAG } from '../../config/version.js';
import type { User } from '../../types.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', systemRouter);
  return app;
}

describe('Role-based Version Visibility & GitHub Info Isolation', () => {
  let app: express.Express;
  let adminUser: User;
  let adminSessionToken: string;
  let customerUser: User;
  let customerSessionToken: string;

  beforeAll(async () => {
    await db.waitForInitialization();

    const adminEmail = 'admin_ver_test@nexusnode.local';
    const existingAdmin = db.getUsers().find((u) => u.email === adminEmail);
    if (!existingAdmin) {
      adminUser = await db.registerUser('Version Admin', adminEmail, 'AdminSecret123!', 'admin', 'Nexus Corp');
    } else {
      adminUser = existingAdmin;
    }
    adminSessionToken = await db.createSession(adminUser);

    const customerEmail = 'customer_ver_test@nexusnode.local';
    const existingCustomer = db.getUsers().find((u) => u.email === customerEmail);
    if (!existingCustomer) {
      customerUser = await db.registerUser('Version Customer', customerEmail, 'CustomerSecret123!', 'customer', 'Client Corp');
    } else {
      customerUser = existingCustomer;
    }
    customerSessionToken = await db.createSession(customerUser);

    app = createTestApp();
  });

  it('1. Unauthenticated request to /api/system/version receives server version but NO github info', async () => {
    const res = await request(app).get('/api/system/version');

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(APP_VERSION);
    expect(res.body.releaseTag).toBe(APP_RELEASE_TAG);
    expect(res.body.environment).toBeDefined();
    expect(res.body.github).toBeUndefined();
  });

  it('2. Customer request to /api/system/version receives server version but NO github info', async () => {
    const res = await request(app)
      .get('/api/system/version')
      .set('Cookie', `nexus_session_token=${customerSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(APP_VERSION);
    expect(res.body.releaseTag).toBe(APP_RELEASE_TAG);
    expect(res.body.environment).toBeDefined();
    expect(res.body.github).toBeUndefined();
  });

  it('3. Admin request to /api/system/version receives both server version AND github info', async () => {
    const res = await request(app)
      .get('/api/system/version')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(APP_VERSION);
    expect(res.body.releaseTag).toBe(APP_RELEASE_TAG);
    expect(res.body.environment).toBeDefined();
    expect(res.body.github).toBeDefined();
    expect(res.body.github.repo).toBeDefined();
    expect(res.body.github.releaseTag).toBeDefined();
    expect(res.body.github.syncStatus).toBeDefined();
    expect(['synced', 'ahead', 'behind']).toContain(res.body.github.syncStatus);
  });

  it('4. Sidebar component guards GitHub version card and network fetch strictly behind isAdmin', () => {
    const sidebarPath = path.resolve(process.cwd(), 'src/components/Sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');

    // Running version button is present for all users (including customer)
    expect(content).toContain('id="sidebar-running-version-btn"');

    // GitHub version link is strictly guarded by isAdmin
    expect(content).toMatch(/\{isAdmin\s*&&\s*\(\s*<a[^>]*id="sidebar-github-version-link"/);

    // fetchGithubVersion is only invoked when isAdmin is true
    expect(content).toMatch(/if\s*\(isAdmin\)\s*\{\s*fetchGithubVersion\(\);\s*\}/);
  });
});
