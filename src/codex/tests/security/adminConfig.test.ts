import { describe, expect, it } from 'vitest';
import { applyAdminControlConfig } from '../../admin/bridge.js';
import { DEFAULT_ADMIN_CONTROL_CONFIG, parseAdminControlConfig } from '../../admin/controlConfig.js';
import { parseMonitorConfig } from '../../core/config.js';

describe('admin managed Codex permissions', () => {
  it('keeps privileged actions outside the panel schema', () => {
    expect(() => parseAdminControlConfig({ ...DEFAULT_ADMIN_CONTROL_CONFIG, mode: 'approved_release' })).toThrow();
    expect(() => parseAdminControlConfig({ ...DEFAULT_ADMIN_CONTROL_CONFIG, permissions: { ...DEFAULT_ADMIN_CONTROL_CONFIG.permissions, shell: true } })).toThrow();
    expect(() => parseAdminControlConfig({ ...DEFAULT_ADMIN_CONTROL_CONFIG, features: { ...DEFAULT_ADMIN_CONTROL_CONFIG.features, codexAnalysis: true }, permissions: { ...DEFAULT_ADMIN_CONTROL_CONFIG.permissions, runCodexAnalysis: true } })).toThrow();
  });

  it('requires explicit permission before an admin can enable a feature', () => {
    expect(DEFAULT_ADMIN_CONTROL_CONFIG.pluginEnabled).toBe(false);
    expect(() => parseAdminControlConfig({ ...DEFAULT_ADMIN_CONTROL_CONFIG, features: { ...DEFAULT_ADMIN_CONTROL_CONFIG.features, backupChecks: true } })).toThrow();
    const enabled = parseAdminControlConfig({ ...DEFAULT_ADMIN_CONTROL_CONFIG, pluginEnabled: true, permissions: { ...DEFAULT_ADMIN_CONTROL_CONFIG.permissions, readBackupMetadata: true }, features: { ...DEFAULT_ADMIN_CONTROL_CONFIG.features, backupChecks: true } });
    const base = parseMonitorConfig({ backup: { enabled: false, allowedRoot: '/safe', artifactPath: '/safe/archive.age', checksumPath: '/safe/archive.age.sha256' } });
    const effective = applyAdminControlConfig(base, enabled);
    expect(effective.mode).toBe('observe_only');
    expect(effective.backup?.enabled).toBe(true);
    expect(effective.telegram.enabled).toBe(false);
  });

  it('keeps every effective check disabled when the plugin master switch is off', () => {
    const base = parseMonitorConfig({ backup: { enabled: true, allowedRoot: '/safe', artifactPath: '/safe/archive.age', checksumPath: '/safe/archive.age.sha256' } });
    const configured = parseAdminControlConfig({
      ...DEFAULT_ADMIN_CONTROL_CONFIG,
      permissions: { ...DEFAULT_ADMIN_CONTROL_CONFIG.permissions, readHealth: true, readHostMetrics: true, readBackupMetadata: true },
      features: { ...DEFAULT_ADMIN_CONTROL_CONFIG.features, healthChecks: true, hostMetrics: true, backupChecks: true },
    });
    const effective = applyAdminControlConfig(base, configured);
    expect(effective.health.enabled).toBe(false);
    expect(effective.system.enabled).toBe(false);
    expect(effective.backup?.enabled).toBe(false);
  });
});
