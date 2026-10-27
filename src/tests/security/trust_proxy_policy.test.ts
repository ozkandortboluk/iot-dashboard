import { describe, expect, it } from 'vitest';
import { PRIVATE_PROXY_CIDRS, resolveTrustProxy } from '../../server/config/trustProxyPolicy.js';

describe('HTTP reverse proxy trust policy', () => {
  it('defaults to trusted private proxy networks in production', () => {
    expect(resolveTrustProxy(undefined, true)).toBe(PRIVATE_PROXY_CIDRS);
  });
  it('does not allow TRUST_PROXY=true to trust arbitrary public clients in VPS', () => {
    expect(resolveTrustProxy('true', true)).toBe(PRIVATE_PROXY_CIDRS);
  });
  it('preserves explicit proxy disablement', () => {
    expect(resolveTrustProxy('false', true)).toBe(false);
  });
  it('supports a bounded proxy hop count', () => {
    expect(resolveTrustProxy('1', true)).toBe(1);
  });
  it('preserves a configured trusted CIDR list', () => {
    expect(resolveTrustProxy('loopback, 172.20.0.0/16', true)).toBe('loopback, 172.20.0.0/16');
  });
  it('allows unrestricted proxy trust only outside VPS production', () => {
    expect(resolveTrustProxy('true', false)).toBe(true);
  });
});
