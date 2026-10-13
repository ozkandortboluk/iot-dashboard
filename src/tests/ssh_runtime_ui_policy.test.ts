import { describe, expect, it } from 'vitest';
import { canShowSshControls, isConfirmedAiStudioRuntime } from '../lib/sshRuntimePolicy.js';

describe('SSH controls must be limited to confirmed AI Studio runtime', () => {
  const preview = { environment: 'aistudio', isAiStudio: true, isVps: false, sshTunnelAllowed: true };

  it('allows SSH controls only when AI Studio flags agree', () => {
    expect(isConfirmedAiStudioRuntime(preview)).toBe(true);
    expect(canShowSshControls(preview)).toBe(true);
  });

  it('rejects VPS even with contradicting AI Studio flags', () => {
    expect(canShowSshControls({ ...preview, isVps: true })).toBe(false);
    expect(canShowSshControls({ ...preview, environment: 'vps' })).toBe(false);
  });

  it('rejects incomplete or unknown runtime responses', () => {
    expect(canShowSshControls(null)).toBe(false);
    expect(canShowSshControls(undefined)).toBe(false);
    expect(canShowSshControls({ environment: 'aistudio', sshTunnelAllowed: true })).toBe(false);
  });

  it('respects explicit server SSH policy even in AI Studio', () => {
    expect(canShowSshControls({ ...preview, sshTunnelAllowed: false })).toBe(false);
  });
});
