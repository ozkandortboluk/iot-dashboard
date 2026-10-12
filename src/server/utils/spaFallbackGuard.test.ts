import { describe, expect, it } from 'vitest';
import { isCandidateSpaRoute, isScannerOrProbingPath, normalizePathname } from './spaFallbackGuard';

describe('SEC-08 SPA request path normalization', () => {
  it.each([
    ['//xmlrpc.php?rsd', '/xmlrpc.php'],
    ['///wp-login.php', '/wp-login.php'],
    ['//cgi-bin/test.cgi', '/cgi-bin/test.cgi'],
    ['/%78mlrpc.php?rsd', '/xmlrpc.php'],
    ['/%252eenv', '/.env'],
    ['/%2f%2fxmlrpc.php?rsd', '/xmlrpc.php'],
    ['//cgi-bin\\test.cgi', '/cgi-bin/test.cgi'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePathname(input)).toBe(expected);
    expect(isScannerOrProbingPath(input)).toBe(true);
  });

  it.each(['/xmlrpc.php', '//xmlrpc.php?rsd', '///wp-login.php', '//cgi-bin/test.cgi', '/%252eenv'])(
    'does not allow probe %s to fall back to index.html',
    (url) => {
      expect(isCandidateSpaRoute({ method: 'GET', path: url } as any)).toBe(false);
    },
  );

  it.each(['/', '/dashboard', '/login'])('allows valid SPA route %s', (url) => {
    expect(isCandidateSpaRoute({ method: 'GET', path: url } as any)).toBe(true);
  });

  it('does not treat API endpoints as SPA routes', () => {
    expect(isCandidateSpaRoute({ method: 'GET', path: '//api/health/ready' } as any)).toBe(false);
  });

  it('rejects malformed percent encoding', () => {
    expect(isCandidateSpaRoute({ method: 'GET', path: '/%ZZ' } as any)).toBe(false);
  });
});
