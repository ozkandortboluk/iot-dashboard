import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SSH Connection Screen: Enter key & Auto-disconnect on pre-login security failure', () => {
  const drawer = readFileSync(new URL('../../components/SSHTunnelDrawer.tsx', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../../server/services/sshTunnel.service.ts', import.meta.url), 'utf8');

  it('handles Enter key on SSH password input to trigger handleConnect', () => {
    // Verifies password input includes onKeyDown={handleKeyDownSubmit}
    expect(drawer).toMatch(/value=\{password\}[\s\S]*?onKeyDown=\{handleKeyDownSubmit\}/);
    // Verifies handleKeyDownSubmit checks for Enter key and triggers handleConnect
    expect(drawer).toContain("if (e.key === 'Enter')");
    expect(drawer).toContain('handleConnect();');
  });

  it('handles Enter key on other connection input fields', () => {
    expect(drawer).toMatch(/value=\{sshHost\}[\s\S]*?onKeyDown=\{handleKeyDownSubmit\}/);
    expect(drawer).toMatch(/value=\{sshUser\}[\s\S]*?onKeyDown=\{handleKeyDownSubmit\}/);
    expect(drawer).toMatch(/value=\{expectedHostFingerprint\}[\s\S]*?onKeyDown=\{handleKeyDownSubmit\}/);
    expect(drawer).toMatch(/value=\{dbPassword\}[\s\S]*?onKeyDown=\{handleKeyDownSubmit\}/);
  });

  it('automatically disconnects the tunnel if pre-login security checks fail in SSHTunnelDrawer', () => {
    const handleConnectSection = drawer
      .split('const handleConnect = async () => {')[1]
      ?.split('const handleDisconnect = async () => {')[0];
    expect(handleConnectSection).toBeTruthy();

    // Verifies pre-login screen checks SSH, SELECT 1, Database READY, and Fingerprint
    expect(handleConnectSection).toContain('if (isPreLoginScreen)');
    expect(handleConnectSection).toContain('allChecksPassed = true');
    expect(handleConnectSection).toContain('/api/system/ssh-tunnel/disconnect');
    expect(handleConnectSection).toContain('Giriş öncesi güvenlik kontrollerinden biri');
  });

  it('cleans up and closes the tunnel on server side if database verification fails during connect', () => {
    expect(service).toContain('GÜVENLİK KONTROLÜ: Veritabanı güvenlik kontrolü başarısız oldu. SSH tüneli otomatik olarak kapatılıyor...');
    expect(service).toContain('this.cleanup();');
  });
});

