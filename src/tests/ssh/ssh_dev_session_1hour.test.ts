import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  sshTunnelService,
  DEV_SESSION_FILE,
  SSH_DEV_SESSION_TTL_MS,
  type SSHTunnelConfig,
} from '../../server/services/sshTunnel.service.js';
import { sshTunnelRouter } from '../../server/routes/sshTunnel.js';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/system/ssh-tunnel', sshTunnelRouter);
  return app;
}

describe('SSH Tunnel 1-Hour Ephemeral Local Dev Session Suite', () => {
  const sampleConfig: SSHTunnelConfig = {
    sshHost: '127.0.0.1',
    sshPort: 2222,
    sshUser: 'developer',
    authType: 'password',
    password: 'dev-secret-password-123',
    remoteDbHost: '127.0.0.1',
    remoteDbPort: 5432,
    localPort: 15432,
    expectedHostFingerprint: 'SHA256:dummyHostFingerprintForTest1234567890=',
  };

  beforeEach(() => {
    sshTunnelService.clearDevSession();
  });

  afterEach(() => {
    sshTunnelService.clearDevSession();
  });

  it('1. createOrRenewDevSession creates a 1-hour (3600s) secure local session token', () => {
    const session = sshTunnelService.createOrRenewDevSession(sampleConfig);

    expect(session).not.toBeNull();
    expect(session?.token).toBeDefined();
    expect(session?.token.length).toBe(64); // 32 bytes hex
    expect(session?.ttlSeconds).toBe(3600);
    expect(session?.sshHost).toBe('127.0.0.1');
    expect(session?.sshUser).toBe('developer');
    expect(session?.expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000);
    expect(session?.expiresAt).toBeLessThanOrEqual(Date.now() + 3601 * 1000);

    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(DEV_SESSION_FILE, 'utf-8'));
    expect(saved.token).toBe(session?.token);
    expect(saved.expiresAt).toBe(session?.expiresAt);
  });

  it('2. getDevSession and hasActiveDevSession return valid session when not expired', () => {
    sshTunnelService.createOrRenewDevSession(sampleConfig);

    expect(sshTunnelService.hasActiveDevSession()).toBe(true);
    const active = sshTunnelService.getDevSession();
    expect(active).not.toBeNull();
    expect(active?.sshUser).toBe('developer');
  });

  it('3. getDevSession auto-expires and unlinks session file when expiresAt is reached (TTL enforcement)', () => {
    // Create an expired session file
    const expiredSession = {
      token: 'expired_test_token_12345',
      createdAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      expiresAt: Date.now() - 1000, // Expired 1 second ago
      ttlSeconds: 3600,
      sshHost: '127.0.0.1',
      sshUser: 'developer',
      localPort: 15432,
    };
    fs.writeFileSync(DEV_SESSION_FILE, JSON.stringify(expiredSession, null, 2), 'utf-8');

    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(true);

    // Call getDevSession
    const session = sshTunnelService.getDevSession();
    expect(session).toBeNull();
    expect(sshTunnelService.hasActiveDevSession()).toBe(false);

    // File should have been automatically cleaned up
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(false);
  });

  it('4. clearDevSession terminates active session and removes session file', () => {
    sshTunnelService.createOrRenewDevSession(sampleConfig);
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(true);

    sshTunnelService.clearDevSession();
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(false);
    expect(sshTunnelService.hasActiveDevSession()).toBe(false);
  });

  it('5. getState includes devSession status, remainingSeconds and token', () => {
    sshTunnelService.createOrRenewDevSession(sampleConfig);
    const state = sshTunnelService.getState();

    expect(state.devSession).toBeDefined();
    expect(state.devSession?.active).toBe(true);
    expect(state.devSession?.remainingSeconds).toBeGreaterThan(3500);
    expect(state.devSession?.remainingSeconds).toBeLessThanOrEqual(3600);
    expect(state.devSession?.token).toBeDefined();
  });

  it('6. DELETE /api/system/ssh-tunnel/dev-session clears the session and cookie', async () => {
    const session = sshTunnelService.createOrRenewDevSession(sampleConfig);
    expect(session).not.toBeNull();

    const app = createTestApp();
    const res = await request(app)
      .delete('/api/system/ssh-tunnel/dev-session')
      .set('x-ssh-dev-session-token', session!.token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sshTunnelService.hasActiveDevSession()).toBe(false);
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(false);
  });

  it('7. requireSshTunnelAuth accepts requests authenticated with valid 1-hour dev session token', async () => {
    const session = sshTunnelService.createOrRenewDevSession(sampleConfig);
    expect(session).not.toBeNull();

    const app = createTestApp();

    // 1. Without credentials -> 401
    const unauthRes = await request(app).get('/api/system/ssh-tunnel/status');
    expect(unauthRes.status).toBe(401);

    // 2. With valid dev session token in header -> 200
    const authRes = await request(app)
      .get('/api/system/ssh-tunnel/status')
      .set('x-ssh-dev-session-token', session!.token);

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
    expect(authRes.body.devSession?.active).toBe(true);
  });

  it('8. disconnectTunnel with preserveDevSession=true keeps dev session intact for hot reload', async () => {
    sshTunnelService.createOrRenewDevSession(sampleConfig);
    expect(sshTunnelService.hasActiveDevSession()).toBe(true);

    // Hot reload simulates process shutdown preserving dev session
    await sshTunnelService.disconnectTunnel({ preserveDevSession: true });
    expect(sshTunnelService.hasActiveDevSession()).toBe(true);
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(true);

    // Explicit user disconnect clears dev session
    await sshTunnelService.disconnectTunnel({ preserveDevSession: false });
    expect(sshTunnelService.hasActiveDevSession()).toBe(false);
    expect(fs.existsSync(DEV_SESSION_FILE)).toBe(false);
  });

  it('9. SSHTunnelDrawer.tsx file integrates 1-Hour Local Dev Session UI badges and auto-reconnect placeholders', () => {
    const drawerPath = path.resolve(process.cwd(), 'src/components/SSHTunnelDrawer.tsx');
    expect(fs.existsSync(drawerPath)).toBe(true);
    const content = fs.readFileSync(drawerPath, 'utf-8');

    expect(content).toContain('1 Saatlik Yerel Oturum Aktif');
    expect(content).toContain('devSession');
    expect(content).toContain('handleTerminateDevSession');
    expect(content).toContain('nexus_ssh_dev_session_token');
    expect(content).toContain('X-SSH-Dev-Session-Token');
    expect(content).toContain('1 Saatlik Yerel Oturumdan Aktarılacak');
  });
});

