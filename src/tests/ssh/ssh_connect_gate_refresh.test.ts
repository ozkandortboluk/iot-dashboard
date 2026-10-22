import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SSH connect success must trigger independent login gate verification', () => {
  const drawer = readFileSync(new URL('../../components/SSHTunnelDrawer.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

  it('does not require a non-existent canProceedToLogin field in the connect response', () => {
    const section = drawer.split('const handleConnect = async () => {')[1]?.split('const handleDisconnect = async () => {')[0];
    expect(section).toBeTruthy();
    expect(section).not.toMatch(/if\s*\([^)]*data\.canProceedToLogin/);
    expect(section).toMatch(/if\s*\(data\.success\)/);
    expect(section).toMatch(/if\s*\(onConnectedSuccess\)\s*\{\s*onConnectedSuccess\(\)/);
  });

  it('keeps the parent responsible for SSH plus PostgreSQL and READY verification', () => {
    expect(app).toContain('const isSsh = Boolean(');
    expect(app).toContain('const isSel1 = Boolean(');
    expect(app).toContain('const isReady = Boolean(');
    expect(app).toContain('setSshGatePassed(passed)');
    expect(app).toContain('verifySshGate();');
  });
});
