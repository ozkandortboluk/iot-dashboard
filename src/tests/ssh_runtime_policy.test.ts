import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevelopmentSshTunnelAllowed, resolveRuntimeEnvironment } from '../server/config/runtimeEnvironment.js';
import { aiStudioBootstrapAuthService } from '../server/services/aiStudioBootstrapAuth.service.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('SSH tunnel runtime isolation', () => {
  it('never enables SSH on VPS even with conflicting AI Studio flags', () => {
    process.env.VPS_PRODUCTION = 'true';
    process.env.APP_ENV = 'aistudio';
    process.env.AIS_PREVIEW = 'true';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    expect(resolveRuntimeEnvironment()).toBe('vps');
    expect(isDevelopmentSshTunnelAllowed()).toBe(false);
  });

  it('disables SSH for explicit VPS environment', () => {
    delete process.env.VPS_PRODUCTION;
    process.env.APP_ENV = 'vps';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    expect(resolveRuntimeEnvironment()).toBe('vps');
    expect(isDevelopmentSshTunnelAllowed()).toBe(false);
  });

  it('allows explicit AI Studio development unless disabled by policy', () => {
    delete process.env.VPS_PRODUCTION;
    process.env.APP_ENV = 'aistudio';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    delete process.env.DB_SSH_TUNNEL_ENABLED;
    expect(resolveRuntimeEnvironment()).toBe('aistudio');
    expect(isDevelopmentSshTunnelAllowed()).toBe(true);
    process.env.DB_SSH_TUNNEL_ENABLED = 'false';
    expect(isDevelopmentSshTunnelAllowed()).toBe(false);
  });

  it('keeps SSH disabled on generic production hosts', () => {
    delete process.env.VPS_PRODUCTION;
    delete process.env.K_SERVICE;
    delete process.env.K_REVISION;
    delete process.env.AIS_PREVIEW;
    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    expect(isDevelopmentSshTunnelAllowed()).toBe(false);
  });
});


describe('SSH bootstrap runtime boundaries', () => {
  it('does not mint bootstrap tokens on VPS', () => {
    process.env.VPS_PRODUCTION = 'true';
    process.env.APP_ENV = 'aistudio';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    expect(aiStudioBootstrapAuthService.createBootstrapToken()).toBeNull();
  });

  it('rejects a token once the runtime becomes VPS', () => {
    delete process.env.VPS_PRODUCTION;
    process.env.APP_ENV = 'aistudio';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    delete process.env.DB_SSH_TUNNEL_ENABLED;
    const token = aiStudioBootstrapAuthService.createBootstrapToken();
    expect(token).toBeTruthy();
    expect(aiStudioBootstrapAuthService.validateBootstrapToken(token)).toBe(true);
    process.env.VPS_PRODUCTION = 'true';
    expect(aiStudioBootstrapAuthService.validateBootstrapToken(token)).toBe(false);
    aiStudioBootstrapAuthService.clearAllTokens();
  });
});
