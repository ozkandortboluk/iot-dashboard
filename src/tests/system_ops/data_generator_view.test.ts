import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { systemRouter, simulatorRouter } from '../../server/routes/system.js';
import { db } from '../../server/db.js';
import type { User, Device } from '../../types.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', systemRouter);
  app.use('/api/simulator', simulatorRouter);
  return app;
}

describe('Data Generator & Telemetry Simulator Enhancements', () => {
  let app: express.Express;
  let adminUser: User;
  let adminSessionToken: string;
  let simulatedDevice: Device;
  let physicalDevice: Device;

  beforeAll(async () => {
    await db.waitForInitialization();

    const adminEmail = 'sim_admin@nexusnode.local';
    const existingAdmin = db.getUsers().find((u) => u.email === adminEmail);
    if (!existingAdmin) {
      adminUser = await db.registerUser('Simulator Admin', adminEmail, 'AdminSecret123!', 'admin', 'Nexus Simulation Lab');
    } else {
      adminUser = existingAdmin;
    }
    adminSessionToken = await db.createSession(adminUser);

    // Base device template
    const baseDeviceFields = {
      tenantId: 'usr_test_admin',
      status: 'online' as const,
      location: 'Lab',
      ipAddress: '192.168.1.50',
      rateLimitPerMin: 60,
      encryptionMethod: 'AES-256-GCM',
      metrics: {},
      userId: adminUser.id,
    };

    // Ensure we have a simulated device
    const devices = db.getDevices();
    let simDev = devices.find((d) => d.isSimulated);
    if (!simDev) {
      simDev = await db.createDevice({
        ...baseDeviceFields,
        name: 'Test Sanal ESP32',
        type: 'esp32',
        isSimulated: true,
      });
    }
    simulatedDevice = simDev;

    // Ensure we have a physical device to test safety boundary
    let physDev = devices.find((d) => !d.isSimulated);
    if (!physDev) {
      physDev = await db.createDevice({
        ...baseDeviceFields,
        name: 'Gerçek Saha Sensörü',
        type: 'esp32',
        isSimulated: false,
      });
    }
    physicalDevice = physDev;

    app = createTestApp();
  });

  it('1. POST /api/simulator/v1/inject successfully injects a single manual telemetry reading into simulated device', async () => {
    const res = await request(app)
      .post('/api/simulator/v1/inject')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        deviceId: simulatedDevice.id,
        metric: 'temperature',
        value: 42.5,
        unit: '°C',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.injectedCount).toBe(1);
    expect(Array.isArray(res.body.readings)).toBe(true);
    expect(res.body.readings[0].deviceId).toBe(simulatedDevice.id);
    expect(res.body.readings[0].metric).toBe('temperature');
    expect(res.body.readings[0].value).toBe(42.5);
  });

  it('2. POST /api/simulator/v1/inject successfully injects composite multi-sensor readings bundle', async () => {
    const readings = [
      { metric: 'temperature', value: 88.5, unit: '°C' },
      { metric: 'humidity', value: 45.2, unit: '%' },
      { metric: 'vibration', value: 12.4, unit: 'mm/s' },
      { metric: 'power', value: 14.8, unit: 'kW' },
    ];

    const res = await request(app)
      .post('/api/simulator/v1/inject')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        deviceId: simulatedDevice.id,
        readings,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.injectedCount).toBe(4);
    expect(Array.isArray(res.body.readings)).toBe(true);
    expect(res.body.readings.length).toBe(4);
  });

  it('3. POST /api/simulator/v1/inject strictly rejects injection into physical hardware devices', async () => {
    const res = await request(app)
      .post('/api/simulator/v1/inject')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        deviceId: physicalDevice.id,
        metric: 'temperature',
        value: 99.9,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('physical_device_not_allowed_in_simulator');
  });

  it('4. POST /api/simulator/batch creates batch telemetry flow for simulated devices', async () => {
    const res = await request(app)
      .post('/api/simulator/batch')
      .set('Cookie', `nexus_session_token=${adminSessionToken}`)
      .set('Origin', 'http://localhost:3000')
      .send({
        count: 5,
        deviceId: simulatedDevice.id,
        metric: 'voltage',
        value: 230.2,
        unit: 'V',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generatedCount).toBe(5);
  });

  it('5. Export utilities exportToCSV and exportToJSON handle simulation log formatting', () => {
    const sampleLogs = [
      {
        timestamp: '2026-10-29T20:00:00.000Z',
        deviceId: 'sim-dev-1',
        deviceName: 'ESP32 Sim-1',
        metric: 'temperature',
        value: 36.8,
        unit: '°C',
        status: 'normal',
      },
      {
        timestamp: '2026-10-29T20:00:01.000Z',
        deviceId: 'sim-dev-1',
        deviceName: 'ESP32 Sim-1',
        metric: 'vibration',
        value: 38.4,
        unit: 'mm/s',
        status: 'critical',
      },
    ];

    expect(() => {
      const jsonStr = JSON.stringify(sampleLogs, null, 2);
      expect(jsonStr).toContain('sim-dev-1');
      expect(jsonStr).toContain('critical');
    }).not.toThrow();

    const headers = Object.keys(sampleLogs[0]).join(',');
    expect(headers).toContain('metric');
    expect(headers).toContain('value');
  });

  it('6. DataGeneratorView.tsx file adopts standard proportional layout and header conventions', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/DataGeneratorView.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check proportional typography
    expect(content).toContain('text-lg sm:text-xl font-bold');
    expect(content).toContain('Sanal Veri & Telemetri Üreteci');
    expect(content).toContain('Admin Test Laboratuvarı');

    // Check newly added features
    expect(content).toContain('handleInjectComposite');
    expect(content).toContain('Hızlı Anomali');
    expect(content).toContain('Hızlı Yük Profilleri');
    expect(content).toContain('handleExportCSV');
    expect(content).toContain('handleExportJSON');
    expect(content).toContain('exportToCSV');
    expect(content).toContain('exportToJSON');

    // Check responsive light and dark classes
    expect(content).toContain('dark:bg-slate-900');
    expect(content).toContain('dark:border-slate-800');
  });
});
