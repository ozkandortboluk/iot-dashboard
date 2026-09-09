import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../server/db.js';
import { CommandService } from '../server/services/command.service.js';
import { tenantSecurityService } from '../server/services/tenantSecurity.service.js';
import type { Device, DeviceCommand, User } from '../types.js';

describe('Command Lifecycle & Idempotency Test Suite (Roadmap 3.3)', () => {
  const commandService = new CommandService();
  const testTenantId = 'tenant_cmd_test_01';
  const otherTenantId = 'tenant_cmd_other_02';

  const testPhysicalDev: Device = {
    id: 'dev_physical_cmd_01',
    name: 'Physical Test ESP32 Controller',
    status: 'online',
    isSimulated: false,
    apiKey: 'nex_cmd_test_key_123',
    tenantId: testTenantId,
    location: 'Saha 1',
    ipAddress: '192.168.1.50',
    type: 'pump_controller',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    supportedOutputs: ['RELAY_1', 'RELAY_2', 'PWM_1'],
    metrics: {
      temperature: 24,
      pressure: 1.2,
    },
  };

  const testOtherDev: Device = {
    id: 'dev_other_tenant_01',
    name: 'Other Tenant Pump',
    status: 'online',
    isSimulated: false,
    apiKey: 'nex_cmd_other_key_456',
    tenantId: otherTenantId,
    location: 'Bölge B',
    ipAddress: '192.168.1.51',
    type: 'sensor',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    metrics: {},
  };

  const testUser: User = {
    id: 'usr_cmd_manager',
    name: 'Command Manager',
    email: 'cmd@example.com',
    role: 'customer',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset test devices in memory
    const existing = db.getDevices().filter(d => d.id !== testPhysicalDev.id && d.id !== testOtherDev.id);
    db.data.devices = [...existing, { ...testPhysicalDev }, { ...testOtherDev }];
    // Reset commands
    if (db.data.commands) {
      db.data.commands = db.data.commands.filter(
        c => c.deviceId !== testPhysicalDev.id && c.deviceId !== testOtherDev.id
      );
    }
  });

  it('1. should create a command with initial status "queued"', async () => {
    const cmd = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
      timeoutSeconds: 45,
    });

    expect(cmd).toBeDefined();
    expect(cmd.id).toBeDefined();
    expect(cmd.status).toBe('queued');
    expect(cmd.timeoutSeconds).toBe(45);
    expect(cmd.deviceId).toBe(testPhysicalDev.id);
  });

  it('2. should enforce idempotency: same idempotencyKey returns existing command without creating duplicate', async () => {
    const idempotencyKey = 'req_uniq_idem_abc123';

    const cmd1 = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
      idempotencyKey,
    });

    const cmd2 = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
      idempotencyKey,
    });

    expect(cmd1.id).toBe(cmd2.id);
    const allForDev = await db.getCommands(testPhysicalDev.id);
    const duplicates = allForDev.filter(c => c.idempotencyKey === idempotencyKey);
    expect(duplicates.length).toBe(1);
  });

  it('3. should transition status: queued -> claimed/sent when device polls or claims commands', async () => {
    const cmd = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
    });

    // Device polls pending commands (downlink)
    const delivered = await commandService.getAndDeliverPendingCommands(testPhysicalDev.id);
    expect(delivered.length).toBeGreaterThanOrEqual(1);

    const match = delivered.find(c => c.id === cmd.id);
    expect(match).toBeDefined();
    expect(['sent', 'claimed']).toContain(match!.status);

    // Verify in db
    const updated = (await db.getCommands(testPhysicalDev.id)).find(c => c.id === cmd.id);
    expect(['sent', 'claimed']).toContain(updated?.status);
    expect(updated?.sentAt || updated?.claimed_at).toBeDefined();
  });

  it('4. should process device ACK: status -> acknowledged / applied and update physical state only upon ACK', async () => {
    const cmd = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
    });

    // Deliver
    await commandService.getAndDeliverPendingCommands(testPhysicalDev.id);

    // Initial state before ACK
    const devBeforeAck = db.getDeviceById(testPhysicalDev.id);
    expect((devBeforeAck?.metrics as any)?.RELAY_1?.value ?? 0).toBe(0);

    // Device executes hardware relay and reports ACK
    const ackResult = await commandService.handleCommandAck(
      testPhysicalDev.id,
      { id: cmd.id, status: 'applied', result: 'Relay 1 turned ON successfully' }
    );

    expect(ackResult).toBeGreaterThanOrEqual(1);

    const cmdAfterAck = (await db.getCommands(testPhysicalDev.id)).find(c => c.id === cmd.id);
    expect(['applied', 'acknowledged', 'executed']).toContain(cmdAfterAck?.status);
    expect(cmdAfterAck?.acknowledgedAt || cmdAfterAck?.executedAt).toBeDefined();
  });

  it('5. should allow canceling a pending command', async () => {
    const cmd = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_2',
      outputId: 'RELAY_2',
      value: '1',
      source: 'manual',
    });

    expect(cmd.status).toBe('queued');

    const cancelled = await db.cancelCommand(cmd.id, testTenantId);
    expect(cancelled).toBe(true);

    const cmdAfterCancel = (await db.getCommands(testPhysicalDev.id)).find(c => c.id === cmd.id);
    expect(cmdAfterCancel?.status).toBe('cancelled');
  });

  it('6. should detect and expire stale commands exceeding timeoutSeconds', async () => {
    const cmd = await db.addCommand({
      tenantId: testTenantId,
      customerId: testTenantId,
      deviceId: testPhysicalDev.id,
      userId: testUser.id,
      commandType: 'SET_OUTPUT',
      command: 'RELAY_1',
      outputId: 'RELAY_1',
      value: '1',
      source: 'manual',
      timeoutSeconds: 1, // 1 second timeout
    });

    // Artificially age the command by modifying its createdAt
    const inDb = (db.data.commands || []).find(c => c.id === cmd.id);
    if (inDb) {
      inDb.createdAt = new Date(Date.now() - 10000).toISOString();
      inDb.created_at = inDb.createdAt;
    }

    // Trigger checkExpiredCommands
    const expiredCommands = await commandService.checkExpiredCommands(2);
    expect(expiredCommands.length).toBeGreaterThanOrEqual(1);

    const cmdAfterExpiry = (await db.getCommands(testPhysicalDev.id)).find(c => c.id === cmd.id);
    expect(cmdAfterExpiry?.status).toBe('timeout');
  });

  it('7. should enforce multi-tenant isolation: customer cannot access or command other tenant device', () => {
    // testUser belongs to testTenantId
    const targetDev = db.getDeviceById(testOtherDev.id)!;
    const canAccess = tenantSecurityService.canUserAccessDevice(
      testUser,
      targetDev,
      db.data.tenantMemberships || []
    );

    expect(canAccess).toBe(false);
  });
});
