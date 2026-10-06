import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PostgresRepository } from '../server/database/postgres.js';
import { systemRouter } from '../server/routes/system.js';
import { db } from '../server/db.js';
import { DatabaseState } from '../types.js';

describe('DISABLE_AUTO_MIGRATION Readiness and Schema Verification Gate', () => {
  const originalEnv = { ...process.env };
  let app: express.Application;
  let repo: PostgresRepository;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(systemRouter);
    app.use('/api', systemRouter);
    repo = new PostgresRepository();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1. isReady() must return false when DISABLE_AUTO_MIGRATION=true and schema is unverified', () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const mockPool: any = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      ending: false,
      ended: false,
    };

    repo.setPool(mockPool);
    repo.setConnected(true, false);

    // Previously, line 223 caused isReady() to blindly return true.
    // Now it must strictly respect schema readiness.
    expect(repo.isReady()).toBe(false);
  });

  it('2. /health/ready and /api/health/ready must return 503 when DISABLE_AUTO_MIGRATION=true and schema is not ensured', async () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const originalIsReady = db.postgresRepo?.isReady;
    const originalGetDbState = db.getDatabaseState;

    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => false;
    }
    db.getDatabaseState = () => DatabaseState.DB_UNAVAILABLE;

    const res1 = await request(app).get('/health/ready');
    expect(res1.status).toBe(503);
    expect(res1.body.ready).toBe(false);
    expect(res1.body.status).toBe('not_ready');

    const res2 = await request(app).get('/api/health/ready');
    expect(res2.status).toBe(503);
    expect(res2.body.ready).toBe(false);

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
    db.getDatabaseState = originalGetDbState;
  });

  it('3. /health/ready must return 200 when DISABLE_AUTO_MIGRATION=true and schema contract is strictly verified', async () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const originalIsReady = db.postgresRepo?.isReady;
    const originalGetDbState = db.getDatabaseState;

    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => true;
    }
    db.getDatabaseState = () => DatabaseState.READY;

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.status).toBe('ready');

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
    db.getDatabaseState = originalGetDbState;
  });

  it('4. ensureTelemetrySchema() with DISABLE_AUTO_MIGRATION=true must keep isSchemaEnsured=false if schema contract audit fails', async () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const mockPool: any = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      ending: false,
      ended: false,
    };

    repo.setPool(mockPool);
    repo.setConnected(true, false);

    // Mock verifySchemaContract to simulate missing required tables/columns
    vi.spyOn(repo, 'verifySchemaContract').mockResolvedValue(false);

    await repo.ensureTelemetrySchema(true);

    expect(repo.getIsSchemaEnsured()).toBe(false);
    expect(repo.isReady()).toBe(false);
  });

  it('5. ensureTelemetrySchema() with DISABLE_AUTO_MIGRATION=true must set isSchemaEnsured=true when schema contract is valid', async () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const mockPool: any = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      ending: false,
      ended: false,
    };

    repo.setPool(mockPool);
    repo.setConnected(true, false);

    // Mock verifySchemaContract to simulate a healthy, fully migrated schema
    vi.spyOn(repo, 'verifySchemaContract').mockResolvedValue(true);

    await repo.ensureTelemetrySchema(true);

    expect(repo.getIsSchemaEnsured()).toBe(true);
    expect(repo.isReady()).toBe(true);
  });

  it('6. isReady() must return false if latest migration run failed even if DISABLE_AUTO_MIGRATION=true', () => {
    process.env.DISABLE_AUTO_MIGRATION = 'true';

    const mockPool: any = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      ending: false,
      ended: false,
    };

    repo.setPool(mockPool);
    repo.setConnected(true, true); // schema was ensured

    // Simulate migration failure in runner
    vi.spyOn(repo, 'getLatestMigrationRunStatus').mockReturnValue({
      success: false,
      appliedCount: 5,
      error: 'Migration 006 failed to apply constraint',
    });

    expect(repo.isReady()).toBe(false);
  });

  it('7. When DISABLE_AUTO_MIGRATION is unset, unverified schema must return readiness 503', async () => {
    delete process.env.DISABLE_AUTO_MIGRATION;

    const originalIsReady = db.postgresRepo?.isReady;
    const originalGetDbState = db.getDatabaseState;

    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => false;
    }
    db.getDatabaseState = () => DatabaseState.DB_UNAVAILABLE;

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
    db.getDatabaseState = originalGetDbState;
  });

  it('8. When DISABLE_AUTO_MIGRATION is unset, verified schema must return readiness 200', async () => {
    delete process.env.DISABLE_AUTO_MIGRATION;

    const originalIsReady = db.postgresRepo?.isReady;
    const originalGetDbState = db.getDatabaseState;

    if (db.postgresRepo) {
      db.postgresRepo.isReady = () => true;
    }
    db.getDatabaseState = () => DatabaseState.READY;

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.status).toBe('ready');

    if (db.postgresRepo && originalIsReady) {
      db.postgresRepo.isReady = originalIsReady;
    }
    db.getDatabaseState = originalGetDbState;
  });
});
