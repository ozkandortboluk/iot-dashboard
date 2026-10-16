import { describe, it, expect, beforeEach } from 'vitest';
import { systemLogger } from '../server/services/systemLogger.service.js';

describe('System Logger Config & Field Selection Suite', () => {
  beforeEach(() => {
    // Reset to defaults
    systemLogger.updateConfig({
      enabled: true,
      logToFile: true,
      minLevel: 'info',
      maxInMemory: 1000,
      deduplication: true,
      autoSanitizeSecrets: true,
      includedFields: {
        stack: true,
        ip: true,
        user: true,
        http: true,
        device: true,
        details: true,
        source: true,
        traceId: true,
      },
    });
  });

  it('1. Retrieves current config with all 8 configurable log fields', () => {
    const config = systemLogger.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.includedFields).toBeDefined();
    expect(config.includedFields.stack).toBe(true);
    expect(config.includedFields.ip).toBe(true);
    expect(config.includedFields.user).toBe(true);
    expect(config.includedFields.http).toBe(true);
    expect(config.includedFields.device).toBe(true);
    expect(config.includedFields.details).toBe(true);
    expect(config.includedFields.source).toBe(true);
    expect(config.includedFields.traceId).toBe(true);
    expect(config.autoSanitizeSecrets).toBe(true);
  });

  it('2. Updates and persists custom field selection (e.g. disabling stack and ip for compact logs)', () => {
    const updated = systemLogger.updateConfig({
      includedFields: {
        stack: false,
        ip: false,
      },
      autoSanitizeSecrets: false,
    });

    expect(updated.includedFields.stack).toBe(false);
    expect(updated.includedFields.ip).toBe(false);
    expect(updated.includedFields.http).toBe(true);
    expect(updated.autoSanitizeSecrets).toBe(false);

    // Verify it persists across subsequent calls
    const readBack = systemLogger.getConfig();
    expect(readBack.includedFields.stack).toBe(false);
    expect(readBack.includedFields.ip).toBe(false);
    expect(readBack.includedFields.http).toBe(true);
    expect(readBack.autoSanitizeSecrets).toBe(false);
  });

  it('3. Sanitizes sensitive secrets when autoSanitizeSecrets is active', () => {
    systemLogger.updateConfig({ autoSanitizeSecrets: true });
    systemLogger.clearEvents();

    systemLogger.error(
      'auth',
      'Giriş denemesi başarısız: password=SuperSecretPassword123 token=abc1234567890',
      undefined,
      'auth_service'
    );

    const events = systemLogger.getEvents({ limit: 10 });
    expect(events.events.length).toBeGreaterThan(0);
    const logged = events.events[0];
    expect(logged.message).not.toContain('SuperSecretPassword123');
  });
});
