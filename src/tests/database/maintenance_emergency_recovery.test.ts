import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../server/db.js';
import { setupService } from '../../server/services/setup.service.js';
import { setupRouter } from '../../server/routes/setup.js';

describe('Maintenance Mode Emergency Recovery & Reconfiguration Security', () => {
  let app: express.Express;
  let originalVerifySessionAsync: any;
  let originalVerifySession: any;
  let originalValidateRecoveryToken: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/setup', setupRouter);

    originalVerifySessionAsync = db.verifySessionAsync;
    originalVerifySession = db.verifySession;
    originalValidateRecoveryToken = setupService.validateRecoveryToken.bind(setupService);

    // Reset local fallback
    setupService.setLocalFallbackActive(false);
  });

  afterEach(() => {
    db.verifySessionAsync = originalVerifySessionAsync;
    db.verifySession = originalVerifySession;
    setupService.validateRecoveryToken = originalValidateRecoveryToken;
    setupService.setLocalFallbackActive(false);
    vi.restoreAllMocks();
  });

  describe('POST /api/setup/emergency-database-config', () => {
    it('1. MUST reject unauthenticated requests with 401', async () => {
      vi.spyOn(setupService, 'validateRecoveryToken').mockReturnValue(false);

      const res = await request(app)
        .post('/api/setup/emergency-database-config')
        .send({
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: 'new_valid_password',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMERGENCY_AUTH_REQUIRED');
    });

    it('2. MUST allow authenticated admin session to update configuration', async () => {
      const session = {
        user: { id: 'admin_usr_1', email: 'admin@nexusnode.io', name: 'Admin User', role: 'admin' },
        token: 'valid_test_token',
      };
      db.verifySession = () => session as any;
      db.verifySessionAsync = async () => session as any;

      vi.spyOn(setupService, 'testConnection').mockResolvedValue({
        success: true,
        message: 'PostgreSQL connection verified',
        timescaleAvailable: true,
      } as any);

      vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/setup/emergency-database-config')
        .set('Authorization', 'Bearer valid_test_token')
        .send({
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: 'new_valid_password',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.systemMode).toBe('READY');
    });

    it('3. MUST allow recovery token to authenticate and update configuration', async () => {
      vi.spyOn(setupService, 'validateRecoveryToken').mockImplementation((token: string) => token === 'valid_secret_recovery_token');

      vi.spyOn(setupService, 'testConnection').mockResolvedValue({
        success: true,
        message: 'PostgreSQL connection verified',
        timescaleAvailable: true,
      } as any);

      vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/setup/emergency-database-config')
        .send({
          recoveryToken: 'valid_secret_recovery_token',
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: 'new_valid_password',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.systemMode).toBe('READY');
    });

    it('4. MUST reject if candidate connection fails test with 400', async () => {
      vi.spyOn(setupService, 'validateRecoveryToken').mockReturnValue(true);

      vi.spyOn(setupService, 'testConnection').mockResolvedValue({
        success: false,
        message: 'password authentication failed for user "iot_user"',
        errorCode: '28P01',
        timescaleAvailable: false,
      });

      const res = await request(app)
        .post('/api/setup/emergency-database-config')
        .send({
          recoveryToken: 'valid_secret_recovery_token',
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: 'wrong_password',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('password authentication failed');
    });
  });

  describe('POST /api/setup/enable-local-fallback', () => {
    it('1. MUST reject unauthenticated requests with 401', async () => {
      vi.spyOn(setupService, 'validateRecoveryToken').mockReturnValue(false);
      vi.spyOn(db, 'getUsers').mockReturnValue([{ id: 'usr_admin', role: 'admin' }] as any);

      const res = await request(app)
        .post('/api/setup/enable-local-fallback')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('2. MUST enable local fallback when recovery token is valid', async () => {
      vi.spyOn(setupService, 'validateRecoveryToken').mockReturnValue(true);

      const res = await request(app)
        .post('/api/setup/enable-local-fallback')
        .send({ recoveryToken: 'valid_token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.systemMode).toBe('READY');
      expect(setupService.isLocalFallbackActive()).toBe(true);
    });
  });
});
