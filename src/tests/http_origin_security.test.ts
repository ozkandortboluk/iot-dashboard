import { describe, expect, it } from 'vitest';
import { isOriginAllowed, isAllowedWsOrigin } from '../server/utils/corsOrigins.js';

describe('HTTP and WebSocket origin hardening', () => {
  it('allows the known HTTPS production origin', () => {
    expect(isOriginAllowed('https://nexusnodeiot.com.tr')).toBe(true);
  });
  it('rejects embedded credentials even on an approved hostname', () => {
    expect(isOriginAllowed('https://user:pass@nexusnodeiot.com.tr')).toBe(false);
  });
  it('rejects malformed URL origin strings', () => {
    expect(isOriginAllowed('not-a-valid-origin')).toBe(false);
  });
  it('rejects non-HTTP protocols', () => {
    expect(isOriginAllowed('javascript:alert(1)')).toBe(false);
  });
  it('rejects paths appended to a valid origin', () => {
    expect(isOriginAllowed('https://nexusnodeiot.com.tr/other')).toBe(false);
  });
  it('rejects query strings on an otherwise approved origin', () => {
    expect(isOriginAllowed('https://nexusnodeiot.com.tr/?x=1')).toBe(false);
  });
  it('rejects fragments on an otherwise approved origin', () => {
    expect(isOriginAllowed('https://nexusnodeiot.com.tr/#fragment')).toBe(false);
  });
  it('rejects WebSocket handshakes with an invalid Origin', () => {
    expect(isAllowedWsOrigin('https://user:pass@nexusnodeiot.com.tr')).toBe(false);
  });
  it('preserves Origin-less IoT client connections', () => {
    expect(isAllowedWsOrigin(undefined)).toBe(true);
  });
});
