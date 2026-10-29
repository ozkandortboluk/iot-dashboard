import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { systemRouter } from '../../server/routes/system.js';
import { db } from '../../server/db.js';
import type { User } from '../../types.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', systemRouter);
  return app;
}

describe('System Engines Management & Control Center (Roadmap System Engines)', () => {
  let app: express.Express;
  let adminUser: User;
  let adminSessionToken: string;
  let customerUser: User;
  let customerSessionToken: string;

  beforeAll(async () => {
    await db.waitForInitialization();

    const adminEmail = 'engines_admin@nexusnode.local';
    const existingAdmin = db.getUsers().find((u) => u.email === adminEmail);
    if (!existingAdmin) {
      adminUser = await db.registerUser('Engines Admin', adminEmail, 'AdminSecret123!', 'admin', 'Nexus Corp');
    } else {
      adminUser = existingAdmin;
    }
    adminSessionToken = await db.createSession(adminUser);

    const customerEmail = 'engines_customer@nexusnode.local';
    const existingCustomer = db.getUsers().find((u) => u.email === customerEmail);
    if (!existingCustomer) {
      customerUser = await db.registerUser('Engines Customer', customerEmail, 'CustomerSecret123!', 'customer', 'Client Corp');
    } else {
      customerUser = existingCustomer;
    }
    customerSessionToken = await db.createSession(customerUser);

    app = createTestApp();
  });

  it('1. GET /api/system/engines enforces strict admin authorization', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request(app).get('/api/system/engines');
    expect(unauthRes.status).toBe(401);

    // Customer role -> 403
    const custRes = await request(app)
      .get('/api/system/engines')
      .set('Cookie', `nexus_session_token=${customerSessionToken}`);
    expect(custRes.status).toBe(403);
  });

  it('2. GET /api/system/engines returns complete list of registered system engines for Admin', async () => {
    const res = await request(app)
      .get('/api/system/engines')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.engines)).toBe(true);

    const engines = res.body.engines;
    const engineIds = engines.map((e: any) => e.id);

    // Check all required core engines exist
    expect(engineIds).toContain('alarm_notification');
    expect(engineIds).toContain('ota_updater');
    expect(engineIds).toContain('simulator');
    expect(engineIds).toContain('nodata_watchdog');
    expect(engineIds).toContain('automation');
    expect(engineIds).toContain('command_downlink');
    expect(engineIds).toContain('wal_persistence');

    // Check properties on a sample engine
    const otaEngine = engines.find((e: any) => e.id === 'ota_updater');
    expect(otaEngine.name).toContain('OTA');
    expect(otaEngine.tag).toBe('OTA-ENG-02');
    expect(otaEngine.category).toBe('ota');
    expect(typeof otaEngine.enabled).toBe('boolean');
    expect(otaEngine.capabilities.canToggle).toBe(true);
    expect(otaEngine.capabilities.canTrigger).toBe(true);
  });

  it('3. POST /api/system/engines/:id/toggle starts and stops toggleable engine', async () => {
    // 1. Toggle simulator to false
    const stopRes = await request(app)
      .post('/api/system/engines/simulator/toggle')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({ enabled: false });

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.success).toBe(true);
    expect(stopRes.body.engine.enabled).toBe(false);
    expect(stopRes.body.engine.status).toBe('stopped');

    // 2. Toggle simulator back to true
    const startRes = await request(app)
      .post('/api/system/engines/simulator/toggle')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({ enabled: true });

    expect(startRes.status).toBe(200);
    expect(startRes.body.success).toBe(true);
    expect(startRes.body.engine.enabled).toBe(true);
    expect(startRes.body.engine.status).toBe('running');

    // 3. Validation: Reject invalid payload
    const invalidRes = await request(app)
      .post('/api/system/engines/simulator/toggle')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({ enabled: 'invalid' });
    expect(invalidRes.status).toBe(400);
  });

  it('4. POST /api/system/engines/:id/trigger triggers a single execution cycle', async () => {
    const triggerRes = await request(app)
      .post('/api/system/engines/ota_updater/trigger')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000');

    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.success).toBe(true);
    expect(triggerRes.body.message).toContain('OTA Motoru');
  });

  it('5. POST /api/system/engines/:id/config saves engine settings', async () => {
    const configRes = await request(app)
      .post('/api/system/engines/simulator/config')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({ intervalMs: 5000, anomalyProbability: 0.1, activeScenario: 'overheat' });

    expect(configRes.status).toBe(200);
    expect(configRes.body.success).toBe(true);
    expect(configRes.body.engine.metrics['Aktif Senaryo']).toBe('overheat');
  });

  it('6. Sidebar and App integrate SİSTEM VE AYARLARI and Sistem Motorları', () => {
    const sidebarPath = path.resolve(process.cwd(), 'src/components/Sidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

    expect(sidebarContent).toContain("id: 'system_settings'");
    expect(sidebarContent).toContain("label: 'Sistem ve Ayarları'");
    expect(sidebarContent).toContain("id: 'system_engines'");
    expect(sidebarContent).toContain("label: 'Sistem Motorları'");

    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    expect(appContent).toContain('SystemSettingsView');
    expect(appContent).toContain('system_settings:');
    expect(appContent).toContain('system_engines:');
    expect(appContent).toContain("safeActiveTab === 'system_settings'");
    expect(appContent).toContain("safeActiveTab === 'system_engines'");
  });

  it('7. SystemEnginesView supports Karo (Grid) and Liste (List) view modes and standard header', () => {
    const viewPath = path.resolve(process.cwd(), 'src/components/SystemEnginesView.tsx');
    const viewContent = fs.readFileSync(viewPath, 'utf8');

    // View mode state & user preference persistence
    expect(viewContent).toContain('system_engines_view_mode');
    expect(viewContent).toContain("setViewMode('grid')");
    expect(viewContent).toContain("setViewMode('list')");
    expect(viewContent).toContain('LayoutGrid');
    expect(viewContent).toContain('List');

    // Dual view renderings
    expect(viewContent).toContain("viewMode === 'list'");
    expect(viewContent).toContain('<table className="w-full text-left border-collapse"');
    expect(viewContent).toContain('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4');

    // Standard compact header
    expect(viewContent).toContain('Sistem Motorları');
    expect(viewContent).toContain('Otonom Servis Masası');
    expect(viewContent).toContain("Sistem ve Ayarları'na Dön");
  });
});
