import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAllowed: vi.fn(() => true),
  bootstrapAllowed: vi.fn(() => true),
  setupCompleted: vi.fn(() => false),
  setupValid: vi.fn((token: string) => token === 'valid-setup'),
  recoveryValid: vi.fn((token: string) => token === 'valid-recovery'),
  createToken: vi.fn(() => 'test-ephemeral-token'),
}));

vi.mock('../server/database/connection.js', () => ({
  isSshTunnelAllowed: mocks.isAllowed,
}));
vi.mock('../server/services/aiStudioBootstrapAuth.service.js', () => ({
  aiStudioBootstrapAuthService: {
    isBootstrapAllowed: mocks.bootstrapAllowed,
    createBootstrapToken: mocks.createToken,
    extractBootstrapToken: vi.fn(() => null),
    validateBootstrapToken: vi.fn(() => false),
  },
}));
vi.mock('../server/services/setup.service.js', () => ({
  setupService: {
    isSetupCompleted: mocks.setupCompleted,
    validateSetupToken: mocks.setupValid,
    validateRecoveryToken: mocks.recoveryValid,
  },
}));
vi.mock('../server/middleware/setupAuth.js', () => ({
  isRequestSetupAuthenticated: vi.fn(() => false),
  extractSetupToken: (req: { headers: Record<string, unknown> }) =>
    typeof req.headers['x-setup-token'] === 'string' ? req.headers['x-setup-token'] : null,
}));
vi.mock('../server/services/rateLimiter.service.js', () => ({
  rateLimiterService: { checkIpRateLimit: vi.fn(() => ({ allowed: true })) },
}));
vi.mock('../server/services/sshTunnel.service.js', () => ({
  DEFAULT_SSH_LOCAL_PORT: 15432,
  sshTunnelService: {},
}));
vi.mock('../server/services/systemLogger.service.js', () => ({
  systemLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../server/middleware/auth.js', () => ({
  authenticateUser: vi.fn((_req, res) => res.status(401).json({ success: false })),
  requireAdmin: vi.fn((_req, res) => res.status(403).json({ success: false })),
}));
vi.mock('../server/db.js', () => ({ db: {} }));

import { sshTunnelRouter } from '../server/routes/sshTunnel.js';

const app = express();
app.use(express.json());
app.use('/api/system/ssh-tunnel', sshTunnelRouter);

beforeEach(() => {
  mocks.isAllowed.mockReturnValue(true);
  mocks.bootstrapAllowed.mockReturnValue(true);
  mocks.setupCompleted.mockReturnValue(false);
  mocks.createToken.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe('SSH bootstrap HTTP authorization', () => {
  it('rejects anonymous issuance without creating a token', async () => {
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SSH_BOOTSTRAP_AUTH_REQUIRED');
    expect(mocks.createToken).not.toHaveBeenCalled();
  });
  it('rejects an invalid setup credential', async () => {
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token')
      .set('X-Setup-Token', 'invalid');
    expect(res.status).toBe(401);
    expect(mocks.createToken).not.toHaveBeenCalled();
  });
  it('allows valid initial setup credential', async () => {
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token')
      .set('X-Setup-Token', 'valid-setup');
    expect(res.status).toBe(200);
    expect(res.body.bootstrapToken).toBe('test-ephemeral-token');
  });
  it('allows valid recovery credential after setup is complete', async () => {
    mocks.setupCompleted.mockReturnValue(true);
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token')
      .set('X-Setup-Token', 'valid-recovery');
    expect(res.status).toBe(200);
  });
  it('rejects old setup token after setup is complete', async () => {
    mocks.setupCompleted.mockReturnValue(true);
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token')
      .set('X-Setup-Token', 'valid-setup');
    expect(res.status).toBe(401);
  });
  it('rejects issuance on disallowed runtimes', async () => {
    mocks.isAllowed.mockReturnValue(false);
    const res = await request(app).post('/api/system/ssh-tunnel/bootstrap-token')
      .set('X-Setup-Token', 'valid-setup');
    expect(res.status).toBe(403);
    expect(mocks.createToken).not.toHaveBeenCalled();
  });
  it('does not issue credentials over GET', async () => {
    const res = await request(app).get('/api/system/ssh-tunnel/bootstrap-token');
    expect(res.status).toBe(404);
    expect(mocks.createToken).not.toHaveBeenCalled();
  });
});
