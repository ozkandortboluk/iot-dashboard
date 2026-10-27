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

  it('3. MUST require confirmDatabaseSwitch flag', async () => {
    mockUserSession('admin');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'iot_prod_app',
        password: 'secure_password_test',
        confirmDatabaseSwitch: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('confirmDatabaseSwitch');
  });

  it('4. MUST validate host, port, database, user, and password parameters', async () => {
    mockUserSession('admin');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: '',
        database: 'iot_production',
        user: 'iot_prod_app',
        password: '',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('zorunludur');
  });

  it('5. MUST pre-validate connection and reject when test probe fails (without altering active DB)', async () => {
    mockUserSession('admin');

    const testConnSpy = vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: false,
      message: 'Veritabanı kimlik doğrulaması başarısız: Kullanıcı adı veya şifre hatalı.',
      errorCode: 'AUTH_FAILED',
    } as any);

    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'iot_prod_app',
        password: 'wrong_password',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('mevcut veritabanı bağlantısı korunmuştur');
    expect(updateSecretsSpy).not.toHaveBeenCalled();
    expect(testConnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'iot_prod_app', database: 'iot_production' }),
      { allowCompletedSetup: true }
    );
  });

  it('6. MUST prevent switching to wrong/empty database when mandatory tables are missing', async () => {
    mockUserSession('admin');

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'PostgreSQL bağlantısı başarılı.',
      tablesStatus: {
        users: true,
        devices: false, // devices table is missing!
        telemetry_readings: false, // telemetry table is missing!
      },
      permissionsStatus: {
        schema_usage: true,
        users_select: true,
      },
    } as any);

    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'foreign_or_empty_db',
        user: 'iot_prod_app',
        password: 'some_password',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('yanlış veritabanına geçiş engellendi');
    expect(res.body.details).toContain('devices');
    expect(res.body.details).toContain('telemetry_readings');
    expect(updateSecretsSpy).not.toHaveBeenCalled();
  });

  it('7. MUST prevent switching when role privileges are insufficient', async () => {
    mockUserSession('admin');

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'PostgreSQL bağlantısı başarılı.',
      tablesStatus: {
        users: true,
        devices: true,
        telemetry_readings: true,
      },
      permissionsStatus: {
        schema_usage: true,
        users_select: true,
        users_insert: false, // missing insert permission!
        devices_update: false, // missing update permission!
      },
    } as any);

    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets');

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'read_only_role',
        password: 'some_password',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('gerekli veritabanı yetkileri doğrulanamadı');
    expect(updateSecretsSpy).not.toHaveBeenCalled();
  });

  it('8. MUST successfully switch when all gates pass', async () => {
    mockUserSession('admin');

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'PostgreSQL bağlantısı başarılı.',
      tablesStatus: {
        users: true,
        devices: true,
        telemetry_readings: true,
      },
      permissionsStatus: {
        schema_usage: true,
        users_select: true,
        users_insert: true,
        users_update: true,
        devices_select: true,
        devices_insert: true,
        devices_update: true,
        telemetry_select: true,
        telemetry_insert: true,
        sequences_usage: true,
      },
    } as any);

    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets').mockResolvedValue();
    const saveRuntimeSpy = vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockImplementation(() => {});
    const saveUrlSpy = vi.spyOn(db, 'savePostgresUrl').mockImplementation(() => {});
    const recyclePoolSpy = vi.spyOn(db, 'recyclePgPool').mockImplementation(() => {});
    const initRepoSpy = vi.spyOn(db, 'initPostgresRepository').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_production',
        user: 'iot_prod_app',
        password: 'strong_prod_password_123',
        sslMode: 'prefer',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('başarıyla tamamlandı');
    expect(updateSecretsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'iot_prod_app', database: 'iot_production' }),
      expect.any(String)
    );
    expect(saveRuntimeSpy).toHaveBeenCalled();
    expect(saveUrlSpy).toHaveBeenCalled();
    expect(recyclePoolSpy).toHaveBeenCalled();
    expect(initRepoSpy).toHaveBeenCalledWith(true);
  });

  it('9. MUST automatically rollback if application repository initialization fails', async () => {
    mockUserSession('admin');

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'PostgreSQL bağlantısı başarılı.',
      tablesStatus: {
        users: true,
        devices: true,
        telemetry_readings: true,
      },
      permissionsStatus: {
        schema_usage: true,
        users_select: true,
        users_insert: true,
        users_update: true,
        devices_select: true,
        devices_insert: true,
        devices_update: true,
        telemetry_select: true,
        telemetry_insert: true,
        sequences_usage: true,
      },
    } as any);

    const initialDb = {
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: 'initial_password',
      sslMode: 'disable',
      isConfigured: true,
    };
    vi.spyOn(systemSecretsService, 'getDatabaseConfig').mockReturnValue(initialDb);

    const updateSecretsSpy = vi.spyOn(systemSecretsService, 'updateDatabaseSecrets').mockResolvedValue();
    vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockImplementation(() => {});
    vi.spyOn(db, 'savePostgresUrl').mockImplementation(() => {});
    vi.spyOn(db, 'recyclePgPool').mockImplementation(() => {});
    
    // Simulate initPostgresRepository failing on new DB, then succeeding on rollback
    let callCount = 0;
    vi.spyOn(db, 'initPostgresRepository').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return false; // Candidate fails
      }
      return true; // Rollback succeeds
    });

    const res = await request(app)
      .post('/api/database/switch-target')
      .set('Authorization', 'Bearer valid_token')
      .send({
        host: 'timescaledb',
        port: 5432,
        database: 'iot_failing_db',
        user: 'iot_prod_app',
        password: 'strong_prod_password_123',
        confirmDatabaseSwitch: true,
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Önceki veritabanı ve bağlantı ayarları güvenle geri yüklendi');
    // Ensure rollback restored initial credentials:
    expect(updateSecretsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user: initialDb.user, database: initialDb.database }),
      expect.any(String)
    );
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

  it('3. MUST reject missing current or new password with 400', async () => {
    mockUserSession('admin');

    const res1 = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: '',
        newPassword: 'new_strong_pass_123',
      });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain('Mevcut veritabanı parolası');

    const res2 = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: 'current_pass_123',
        newPassword: '',
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('Yeni veritabanı parolası');
  });

  it('4. MUST reject new password shorter than 8 characters', async () => {
    mockUserSession('admin');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: 'current_pass_123',
        newPassword: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('en az 8 karakter');
  });

  it('5. MUST reject mismatching confirmPassword', async () => {
    mockUserSession('admin');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: 'current_pass_123',
        newPassword: 'new_strong_pass_123',
        confirmPassword: 'different_pass_123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('eşleşmiyor');
  });

  it('6. MUST reject newPassword equal to currentPassword', async () => {
    mockUserSession('admin');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: 'same_password_123',
        newPassword: 'same_password_123',
        confirmPassword: 'same_password_123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('aynı olamaz');
  });

  it('7. MUST reject preflight verification failure with 422', async () => {
    mockUserSession('admin');

    vi.spyOn(systemSecretsService, 'getDatabaseConfig').mockReturnValue({
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: 'real_current_password',
      sslMode: 'disable',
      isConfigured: true,
    });

    vi.spyOn(setupService, 'testConnection').mockResolvedValueOnce({
      success: false,
      message: 'password authentication failed for user "iot_user"',
      errorCode: 'AUTH_FAILED',
      timescaleAvailable: false,
    } as any);

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_token')
      .send({
        currentPassword: 'wrong_current_password',
        newPassword: 'new_strong_password_123',
        confirmPassword: 'new_strong_password_123',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Mevcut veritabanı parolası doğrulanamadı');
  });
});
