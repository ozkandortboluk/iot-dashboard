import { describe, expect, it } from 'vitest';
import { isWebSocketUpgradePath } from '../server/utils/wsUpgradePath.js';

describe('WebSocket HTTP upgrade endpoint allowlist', () => {
  it('allows /ws', () => expect(isWebSocketUpgradePath('/ws')).toBe(true));
  it('allows /api/ws', () => expect(isWebSocketUpgradePath('/api/ws')).toBe(true));
  it('rejects /ws-evil prefix collisions', () => expect(isWebSocketUpgradePath('/ws-evil')).toBe(false));
  it('rejects /api/ws-admin prefix collisions', () => expect(isWebSocketUpgradePath('/api/ws-admin')).toBe(false));
  it('rejects nested /ws routes', () => expect(isWebSocketUpgradePath('/ws/anything')).toBe(false));
  it('rejects nested /api/ws routes', () => expect(isWebSocketUpgradePath('/api/ws/anything')).toBe(false));
  it('rejects arbitrary HTTP paths', () => expect(isWebSocketUpgradePath('/api/admin')).toBe(false));
});
