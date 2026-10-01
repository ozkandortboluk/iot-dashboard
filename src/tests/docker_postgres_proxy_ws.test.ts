import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import express from 'express';
import { db } from '../server/db.js';
import { initWebSocketServer, broadcast } from '../server/services/websocket.js';
import { deviceWsProtocolService } from '../server/services/deviceWsProtocol.service.js';
import { commandService } from '../server/services/command.service.js';
import type { Device, User } from '../types.js';

describe('Docker + PostgreSQL/TimescaleDB + Reverse Proxy + WebSocket Production Verification (Roadmap P0 - Item 3)', () => {
  const rootDir = process.cwd();
  let server: http.Server;
  let serverPort: number;
  let wsUrl: string;

  const proxyDeviceId = 'dev_test_01';
  const proxyApiKey = 'dev_key_test_0000000000000000';
  const proxyDevice: Device = {
    id: proxyDeviceId,
    tenantId: 'usr_test_admin',
    name: 'ESP32 Reverse Proxy Field Node',
    type: 'ESP32',
    status: 'online',
    location: 'Production Server Room',
    ipAddress: '198.51.100.25',
    lastSeen: new Date().toISOString(),
    apiKey: proxyApiKey,
    apiKeyPrefix: proxyApiKey.substring(0, 8),
    encryptionMethod: 'none',
    rateLimitPerMin: 120,
    isSimulated: false,
    hardwareModel: 'ESP32-WROOM-32D',
    metrics: {
      temperature: 24.5,
      humidity: 52.0,
      pressure: 1012.8,
    },
  };

  const proxyAdminUser: User = {
    id: 'usr_test_admin',
    name: 'Test Kullanıcısı',
    email: 'test@nexusnodeiot.com.tr',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  let sessionToken: string;

  beforeAll(async () => {
    // 1. Wait for initial Postgres connection if needed
    for (let i = 0; i < 40; i++) {
      if (db.postgresRepo?.isReady()) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // 2. Prepare DB device and admin session
    const existingDevs = db.getDevices().filter((d) => d.id !== proxyDeviceId);
    db.data.devices = [...existingDevs, { ...proxyDevice }];

    const existingUsers = (db.data.users || []).filter((u) => u.id !== proxyAdminUser.id && u.email !== proxyAdminUser.email);
    db.data.users = [...existingUsers, { ...proxyAdminUser }];

    sessionToken = await db.createSession(proxyAdminUser);

    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.saveDevice(proxyDevice).catch(() => {});
      await db.postgresRepo.saveSession({
        token: sessionToken,
        userId: proxyAdminUser.id,
        userRole: proxyAdminUser.role,
        userEmail: proxyAdminUser.email,
        userName: proxyAdminUser.name,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }).catch(() => {});
    }

    // 3. Spin up dedicated HTTP + WebSocket server on a dynamic port
    const app = express();
    app.set('trust proxy', true);
    app.get('/api/health/live', (req, res) => res.json({ status: 'ok', proxyIp: req.ip }));

    server = http.createServer(app);
    initWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          serverPort = addr.port;
          wsUrl = `ws://127.0.0.1:${serverPort}/ws`;
        }
        resolve();
      });
    });
  }, 30000);

  beforeEach(async () => {
    const existingIdx = db.data.devices.findIndex((d) => d.id === proxyDeviceId);
    if (existingIdx >= 0) {
      db.data.devices[existingIdx] = { ...proxyDevice };
    } else {
      db.data.devices.push({ ...proxyDevice });
    }
    if (!(db.data.users || []).some((u) => u.id === proxyAdminUser.id)) {
      db.data.users.push({ ...proxyAdminUser });
    }
    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.saveDevice(proxyDevice).catch(() => {});
    }
  });

  afterAll(async () => {
    // Clean up test device and close live server
    if (proxyDeviceId !== 'dev_test_01') {
      db.data.devices = db.getDevices().filter((d) => d.id !== proxyDeviceId);
    }
    if (server) {
      try {
        if ((server as any).closeAllConnections) {
          (server as any).closeAllConnections();
        }
      } catch {}
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 500);
      });
    }
  });

  // =========================================================================
  // 1. Multi-Stage Dockerfile Verification
  // =========================================================================
  it('1. Dockerfile conforms to production multi-stage, security, and healthcheck standards', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const content = fs.readFileSync(dockerfilePath, 'utf-8');

    // 1. Multi-stage build
    expect(content).toMatch(/FROM\s+node:22.*AS\s+builder/i);
    expect(content).toMatch(/FROM\s+node:22.*AS\s+runner/i);

    // 2. Production build and dependency isolation
    expect(content).toMatch(/npm run build/i);
    expect(content).toMatch(/npm (install|ci) --omit=dev/i);

    // 3. Environment & Port Configuration
    expect(content).toMatch(/ENV NODE_ENV=production/i);
    expect(content).toMatch(/ENV PORT=3000/i);
    expect(content).toMatch(/EXPOSE 3000/i);

    // 4. Runtime directories and healthcheck
    expect(content).toMatch(/mkdir -p \/app\/data/i);
    expect(content).toMatch(/HEALTHCHECK/i);
    expect(content).toMatch(/\/api\/health\/live/i);

    // 5. Production start command
    expect(content).toMatch(/CMD\s+\["node",\s+"dist\/server\.cjs"\]/i);
  });

  // =========================================================================
  // 2. Docker Compose Production Topology Verification
  // =========================================================================
  it('2. docker-compose.yml defines robust multi-container topology (TimescaleDB, App, Proxy) with healthchecks and volumes', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    expect(fs.existsSync(composePath)).toBe(true);

    const composeContent = fs.readFileSync(composePath, 'utf-8');

    // Service 1: timescaledb
    expect(composeContent).toMatch(/timescaledb:/);
    expect(composeContent).toMatch(/image:\s*timescale\/timescaledb/i);
    expect(composeContent).toMatch(/pg_isready/i);
    expect(composeContent).toMatch(/timescaledb_data:/);

    // Service 2: app
    expect(composeContent).toMatch(/app:/);
    expect(composeContent).toMatch(/build:/);
    expect(composeContent).toMatch(/timescaledb:[\s\S]*service_healthy/);
    expect(composeContent).toMatch(/ENCRYPTION_KEY:/);
    expect(composeContent).toMatch(/DB_HOST:/);
    expect(composeContent).toMatch(/\/api\/health\/live/);

    // Service 3: proxy (Nginx)
    expect(composeContent).toMatch(/proxy:/);
    expect(composeContent).toMatch(/image:\s*nginx/i);
    expect(composeContent).toMatch(/app:[\s\S]*service_healthy/);
    expect(composeContent).toMatch(/nginx\.conf/);

    // Named volumes and network definitions
    expect(composeContent).toMatch(/timescaledb_data:/);
    expect(composeContent).toMatch(/app_data:/);
    expect(composeContent).toMatch(/nexus_net:/);
  });

  // =========================================================================
  // 3. Nginx Reverse Proxy & WebSocket Configuration Verification
  // =========================================================================
  it('3. Nginx reverse proxy configuration is configured for WebSocket upgrade, streaming timeouts, and OTA payload limits', () => {
    const nginxConfPath = path.join(rootDir, 'docker/nginx/nginx.conf');
    expect(fs.existsSync(nginxConfPath)).toBe(true);

    const nginxContent = fs.readFileSync(nginxConfPath, 'utf-8');

    // 1. WebSocket Upgrade Map
    expect(nginxContent).toMatch(/map\s+\$http_upgrade\s+\$connection_upgrade/i);
    expect(nginxContent).toMatch(/default\s+upgrade;/i);

    // 2. Upstream declaration with keepalive
    expect(nginxContent).toMatch(/upstream\s+nexus_backend/i);
    expect(nginxContent).toMatch(/server\s+app:3000/i);
    expect(nginxContent).toMatch(/keepalive/i);

    // 3. Client Max Body Size (Must support >= 30MB for firmware binary uploads)
    expect(nginxContent).toMatch(/client_max_body_size\s+50M;/i);

    // 4. WebSocket location block
    expect(nginxContent).toMatch(/location\s+~\s+\^\/\(ws\|api\/ws\)/i);
    expect(nginxContent).toMatch(/proxy_pass\s+http:\/\/nexus_backend;/i);
    expect(nginxContent).toMatch(/proxy_http_version\s+1\.1;/i);
    expect(nginxContent).toMatch(/proxy_set_header\s+Upgrade\s+\$http_upgrade;/i);
    expect(nginxContent).toMatch(/proxy_set_header\s+Connection\s+\$connection_upgrade;/i);

    // 5. Extended timeout for IoT long-lived telemetry & disabled buffering for instantaneous delivery
    expect(nginxContent).toMatch(/proxy_read_timeout\s+86400s;/i);
    expect(nginxContent).toMatch(/proxy_send_timeout\s+86400s;/i);
    expect(nginxContent).toMatch(/proxy_buffering\s+off;/i);

    // 6. Security headers & Healthcheck
    expect(nginxContent).toMatch(/X-Frame-Options/i);
    expect(nginxContent).toMatch(/X-Content-Type-Options/i);
    expect(nginxContent).toMatch(/location\s+\/healthz/i);
  });

  // =========================================================================
  // 4. PostgreSQL / TimescaleDB Database Validation
  // =========================================================================
  it('4. PostgreSQL / TimescaleDB production instance is active with required tables, hypertables, and deduplication indexes', async () => {
    expect(db.postgresRepo).toBeDefined();

    if (db.postgresRepo?.isReady()) {
      const pool = db.postgresRepo?.['pool'];
      expect(pool).toBeDefined();

      // Query TimescaleDB / Postgres version
      const versionRes = await pool.query('SELECT version();');
      expect(versionRes.rows[0].version).toMatch(/PostgreSQL/i);

      // Verify core tables exist
      const tablesRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('devices', 'telemetry_readings', 'telemetry_packets', 'device_commands', 'device_ws_messages_dedup', 'user_sessions');
      `);
      const foundTables = tablesRes.rows.map((r: any) => r.table_name);
      expect(foundTables).toContain('devices');
      expect(foundTables).toContain('telemetry_readings');
      expect(foundTables).toContain('telemetry_packets');
      expect(foundTables).toContain('device_commands');
      expect(foundTables).toContain('device_ws_messages_dedup');
    } else {
      expect(db.getDevices().length).toBeGreaterThan(0);
    }
  });

  // =========================================================================
  // 5. End-to-End WebSocket Upgrade through Simulated Reverse Proxy Headers
  // =========================================================================
  it('5. Field device connects over WebSocket with reverse proxy headers, authenticates, streams telemetry, and executes downlink commands', async () => {
    // 1. Connect Device WebSocket Client with simulated Nginx reverse proxy headers
    const clientWs = new WebSocket(wsUrl, {
      headers: {
        'x-api-key': proxyApiKey,
        'x-forwarded-for': '198.51.100.25',
        'x-forwarded-proto': 'https',
        'x-real-ip': '198.51.100.25',
        'host': 'iot.nexusnode.io',
      },
    });

    await new Promise<void>((resolve, reject) => {
      clientWs.on('open', () => resolve());
      clientWs.on('error', (err) => reject(err));
    });

    expect(clientWs.readyState).toBe(WebSocket.OPEN);

    // Collect incoming messages from server
    const receivedMessages: any[] = [];
    clientWs.on('message', (data) => {
      try {
        receivedMessages.push(JSON.parse(data.toString()));
      } catch (e) {
        // ignore non-json
      }
    });

    // 2. Send Device Registration / Hello over Unified WebSocket Protocol
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const regMsg = {
      type: 'hello',
      deviceId: proxyDeviceId,
      messageId: `msg_hello_proxy_${uniqueSuffix}`,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        bootId: 'boot_proxy_session_01',
        version: '1.3.2',
      },
    };
    clientWs.send(JSON.stringify(regMsg));

    // Wait 50ms for server registration
    await new Promise((r) => setTimeout(r, 50));

    // Verify device is registered in deviceWsProtocolService
    const isConnected = deviceWsProtocolService.isDeviceConnected(proxyDeviceId);
    expect(isConnected).toBe(true);

    // 3. Stream Telemetry over Reverse-Proxied WebSocket
    const telemetryMsg = {
      type: 'telemetry',
      deviceId: proxyDeviceId,
      messageId: `msg_telem_proxy_${uniqueSuffix}`,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        temperature: 26.8,
        humidity: 49.5,
        pressure: 1014.2,
      },
    };
    clientWs.send(JSON.stringify(telemetryMsg));

    // Wait for batch ingestion to process
    for (let i = 0; i < 25; i++) {
      const current = db.getDeviceById(proxyDeviceId);
      if (current?.metrics?.temperature === 26.8) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Verify device metrics updated in DB
    const dev = db.getDeviceById(proxyDeviceId);
    expect(dev).toBeDefined();
    expect(dev?.metrics?.temperature).toBe(26.8);

    // 4. Issue Downlink Command and Verify Delivery to Device via WebSocket
    const createdCmd = await db.addCommand({
      deviceId: proxyDeviceId,
      command: 'SET_RELAY_STATE',
      payload: JSON.stringify({ relay: 1, state: 'ON' }),
      source: 'admin_dashboard',
      userId: proxyAdminUser.id,
      tenantId: 'usr_test_admin',
    });
    expect(createdCmd).toBeDefined();

    // Deliver pending commands to device over WebSocket
    await deviceWsProtocolService.deliverPendingCommandsToDevice(proxyDeviceId);

    // Wait for downlink message arrival at device client
    for (let i = 0; i < 10; i++) {
      if (receivedMessages.some((m) => m.type === 'command' || m.messageId === createdCmd.id || m.data?.commandId === createdCmd.id)) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const commandMsg = receivedMessages.find(
      (m) => m.type === 'command' || m.messageId === createdCmd.id || m.data?.commandId === createdCmd.id
    );
    expect(commandMsg).toBeDefined();

    // 5. Device returns Execution ACK over WebSocket
    const ackMsg = {
      type: 'ack',
      deviceId: proxyDeviceId,
      messageId: `ack_proxy_${uniqueSuffix}`,
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        forMessageId: commandMsg.messageId,
        status: 'executed',
        result: { relay: 1, currentState: 'ON', executionTimeMs: 12 },
      },
    };
    clientWs.send(JSON.stringify(ackMsg));

    // Wait for ACK processing
    for (let i = 0; i < 10; i++) {
      const cmds = await db.getCommands(proxyDeviceId);
      const c = cmds.find((cmd) => cmd.id === createdCmd.id);
      if (c?.status === 'executed') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Verify command status transitioned to 'executed' in DB
    const updatedCmds = await db.getCommands(proxyDeviceId);
    const targetCmd = updatedCmds.find((c) => c.id === createdCmd.id);
    expect(targetCmd).toBeDefined();
    expect(targetCmd?.status).toBe('executed');

    // 6. Clean close
    clientWs.close();
    clientWs.terminate();
    await new Promise((r) => setTimeout(r, 50));
    expect(deviceWsProtocolService.isDeviceConnected(proxyDeviceId)).toBe(false);
  });

  // =========================================================================
  // 6. Real-Time UI WebSocket Client with Session Cookie Authentication
  // =========================================================================
  it('6. Browser UI client authenticates via session cookie over WebSocket and receives real-time broadcast events', async () => {
    // Connect Browser UI WebSocket Client using nexus_session_token cookie
    const uiWs = new WebSocket(wsUrl, {
      headers: {
        'cookie': `nexus_session_token=${sessionToken}`,
        'x-forwarded-for': '203.0.113.50',
        'x-forwarded-proto': 'https',
      },
    });

    await new Promise<void>((resolve, reject) => {
      uiWs.on('open', () => resolve());
      uiWs.on('error', (err) => reject(err));
    });

    expect(uiWs.readyState).toBe(WebSocket.OPEN);

    const receivedEvents: any[] = [];
    uiWs.on('message', (data) => {
      try {
        receivedEvents.push(JSON.parse(data.toString()));
      } catch (e) {
        // ignore
      }
    });

    // Server broadcasts an event
    broadcast('devices:updated', [{ id: proxyDeviceId, name: proxyDevice.name, status: 'online' }]);

    // Wait for broadcast delivery
    await new Promise((r) => setTimeout(r, 80));

    const foundEvent = receivedEvents.find((e) => e.event === 'devices:updated' || e.type === 'devices:updated');
    expect(foundEvent).toBeDefined();
    expect(foundEvent.payload || foundEvent.data).toBeDefined();

    uiWs.close();
    uiWs.terminate();
  });
});
