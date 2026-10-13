import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { sshTunnelRouter } from '../server/routes/sshTunnel.js';
import { aiStudioBootstrapAuthService } from '../server/services/aiStudioBootstrapAuth.service.js';
import { sshTunnelService } from '../server/services/sshTunnel.service.js';
import { setupService } from '../server/services/setup.service.js';
import { db } from '../server/db.js';
import { DatabaseState } from '../types.js';

describe('AI Studio Pre-Login SSH Connection Flow & Gate Verification', () => {
  const originalEnv = { ...process.env };
  let app: express.Express;

  beforeEach(() => {
    process.env = { ...originalEnv };
    aiStudioBootstrapAuthService.clearAllTokens();

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/system/ssh-tunnel', sshTunnelRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
    aiStudioBootstrapAuthService.clearAllTokens();
    vi.restoreAllMocks();
  });

  describe('1. VPS Production Isolation (HTTP 403 Forbidden)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.VPS_PRODUCTION = 'true';
      process.env.APP_ENV = 'vps';
      delete process.env.ENABLE_SSH_TUNNEL;
      delete process.env.DB_SSH_TUNNEL_ENABLED;
    });

    it('denies bootstrap token creation on VPS host with HTTP 403', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toMatch(/SSH_TUNNEL_DISALLOWED|SSH_BOOTSTRAP_DISALLOWED/);
    });

    it('does not mint credentials over removed GET /bootstrap-token', async () => {
      const res = await request(app).get('/api/system/ssh-tunnel/bootstrap-token');
      expect(res.status).toBe(404);
    });

    it('denies GET /status on VPS host with HTTP 403', async () => {
      const res = await request(app).get('/api/system/ssh-tunnel/status');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SSH_TUNNEL_DISALLOWED');
    });

    it('denies POST /connect on VPS host with HTTP 403', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/connect').send({
        sshHost: '127.0.0.1',
        sshUser: 'deploy',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SSH_TUNNEL_DISALLOWED');
    });

    it('denies POST /test on VPS host with HTTP 403', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/test').send({
        sshHost: '127.0.0.1',
        sshUser: 'deploy',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SSH_TUNNEL_DISALLOWED');
    });

    it('denies POST /probe-fingerprint on VPS host with HTTP 403', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/probe-fingerprint').send({
        sshHost: '127.0.0.1',
        sshPort: 22,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SSH_TUNNEL_DISALLOWED');
    });

    it('strictly rejects forged bootstrap tokens on VPS host (Fail-Closed)', async () => {
      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', 'nxs_aistudio_boot_forged_token_12345');
      expect(res.status).toBe(403);
    });
  });

  describe('2. AI Studio Unauthorized Access Scenarios', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.APP_ENV = 'aistudio';
      delete process.env.VPS_PRODUCTION;
    });

    it('rejects unauthenticated access without tokens with HTTP 401', async () => {
      const res = await request(app).get('/api/system/ssh-tunnel/status');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Erişim Engellendi (401)');
    });

    it('rejects invalid or forged bootstrap tokens with HTTP 401', async () => {
      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', 'nxs_aistudio_boot_invalid_random_string');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Erişim Engellendi (401)');
    });

    it('rejects expired bootstrap tokens with HTTP 401', async () => {
      // Create a token with negative TTL
      const expiredToken = aiStudioBootstrapAuthService.createBootstrapToken(-1000);
      expect(expiredToken).toBeTruthy();

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', expiredToken!);
      expect(res.status).toBe(401);
    });
  });

  describe('3. AI Studio Bootstrap Token Issuance & Scoped Pre-Login Access', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.APP_ENV = 'aistudio';
      delete process.env.VPS_PRODUCTION;
      vi.spyOn(setupService, 'isSetupCompleted').mockReturnValue(false);
      vi.spyOn(setupService, 'validateSetupToken').mockImplementation(token => token === 'test-ci-setup-token');
    });

    it('rejects anonymous bootstrap token issuance', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SSH_BOOTSTRAP_AUTH_REQUIRED');
    });

    it('successfully issues bootstrap token in AI Studio environment', async () => {
      const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token').set('X-Setup-Token', 'test-ci-setup-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.bootstrapToken).toMatch(/^nxs_aistudio_boot_[a-f0-9]{64}$/);
      expect(res.body.environment).toBe('aistudio');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('grants access to SSH /status using valid X-SSH-Bootstrap-Token header', async () => {
      const bootRes = await request(app).post('/api/system/ssh-tunnel/bootstrap-token').set('X-Setup-Token', 'test-ci-setup-token');
      const token = bootRes.body.bootstrapToken;

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('sshConnected');
      expect(res.body).toHaveProperty('postgresSelect1Verified');
      expect(res.body).toHaveProperty('databaseReady');
      expect(res.body).toHaveProperty('canProceedToLogin');
    });

    it('grants access using cookie authentication', async () => {
      const bootRes = await request(app).post('/api/system/ssh-tunnel/bootstrap-token').set('X-Setup-Token', 'test-ci-setup-token');
      const cookieHeader = bootRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. 3-Point Check & Pre-Login Gate Verification', () => {
    let bootstrapToken: string;

    beforeEach(async () => {
      process.env.NODE_ENV = 'development';
      process.env.APP_ENV = 'aistudio';
      delete process.env.VPS_PRODUCTION;
      vi.spyOn(setupService, 'isSetupCompleted').mockReturnValue(false);
      vi.spyOn(setupService, 'validateSetupToken').mockImplementation(token => token === 'test-ci-setup-token');

      const bootRes = await request(app).post('/api/system/ssh-tunnel/bootstrap-token').set('X-Setup-Token', 'test-ci-setup-token');
      bootstrapToken = bootRes.body.bootstrapToken;
    });

    it('Check A: canProceedToLogin is FALSE when SSH tunnel is disconnected', async () => {
      vi.spyOn(sshTunnelService, 'getState').mockReturnValue({
        status: 'disconnected',
        connectedAt: null,
        logs: [],
        lastError: null,
        config: null,
        hostFingerprint: null,
      });
      vi.spyOn(db, 'verifyPostgresSelect1').mockResolvedValue(false);
      vi.spyOn(db, 'getDatabaseState').mockReturnValue(DatabaseState.DB_UNAVAILABLE);

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', bootstrapToken);

      expect(res.status).toBe(200);
      expect(res.body.sshConnected).toBe(false);
      expect(res.body.postgresSelect1Verified).toBe(false);
      expect(res.body.databaseReady).toBe(false);
      expect(res.body.canProceedToLogin).toBe(false);
    });

    it('Check B: canProceedToLogin is FALSE when SSH is connected but SELECT 1 fails', async () => {
      vi.spyOn(sshTunnelService, 'getState').mockReturnValue({
        status: 'connected',
        connectedAt: new Date().toISOString(),
        logs: ['Tunnel established'],
        lastError: null,
        config: null,
        hostFingerprint: 'SHA256:test',
      });
      vi.spyOn(db, 'verifyPostgresSelect1').mockResolvedValue(false);
      vi.spyOn(db, 'getDatabaseState').mockReturnValue(DatabaseState.DB_UNAVAILABLE);

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', bootstrapToken);

      expect(res.status).toBe(200);
      expect(res.body.sshConnected).toBe(true);
      expect(res.body.postgresSelect1Verified).toBe(false);
      expect(res.body.databaseReady).toBe(false);
      expect(res.body.canProceedToLogin).toBe(false);
    });

    it('Check C: canProceedToLogin is FALSE when SSH connected, SELECT 1 verified, but database is NOT READY', async () => {
      vi.spyOn(sshTunnelService, 'getState').mockReturnValue({
        status: 'connected',
        connectedAt: new Date().toISOString(),
        logs: ['Tunnel established'],
        lastError: null,
        config: null,
        hostFingerprint: 'SHA256:test',
      });
      vi.spyOn(db, 'verifyPostgresSelect1').mockResolvedValue(true);
      vi.spyOn(db, 'getDatabaseState').mockReturnValue(DatabaseState.DB_INITIALIZING);

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', bootstrapToken);

      expect(res.status).toBe(200);
      expect(res.body.sshConnected).toBe(true);
      expect(res.body.postgresSelect1Verified).toBe(true);
      expect(res.body.databaseReady).toBe(false);
      expect(res.body.canProceedToLogin).toBe(false);
    });

    it('Check D: canProceedToLogin is TRUE ONLY when all 3 checks (SSH + SELECT 1 + READY) pass', async () => {
      vi.spyOn(sshTunnelService, 'getState').mockReturnValue({
        status: 'connected',
        connectedAt: new Date().toISOString(),
        logs: ['Tunnel established'],
        lastError: null,
        config: null,
        hostFingerprint: 'SHA256:test',
      });
      vi.spyOn(db, 'verifyPostgresSelect1').mockResolvedValue(true);
      vi.spyOn(db, 'getDatabaseState').mockReturnValue(DatabaseState.READY);

      const res = await request(app)
        .get('/api/system/ssh-tunnel/status')
        .set('X-SSH-Bootstrap-Token', bootstrapToken);

      expect(res.status).toBe(200);
      expect(res.body.sshConnected).toBe(true);
      expect(res.body.postgresSelect1Verified).toBe(true);
      expect(res.body.databaseReady).toBe(true);
      expect(res.body.canProceedToLogin).toBe(true);
    });
  });

  describe('5. Connection Drop & Session Preservation', () => {
    it('does NOT delete existing user session when SSH tunnel disconnects', async () => {
      // Simulate existing session in db
      const mockUser: any = {
        id: 'usr_existing_123',
        name: 'Test Operator',
        email: 'operator@example.com',
        role: 'operator',
      };
      const sessionToken = await db.createSession(mockUser);
      expect(sessionToken).toBeTruthy();

      // Verify session exists
      const beforeDisconnect = await db.verifySessionAsync(sessionToken);
      expect(beforeDisconnect).toBeTruthy();
      expect(beforeDisconnect?.user.email).toBe('operator@example.com');

      // Now simulate SSH tunnel disconnecting and database going to DB_UNAVAILABLE
      vi.spyOn(sshTunnelService, 'isConnected').mockReturnValue(false);
      db.setDatabaseState(DatabaseState.DB_UNAVAILABLE);

      // Verify that verifySession / in-memory session is NOT deleted or purged by connection drop
      const sessionAfterDrop = db.verifySession(sessionToken);
      expect(sessionAfterDrop).toBeTruthy();
      expect(sessionAfterDrop?.user.id).toBe('usr_existing_123');
    });
  });
});
