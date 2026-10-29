import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../server/db.js';
import { setupService } from '../../server/services/setup.service.js';
import { systemSecretsService } from '../../server/services/systemSecrets.service.js';
import { databaseRouter } from '../../server/routes/system.js';

describe('Database Target & Role Switch Security Guard', () => {
  let app: express.Express;
  let originalVerifySessionAsync: any;
  let originalVerifySession: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/database', databaseRouter);

    originalVerifySessionAsync = db.verifySessionAsync;
    originalVerifySession = db.verifySession;
  });

  afterEach(() => {
    db.verifySessionAsync = originalVerifySessionAsync;
    db.verifySession = originalVerifySession;
    vi.restoreAllMocks();
  });

  const mockUserSession = (role: string = 'admin') => {
    const session = {
      user: { id: 'admin_usr_1', email: 'admin@nexusnode.io', name: 'Admin User', role },
      token: 'valid_test_token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    db.verifySession = () => session as any;
    db.verifySessionAsync = async () => session as any;
  };

  it('1. MUST reject unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/database/switch-target')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'iot_prod_app',
        password: 'secure_password_test',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(401);
  });

  it('2. MUST reject non-admin (operator) users with 403', async () => {
    mockUserSession('operator');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer dummy_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'iot_prod_app',
        password: 'secure_password_test',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Yönetici (Admin) yetkisine');
  });

  it('3. rejects target changes even when candidate schema and privileges appear valid', async () => {
    mockUserSession('admin');
    const testConnectionSpy = vi.spyOn(setupService, 'testConnection');
    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets');
    const saveRuntimeSpy = vi.spyOn(setupService, 'saveRuntimeSecretConfig');
    const saveUrlSpy = vi.spyOn(db, 'savePostgresUrl');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb', port: 5432, database: 'iot_production',
        user: 'iot_prod_app', password: 'candidate_password', confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('devre dışıdır');
    expect(testConnectionSpy).not.toHaveBeenCalled();
    expect(updateSecretsSpy).not.toHaveBeenCalled();
    expect(saveRuntimeSpy).not.toHaveBeenCalled();
    expect(saveUrlSpy).not.toHaveBeenCalled();
  });
});

describe('Database Password Rotation Guard (/api/database/rotate-password)', () => {
  let app: express.Express;
  let originalVerifySessionAsync: any;
  let originalVerifySession: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/database', databaseRouter);

    originalVerifySessionAsync = db.verifySessionAsync;
    originalVerifySession = db.verifySession;
  });

  afterEach(() => {
    db.verifySessionAsync = originalVerifySessionAsync;
    db.verifySession = originalVerifySession;
    vi.restoreAllMocks();
  });

  const mockUserSession = (role: string = 'admin') => {
    const session = {
      user: { id: 'admin_usr_1', email: 'admin@nexusnode.io', name: 'Admin User', role },
      token: 'valid_test_token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    db.verifySession = () => session as any;
    db.verifySessionAsync = async () => session as any;
  };

  it('1. MUST reject unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/database/rotate-password')
      .send({
        currentPassword: 'current_pass_123',
        newPassword: 'new_strong_pass_123',
      });

    expect(res.status).toBe(401);
  });

  it('2. MUST reject non-admin (operator) requests with 403', async () => {
    mockUserSession('operator');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer dummy_token')
      .send({
        currentPassword: 'current_pass_123',
        newPassword: 'new_strong_pass_123',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Yönetici (Admin) yetkisine');
  });

  it('3. rejects application-side PostgreSQL password rotation without mutating credentials or pools', async () => {
    mockUserSession('admin');
    const testConnectionSpy = vi.spyOn(setupService, 'testConnection');
    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets');
    const saveRuntimeSpy = vi.spyOn(setupService, 'saveRuntimeSecretConfig');
    const saveUrlSpy = vi.spyOn(db, 'savePostgresUrl');
    const recyclePoolSpy = vi.spyOn(db, 'recyclePgPool');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({ currentPassword: 'current_password', newPassword: 'candidate_password_123' });

    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('devre dışıdır');
    expect(testConnectionSpy).not.toHaveBeenCalled();
    expect(updateSecretsSpy).not.toHaveBeenCalled();
    expect(saveRuntimeSpy).not.toHaveBeenCalled();
    expect(saveUrlSpy).not.toHaveBeenCalled();
    expect(recyclePoolSpy).not.toHaveBeenCalled();
  });
});
