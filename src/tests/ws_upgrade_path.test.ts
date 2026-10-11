import { describe, expect, it } from 'vitest';
import { isWebSocketUpgradePath, parseWebSocketUpgradeUrl } from '../server/utils/wsUpgradePath.js';

describe('WebSocket HTTP upgrade endpoint allowlist', () => {
  it('allows /ws', () => expect(isWebSocketUpgradePath('/ws')).toBe(true));
  it('allows /api/ws', () => expect(isWebSocketUpgradePath('/api/ws')).toBe(true));
  it('rejects /ws-evil prefix collisions', () => expect(isWebSocketUpgradePath('/ws-evil')).toBe(false));
  it('rejects /api/ws-admin prefix collisions', () => expect(isWebSocketUpgradePath('/api/ws-admin')).toBe(false));
  it('rejects nested /ws routes', () => expect(isWebSocketUpgradePath('/ws/anything')).toBe(false));
  it('rejects nested /api/ws routes', () => expect(isWebSocketUpgradePath('/api/ws/anything')).toBe(false));
  it('rejects arbitrary HTTP paths', () => expect(isWebSocketUpgradePath('/api/admin')).toBe(false));
});

describe('WebSocket HTTP upgrade request target validation', () => {
  it('accepts documented paths with query tokens', () => expect(parseWebSocketUpgradeUrl('/ws?token=abc')?.pathname).toBe('/ws'));
  it('accepts /api/ws', () => expect(parseWebSocketUpgradeUrl('/api/ws')?.pathname).toBe('/api/ws'));
  it('rejects absolute URLs', () => expect(parseWebSocketUpgradeUrl('http://evil.example/ws')).toBeNull());
  it('rejects protocol-relative URLs', () => expect(parseWebSocketUpgradeUrl('//evil.example/ws')).toBeNull());
  it('rejects backslash authority confusion', () => expect(parseWebSocketUpgradeUrl('/\\evil.example/ws')).toBeNull());
  it('rejects unsupported paths', () => expect(parseWebSocketUpgradeUrl('/api/admin')).toBeNull());
  it('rejects missing request targets', () => expect(parseWebSocketUpgradeUrl(undefined)).toBeNull());
});

// Regression guard: VPS_PRODUCTION must enforce authoritative PostgreSQL device lookup.
describe('Production device authentication policy', () => {
  it('requires PostgreSQL readiness for both production flags', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../server/services/websocket.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/\(process\.env\.NODE_ENV === 'production' \|\| process\.env\.VPS_PRODUCTION === 'true'\) && !db\.postgresRepo\?\.isReady\(\)/);
  });
  it('does not use in-memory device fallback with VPS_PRODUCTION enabled', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../server/services/websocket.ts', import.meta.url), 'utf8');
    expect(source).toContain("process.env.VPS_PRODUCTION !== 'true'");
  });
});
