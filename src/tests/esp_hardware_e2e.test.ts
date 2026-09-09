import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { db } from '../server/db.js';
import { authRouter } from '../server/routes/auth.js';
import { telemetryRouter } from '../server/routes/telemetry.js';
import { devicesRouter } from '../server/routes/devices.js';
import { commandsRouter } from '../server/routes/commands.js';
import type { Device, User } from '../types.js';

// Setup isolated express test app with all production middleware
const app = express();
app.use(express.json());
app.use(express.text());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/commands', commandsRouter);
app.use('/api', commandsRouter);

describe('ESP8266 & ESP32 Hardware E2E Pipeline (Roadmap P0 - Item 1)', () => {
  const testTenantId = 'tenant_esp_hardware_01';
  const testCustomerId = 'cust_esp_hardware_01';
  const testDeviceId = 'esp32_hw_prod_01';
  const testApiKey = 'nex_hw_esp32_secret_key_8899aabb';
  let sessionCookie: string = '';

  const hardwareDevice: Device = {
    id: testDeviceId,
    name: 'Trafo Trafo ESP32 Saha Cihazı',
    status: 'online',
    isSimulated: false, // Strict physical device
    apiKey: testApiKey,
    tenantId: testTenantId,
    location: 'Saha Trafo A1',
    ipAddress: '192.168.1.120',
    type: 'transformer_sensor',
    rateLimitPerMin: 120,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    supportedOutputs: ['RELAY_1', 'RELAY_2', 'PWM_1'],
    metrics: {
      temperature: 21.0,
      humidity: 45.0,
      wifi_rssi: -65,
      heap_free: 195000,
      relay_1: 0,
    } as any,
  };

  const operatorUser: User = {
    id: 'usr_esp_operator',
    name: 'ESP Saha Operatörü',
    email: 'esp_operator@nexusnodeiot.com.tr',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  beforeAll(() => {
    // Register test device and user in db
    const existingDevs = db.getDevices().filter((d) => d.id !== testDeviceId);
    db.data.devices = [...existingDevs, { ...hardwareDevice }];

    const existingUsers = (db.data.users || []).filter((u) => u.email !== operatorUser.email);
    db.data.users = [...existingUsers, { ...operatorUser }];

    // Directly generate valid session token
    const token = db.createSession(operatorUser);
    sessionCookie = `nexus_session_token=${token}`;
  });

  afterAll(async () => {
    // Cleanup test data
    db.data.devices = db.getDevices().filter((d) => d.id !== testDeviceId);
  });

  // =========================================================================
  // 1. ESP32 / ESP8266 Handshake & Ping
  // =========================================================================
  it('Step 1: ESP32 hardware connects and pings /api/telemetry/ping with apiKey and bootId', async () => {
    const res = await request(app)
      .get('/api/telemetry/ping')
      .set('x-device-id', testDeviceId)
      .set('x-api-key', testApiKey)
      .query({
        bootId: 'boot_esp32_reset_01',
        firmware: '1.2.0',
        uptime: '3600',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('serverTime');
    expect(res.body).toHaveProperty('expectedIntervalSeconds');
  });

  // =========================================================================
  // 2. Hardware Telemetry Ingestion (connect -> telemetry -> DB)
  // =========================================================================
  it('Step 2: ESP32 sends multi-metric telemetry packet with sequence, bootId and physical measurements', async () => {
    const telemetryPacket = {
      deviceId: testDeviceId,
      apiKey: testApiKey,
      sequence: 101,
      bootId: 'boot_esp32_reset_01',
      temperature: 28.6,
      humidity: 54.2,
      wifi_rssi: -62,
      heap_free: 184200,
      relay_1: 0,
      timestamp: new Date().toISOString(),
    };

    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', testApiKey)
      .send(telemetryPacket);

    expect(res.status).toBe(200);
    expect(['SUCCESS', 'queued']).toContain(res.body.status);
    expect(res.body.received).toBeGreaterThanOrEqual(5);
    expect(res.body.writeAck).toBeDefined();
  });

  // =========================================================================
  // 3. Database & Dashboard State Verification
  // =========================================================================
  it('Step 3: Server persists telemetry readings and updates device status and dashboard metrics', async () => {
    // 1. Check device status in DB
    const dev = db.getDeviceById(testDeviceId);
    expect(dev).toBeDefined();
    expect(dev?.status).toBe('online');
    expect(dev?.metrics?.temperature).toBe(28.6);
    expect(dev?.metrics?.humidity).toBe(54.2);
    expect((dev?.metrics as any)?.relay_1).toBe(0);

    // 2. Query telemetry readings via DB
    const readings = db.getTelemetry(testDeviceId, 'temperature', 10);
    expect(readings.length).toBeGreaterThanOrEqual(1);
    expect(readings[0].deviceId).toBe(testDeviceId);
    expect(readings[0].metric).toBe('temperature');
    expect(readings[0].value).toBe(28.6);
  });

  // =========================================================================
  // 4. Command Dispatch from Dashboard (Dashboard -> Server -> Queue)
  // =========================================================================
  let createdCommandId = '';

  it('Step 4: Operator sends command from Dashboard to toggle Relay 1 on ESP32', async () => {
    const commandPayload = {
      command: 'RELAY_SET',
      params: { pin: 2, state: 1 },
      source: 'manual',
      timeoutSeconds: 60,
    };

    const res = await request(app)
      .post(`/api/devices/${testDeviceId}/commands`)
      .set('Cookie', sessionCookie || '')
      .send(commandPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('command');
    expect(res.body.command).toHaveProperty('id');
    expect(res.body.command.command).toBe('RELAY_SET');
    expect(res.body.command.status).toBe('queued');
    createdCommandId = res.body.command.id;
  });

  // =========================================================================
  // 5. Downlink Delivery to ESP32 (Server -> ESP32)
  // =========================================================================
  it('Step 5: ESP32 polls or receives downlink command via device API', async () => {
    expect(createdCommandId).toBeTruthy();

    const res = await request(app)
      .get('/api/commands/device/commands')
      .set('x-device-id', testDeviceId)
      .set('x-api-key', testApiKey);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('commands');
    expect(Array.isArray(res.body.commands)).toBe(true);
    const targetCmd = res.body.commands.find((c: any) => c.id === createdCommandId);
    expect(targetCmd).toBeDefined();
    expect(targetCmd.command).toBe('RELAY_SET');
    const cmdParams = targetCmd.parameters || targetCmd.params;
    expect(cmdParams).toEqual({ pin: 2, state: 1 });
  });

  // =========================================================================
  // 6. ESP32 Hardware Execution & ACK (ESP32 -> Server -> Applied State)
  // =========================================================================
  it('Step 6: ESP32 executes GPIO actuation and sends back ACK packet with status=applied', async () => {
    expect(createdCommandId).toBeTruthy();

    const ackPayload = {
      commandId: createdCommandId,
      status: 'applied',
      result: {
        pin: 2,
        state: 1,
        gpioReadback: 1,
        executionTimeMs: 14,
      },
    };

    const res = await request(app)
      .post('/api/commands/device/commands/ack')
      .set('x-device-id', testDeviceId)
      .set('x-api-key', testApiKey)
      .send(ackPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify command status in DB has transitioned to applied
    const updatedCommands = await db.getCommands(testDeviceId);
    const verifiedCmd = updatedCommands.find((c) => c.id === createdCommandId);
    expect(verifiedCmd).toBeDefined();
    expect(verifiedCmd?.status).toBe('applied');
    expect(verifiedCmd?.applied_at).toBeDefined();
  });

  // =========================================================================
  // 7. Telemetry Ingestion with Response Piggybacking (Downlink Execution)
  // =========================================================================
  it('Step 7: ESP32 sends next telemetry packet and receives queued command in response payload', async () => {
    // 1. Create another command in queue
    const cmdRes = await request(app)
      .post(`/api/devices/${testDeviceId}/commands`)
      .set('Cookie', sessionCookie || '')
      .send({
        command: 'PWM_SET',
        params: { channel: 1, duty: 75 },
        source: 'manual',
      });

    expect(cmdRes.status).toBe(201);
    expect(cmdRes.body).toHaveProperty('command');
    const pwmCmdId = cmdRes.body.command.id;

    // 2. ESP32 sends telemetry packet #102 with prior command ack included
    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', testApiKey)
      .send({
        deviceId: testDeviceId,
        apiKey: testApiKey,
        sequence: 102,
        bootId: 'boot_esp32_reset_01',
        temperature: 29.1,
        relay_1: 1, // Readback confirmed ON
        ackCommands: createdCommandId,
      });

    expect(res.status).toBe(200);
    expect(['SUCCESS', 'queued']).toContain(res.body.status);
    // Downlink commands returned directly in telemetry response
    expect(Array.isArray(res.body.commands)).toBe(true);
    const piggybackedCmd = res.body.commands.find((c: any) => c.id === pwmCmdId);
    expect(piggybackedCmd).toBeDefined();
    expect(piggybackedCmd.command).toBe('PWM_SET');
  });
});
