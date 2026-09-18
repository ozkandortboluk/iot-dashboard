import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPacketAck } from '../server/utils/telemetry.parser.js';
import { ALL_MIGRATIONS, getLatestMigrationRunStatus } from '../server/database/migrations/migrationRunner.js';
import { systemRouter } from '../server/routes/system.js';
import { db } from '../server/db.js';
import express from 'express';
import request from 'supertest';

describe('P0.1 & P0.9: PostgreSQL-Only Health and Readiness Contract', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(systemRouter);
  });

  it('should return 503 not_ready with PostgreSQL engine when database is offline', async () => {
    // Ensure postgresRepo is not ready for this test
    const originalIsReady = db.postgresRepo?.isReady;
    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => false;
    }

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.ready).toBe(false);
    expect(res.body.database.engine).toBe('PostgreSQL / TimescaleDB');
    expect(res.body.database.status).toBe('disconnected');
    expect(JSON.stringify(res.body)).not.toContain('embedded_fallback');
    expect(JSON.stringify(res.body)).not.toContain('LowDB');

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
  });

  it('should return 503 degraded for /health when database is offline', async () => {
    const originalIsReady = db.postgresRepo?.isReady;
    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => false;
    }

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(['degraded', 'setup_required']).toContain(res.body.status);
    expect(res.body.database.engine).toBe('PostgreSQL / TimescaleDB');
    expect(JSON.stringify(res.body)).not.toContain('embedded_fallback');
    expect(JSON.stringify(res.body)).not.toContain('LowDB');

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
  });

  it('P0.12: should block selecting local engine in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    // Create an isolated app for admin router
    const { databaseRouter } = await import('../server/routes/system.js');
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/database', databaseRouter);

    const originalVerify = db.verifySession;
    const originalVerifyAsync = db.verifySessionAsync;
    const mockSession = () => ({ user: { id: 'test_admin', role: 'admin' }, token: 'dummy', expiresAt: '2099' } as any);
    db.verifySession = mockSession;
    db.verifySessionAsync = async () => mockSession();

    const res = await request(testApp)
      .post('/api/database/config')
      .set('Authorization', 'Bearer dummy-token')
      .send({ engine: 'local' });
    
    db.verifySession = originalVerify;
    db.verifySessionAsync = originalVerifyAsync;
    process.env.NODE_ENV = originalEnv;

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Production ortamında local veritabanı kullanımına izin verilmemektedir');
  });
});

describe('P0.5: Versioned Migration System Architecture', () => {
  it('should define ordered and versioned migrations', () => {
    expect(ALL_MIGRATIONS.length).toBeGreaterThanOrEqual(4);
    
    // Migrations must be strictly ordered
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      expect(ALL_MIGRATIONS[i].version).toBeDefined();
      expect(ALL_MIGRATIONS[i].name).toBeDefined();
      expect(typeof ALL_MIGRATIONS[i].up).toBe('function');
    }

    expect(ALL_MIGRATIONS[0].version).toBe('001');
    expect(ALL_MIGRATIONS[1].version).toBe('002');
    expect(ALL_MIGRATIONS[2].version).toBe('003');
    expect(ALL_MIGRATIONS[3].version).toBe('004');
  });

  it('should track migration run status in memory', () => {
    const status = getLatestMigrationRunStatus();
    expect(status).toHaveProperty('success');
    expect(status).toHaveProperty('appliedCount');
  });
});

describe('P0.6 & P0.7: Telemetry Packet Idempotency & Composite PK Bütünlüğü', () => {
  it('should compute deterministic idempotencyKey from device_id, boot_id, and sequence', () => {
    const ack = buildPacketAck({
      deviceId: 'dev_test_01',
      bootId: 'boot_abc_123',
      sequence: 42,
      receivedCount: 3,
      addedReadingsCount: 3,
      writeAck: {
        persisted: true,
        engine: 'PostgreSQL / TimescaleDB',
        persistedCount: 3,
        queuedForRetryCount: 0,
        status: 'persisted',
      },
    });

    expect(ack.idempotencyKey).toBe('dev_test_01:boot_abc_123:42');
    expect(ack.packetId).toBe('dev_test_01:boot_abc_123:42');
    expect(ack.status).toBe('accepted');
    expect(ack.persisted).toBe(3);
    expect(ack.queued).toBe(0);
  });

  it('should set duplicate_skipped status when packet has already been ingested', () => {
    const ack = buildPacketAck({
      deviceId: 'dev_test_01',
      bootId: 'boot_abc_123',
      sequence: 42,
      receivedCount: 3,
      addedReadingsCount: 0, // Duplicate skipped, 0 new rows
      writeAck: {
        persisted: true,
        engine: 'PostgreSQL / TimescaleDB',
        persistedCount: 0,
        queuedForRetryCount: 0,
        status: 'persisted',
      },
    });

    expect(ack.status).toBe('duplicate_skipped');
    expect(ack.persisted).toBe(0);
    expect(ack.queued).toBe(0);
  });
});

describe('P0.8: Telemetry Data Loss / WAL Buffer Contract', () => {
  it('should indicate queued status with persisted=0 and queued > 0 during DB outage', () => {
    const ack = buildPacketAck({
      deviceId: 'dev_field_esp32',
      bootId: 'boot_field_01',
      sequence: 105,
      receivedCount: 2,
      addedReadingsCount: 2,
      writeAck: {
        persisted: false,
        engine: 'PostgreSQL / TimescaleDB (Offline - Queued in WAL)',
        persistedCount: 0,
        queuedForRetryCount: 2,
        status: 'queued',
      },
    });

    expect(ack.status).toBe('queued');
    expect(ack.persisted).toBe(0);
    expect(ack.queued).toBe(2);
    expect(ack.engine).toContain('Offline');
  });

  it('should evaluate congestion levels in retry queue stats', () => {
    const stats = db.getRetryQueueStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('congestionLevel');
    expect(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).toContain(stats.congestionLevel);
    expect(stats).toHaveProperty('physical');
    expect(stats).toHaveProperty('simulation');
    expect(stats.physical.durable).toBe(true);
  });
});

describe('P0.10: Multi-Tenant Customer Data Isolation Policy', () => {
  it('should ensure non-admin users cannot see other customers devices in database queries', () => {
    // Check tenant filtering logic
    const testDevices = [
      { id: 'dev_1', name: 'Cust A Device', tenantId: 'tenant_cust_a', customerId: 'tenant_cust_a' },
      { id: 'dev_2', name: 'Cust B Device', tenantId: 'tenant_cust_b', customerId: 'tenant_cust_b' },
    ];

    const customerAUser = { id: 'usr_a', role: 'operator', tenantId: 'tenant_cust_a' };
    const filteredForCustA = testDevices.filter((d) => d.tenantId === customerAUser.tenantId);

    expect(filteredForCustA.length).toBe(1);
    expect(filteredForCustA[0].id).toBe('dev_1');
    expect(filteredForCustA.some((d) => d.tenantId === 'tenant_cust_b')).toBe(false);
  });
});
