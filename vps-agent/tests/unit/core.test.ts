import { describe, expect, it } from 'vitest';
import { parseMonitorConfig } from '../../core/config.js';
import { authorizeAction } from '../../core/policy.js';
import { canStartApprovedRelease } from '../../approvals/policy.js';
import { redactText } from '../../core/redaction.js';

describe('VPS Agent configuration and policy', () => {
  it('defaults to observe_only and disables privileged integrations', () => {
    const config = parseMonitorConfig({});
    expect(config.mode).toBe('observe_only');
    expect(config.docker.enabled).toBe(false);
    expect(config.telegram.enabled).toBe(false);
  });

  it('rejects non-loopback health URLs and unapproved paths', () => {
    expect(() => parseMonitorConfig({ health: { liveUrl: 'https://example.com/api/health/live' } })).toThrow();
    expect(() => parseMonitorConfig({ health: { readyUrl: 'http://127.0.0.1/admin' } })).toThrow();
  });

  it('rejects inverted resource thresholds', () => {
    expect(() => parseMonitorConfig({ system: { loadWarningPerCpu: 2, loadCriticalPerCpu: 1 } })).toThrow();
    expect(() => parseMonitorConfig({ system: { inodeWarningPercent: 90, inodeCriticalPercent: 80 } })).toThrow();
  });

  it('denies mutations, release and unverified model analysis', () => {
    expect(authorizeAction('observe_only', 'read_health').allowed).toBe(true);
    expect(authorizeAction('observe_only', 'service_restart').allowed).toBe(false);
    expect(authorizeAction('approved_release', 'deploy').allowed).toBe(false);
    expect(authorizeAction('observe_only', 'send_telegram').allowed).toBe(false);
    expect(authorizeAction('observe_only', 'send_telegram', { realTelegramApproved: true }).allowed).toBe(true);
    expect(authorizeAction('propose_changes', 'analyze_with_codex').allowed).toBe(false);
    expect(canStartApprovedRelease({ explicitHumanApproval: true })).toBe(false);
  });

  it('redacts token-like strings without exposing an original error', () => {
    expect(redactText('token=secret-value bot123456:abcdefghijklmnopqrstuvwxyz')).not.toContain('secret-value');
    expect(redactText('Bearer abc.def')).not.toContain('abc.def');
  });
});
