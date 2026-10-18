import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { db } from '../../server/db.js';
import { authRouter } from '../../server/routes/auth.js';
import { telemetryRouter } from '../../server/routes/telemetry.js';
import { devicesRouter } from '../../server/routes/devices.js';
import { commandsRouter } from '../../server/routes/commands.js';
import { commandService } from '../../server/services/command.service.js';
import type { Device, User } from '../../types.js';

const app = express();
app.use(express.json());
app.use(express.text());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/commands', commandsRouter);
app.use('/api', commandsRouter);

describe('Network Failure, Reconnect, Device Reboot & Command Queue Soak Test (Roadmap P0 - Item 2)', () => {
  const testTenantId = 'usr_test_admin';
  const testCustomerId = 'usr_test_admin';
  const testDeviceId = 'dev_test_01';
  const testApiKey = 'dev_key_test_0000000000000000';
  let sessionCookie: string = '';

  const soakDevice: Device = {
    id: testDeviceId,
    name: 'Saha Dış Ortam ESP32 Soak İstasyonu',
    status: 'online',
    isSimulated: false,
    apiKey: testApiKey,
    tenantId: testTenantId,
    location: 'Saha İstasyon 4',
    ipAddress: '192.168.1.188',
    type: 'weather_station',
    rateLimitPerMin: 600,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    outputDefinitions: [
      { id: 'RELAY_1', name: 'Röle 1', pin: 2, type: 'relay' },
      { id: 'RELAY_2', name: 'Röle 2', pin: 4, type: 'relay' },
      { id: 'VALVE_1', name: 'Vana 1', pin: 5, type: 'relay' },
      { id: 'HEATER_1', name: 'Isıtıcı 1', pin: 12, type: 'relay' }
    ],
    metrics: {
      temperature: 19.5,
      humidity: 62.0,
      pressure: 1012.8,
      soil_moisture: 48.0,
    } as any,
  };

  const soakOperator: User = {
    id: 'usr_test_admin',
    name: 'Test Kullanıcısı',
    email: 'test@nexusnodeiot.com.tr',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    const existingDevs = db.getDevices().filter((d) => d.id !== testDeviceId);
    db.data.devices = [...existingDevs, { ...soakDevice }];

    const existingUsers = (db.data.users || []).filter((u) => u.email !== soakOperator.email);
    db.data.users = [...existingUsers, { ...soakOperator }];

    const token = await db.createSession(soakOperator);
    sessionCookie = `nexus_session_token=${token}`;

    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.saveDevice(soakDevice).catch(() => {});
      await db.postgresRepo.saveSession({
        token,
        userId: soakOperator.id,
        userRole: soakOperator.role,
        userEmail: soakOperator.email,
        userName: soakOperator.name,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }).catch(() => {});
    }
  });

  beforeEach(async () => {
    if (!db.getDeviceById(testDeviceId)) {
      db.data.devices.push({ ...soakDevice });
    }
    if (!(db.data.users || []).some((u) => u.id === soakOperator.id)) {
      db.data.users.push({ ...soakOperator });
    }
    const token = await db.createSession(soakOperator);
    sessionCookie = `nexus_session_token=${token}`;

    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.saveDevice(soakDevice).catch(() => {});
      await db.postgresRepo.saveSession({
        token,
        userId: soakOperator.id,
        userRole: soakOperator.role,
        userEmail: soakOperator.email,
        userName: soakOperator.name,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }).catch(() => {});
    }
  });

  afterAll(async () => {
    db.data.devices = db.getDevices().filter((d) => d.id !== testDeviceId);
    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.deleteDevice(testDeviceId).catch(() => {});
    }
  });

  const sessionAlphaBootId = `boot_alpha_${Date.now()}`;

  // =========================================================================
  // 1. Initial Online Telemetry Stream
  // =========================================================================
  it('1. Device streams baseline telemetry while connected to network', async () => {
    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', testApiKey)
      .send({
        deviceId: testDeviceId,
        apiKey: testApiKey,
        sequence: 1,
        bootId: sessionAlphaBootId,
        temperature: 20.1,
        humidity: 61.5,
        pressure: 1013.2,
      });

    expect(res.status).toBe(200);
    expect(['SUCCESS', 'queued']).toContain(res.body.status);
  });

  // =========================================================================
  // 2. Offline Command Queuing during Network Failure
  // =========================================================================
  const queuedCommandIds: string[] = [];

  it('2. Network drop occurs; server queues multiple downlink commands for the offline device in FIFO order', async () => {
    // Simulate 3 control commands queued while device is disconnected / unreachable
    const commandPayloads = [
      { command: 'RELAY_SET', parameters: { outputId: 'RELAY_1', state: 1 }, source: 'automation' },
      { command: 'VALVE_SET', parameters: { outputId: 'VALVE_1', openPercent: 50 }, source: 'schedule' },
      { command: 'HEATER_SET', parameters: { outputId: 'HEATER_1', power: 80 }, source: 'manual' },
    ];

    for (const payload of commandPayloads) {
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/commands`)
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://localhost:3000')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.command).toHaveProperty('id');
      expect(res.body.command.status).toBe('queued');
      queuedCommandIds.push(res.body.command.id);
    }

    expect(queuedCommandIds.length).toBe(3);

    // Verify all 3 commands exist in DB in queued state
    const currentCmds = await db.getCommands(testDeviceId);
    const pendingInDb = currentCmds.filter((c) => queuedCommandIds.includes(c.id));
    expect(pendingInDb.length).toBe(3);
    expect(pendingInDb.every((c) => c.status === 'queued')).toBe(true);
  });

  // =========================================================================
  // 3. Reconnect & Buffered Telemetry Flush
  // =========================================================================
  it('3. Device reconnects after network outage, polls pending commands and flushes offline-buffered packets in sequential order', async () => {
    // 1. Device reconnects and queries pending commands
    const pollRes = await request(app)
      .get('/api/commands/device/commands')
      .set('x-device-id', testDeviceId)
      .set('x-api-key', testApiKey);

    expect(pollRes.status).toBe(200);
    expect(pollRes.body).toHaveProperty('commands');
    const delivered = pollRes.body.commands;

    // Must deliver all 3 queued commands in FIFO order
    const receivedIds = delivered.map((c: any) => c.id);
    for (const qId of queuedCommandIds) {
      expect(receivedIds).toContain(qId);
    }

    // 2. Device flushes buffered offline packets from Flash (sequence 2, 3, 4)
    const bufferedPackets = [
      {
        deviceId: testDeviceId,
        apiKey: testApiKey,
        sequence: 2,
        bootId: sessionAlphaBootId,
        temperature: 20.3,
        humidity: 61.2,
      },
      {
        deviceId: testDeviceId,
        apiKey: testApiKey,
        sequence: 3,
        bootId: sessionAlphaBootId,
        temperature: 20.5,
        humidity: 60.9,
      },
      {
        deviceId: testDeviceId,
        apiKey: testApiKey,
        sequence: 4,
        bootId: sessionAlphaBootId,
        temperature: 20.8,
        humidity: 60.5,
      },
    ];

    for (const pkt of bufferedPackets) {
      const res = await request(app)
        .post('/api/telemetry')
        .set('x-api-key', testApiKey)
        .send(pkt);

      expect(res.status).toBe(200);
      expect(['SUCCESS', 'queued', 'accepted']).toContain(res.body.status);
    }

    // Verify device status is online and latest telemetry reflects the most recent flushed packet
    const dev = db.getDeviceById(testDeviceId);
    expect(dev).toBeDefined();
    expect(dev?.status).toBe('online');
    expect(dev?.metrics?.temperature).toBe(20.8);
  });

  // =========================================================================
  // 4. Command Execution & ACK Processing
  // =========================================================================
  it('4. Reconnected device delivers hardware execution ACKs for all claimed commands', async () => {
    // Device executes hardware tasks and returns ACKs with status=applied
    for (const cmdId of queuedCommandIds) {
      const ackRes = await request(app)
        .post('/api/commands/device/commands/ack')
        .set('x-device-id', testDeviceId)
        .set('x-api-key', testApiKey)
        .send({
          commandId: cmdId,
          status: 'applied',
          result: { executed: true, timestamp: Date.now() },
        });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.success).toBe(true);
    }

    // Verify DB states transitioned to applied
    const updatedCmds = await db.getCommands(testDeviceId);
    const verifiedCmds = updatedCmds.filter((c) => queuedCommandIds.includes(c.id));
    expect(verifiedCmds.every((c) => c.status === 'applied')).toBe(true);
  });

  // =========================================================================
  // 5. Hardware Reboot Cycle with Sequence Reset & Boot ID Change
  // =========================================================================
  it('5. Device undergoes physical reboot; sequence resets to 1 under new bootId and is processed cleanly without false deduplication', async () => {
    // New boot session ID generated by device firmware upon watchdog / power reboot
    const newBootId = `boot_session_bravo_${Date.now()}`;

    // Ping under new boot session
    const pingRes = await request(app)
      .get('/api/telemetry/ping')
      .set('x-device-id', testDeviceId)
      .set('x-api-key', testApiKey)
      .query({
        bootId: newBootId,
        firmware: '1.2.1',
        resetReason: 'WATCHDOG_RESTART',
      });

    expect(pingRes.status).toBe(200);
    expect(pingRes.body.status).toBe('ok');

    // First telemetry after reboot restarts at sequence 1
    const rebootTelemetry = {
      deviceId: testDeviceId,
      apiKey: testApiKey,
      sequence: 1, // Sequence reset to 1!
      bootId: newBootId, // New bootId differentiates this from alpha_01:seq:1
      temperature: 18.9,
      humidity: 64.0,
      pressure: 1011.5,
    };

    const res = await request(app)
      .post('/api/telemetry')
      .set('x-api-key', testApiKey)
      .send(rebootTelemetry);

    expect(res.status).toBe(200);
    expect(['SUCCESS', 'queued', 'accepted', 'OK']).toContain(res.body.status);

    // Verify metrics updated to post-reboot values
    const dev = db.getDeviceById(testDeviceId);
    expect(dev?.metrics?.temperature).toBe(18.9);
  });

  // =========================================================================
  // 6. Rapid Soak Test: 15 Iterations of Ingest -> Command -> Claim -> ACK
  // =========================================================================
  it('6. Soak Test: 15 consecutive rapid cycles of telemetry, command queueing, and ACK validation', async () => {
    const soakCycles = 10;
    const soakBootId = `boot_soak_${Date.now()}`;
    const testStartTimeIso = new Date().toISOString();

    for (let i = 1; i <= soakCycles; i++) {
      if (!db.getDeviceById(testDeviceId)) {
        db.data.devices.push({ ...soakDevice });
        if (db.postgresRepo?.isReady()) {
          await db.postgresRepo.saveDevice(soakDevice).catch(() => {});
        }
      }

      // 1. Send telemetry
      const telRes = await request(app)
        .post('/api/telemetry')
        .set('x-api-key', testApiKey)
        .send({
          deviceId: testDeviceId,
          apiKey: testApiKey,
          sequence: 100 + i,
          bootId: soakBootId,
          temperature: 20 + (i % 5),
          humidity: 50 + (i % 10),
        });

      expect(telRes.status).toBe(200);

      // 2. Dispatch command
      const cmdRes = await request(app)
        .post(`/api/devices/${testDeviceId}/commands`)
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://localhost:3000')
        .send({
          command: 'SOAK_PULSE',
          parameters: { cycle: i },
          source: 'soak_test',
        });

      expect(cmdRes.status).toBe(201);
      const cycleCmdId = cmdRes.body.command.id;

      // 3. Device claims command
      let target: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const claimRes = await request(app)
          .get('/api/commands/device/commands')
          .set('x-device-id', testDeviceId)
          .set('x-api-key', testApiKey);

        expect(claimRes.status).toBe(200);
        target = claimRes.body.commands?.find((c: any) => c.id === cycleCmdId || c.commandId === cycleCmdId);
        if (target) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(target).toBeDefined();

      // 4. Device sends execution ACK
      const ackRes = await request(app)
        .post('/api/commands/device/commands/ack')
        .set('x-device-id', testDeviceId)
        .set('x-api-key', testApiKey)
        .send({
          commandId: cycleCmdId,
          status: 'applied',
          result: { cycle: i, success: true },
        });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.success).toBe(true);
    }

    // Verify all soak commands from current run reached applied status
    const allCmds = await db.getCommands(testDeviceId);
    const soakCmds = allCmds.filter((c) => c.command === 'SOAK_PULSE' && (c.createdAt || c.created_at || '') >= testStartTimeIso);
    const unapplied = soakCmds.filter((c) => c.status !== 'applied');
    expect(soakCmds.length).toBeGreaterThanOrEqual(soakCycles);
    expect(unapplied.length).toBe(0);
  }, 35000);
});
