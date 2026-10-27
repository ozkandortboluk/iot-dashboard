import { describe, it, expect, vi } from 'vitest';
import {
  verifyHostFingerprint,
  computeHostFingerprints,
  sshTunnelService,
} from '../../server/services/sshTunnel.service.js';

describe('SEC-02: Strict SSH Host Key Pinning & Verification (Fail-Closed)', () => {
  const sampleServerKey = Buffer.from('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC3sampleKeyForTesting1234567890');
  const changedServerKey = Buffer.from('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD4changedKeyForTesting0987654321');

  const { sha256: sampleSha256, md5: sampleMd5 } = computeHostFingerprints(sampleServerKey);
  const { sha256: changedSha256 } = computeHostFingerprints(changedServerKey);

  it('1. Doğru pin: accepts matching SHA256 and MD5 host fingerprints', () => {
    // Exact SHA256 string
    const resultSha = verifyHostFingerprint(sampleServerKey, sampleSha256);
    expect(resultSha.valid).toBe(true);
    expect(resultSha.pinned).toBe(true);
    expect(resultSha.actualSha256).toBe(sampleSha256);
    expect(resultSha.error).toBeUndefined();

    // Raw SHA256 hash without prefix
    const rawSha = sampleSha256.replace(/^SHA256:/i, '');
    const resultRawSha = verifyHostFingerprint(sampleServerKey, rawSha);
    expect(resultRawSha.valid).toBe(true);
    expect(resultRawSha.pinned).toBe(true);

    // MD5 fingerprint
    const resultMd5 = verifyHostFingerprint(sampleServerKey, sampleMd5);
    expect(resultMd5.valid).toBe(true);
    expect(resultMd5.pinned).toBe(true);
  });

  it('2. Yanlış pin: rejects invalid/mismatched fingerprint string', () => {
    const wrongPin = 'SHA256:invalidFingerprintStringThatDoesNotMatchServerKey123=';
    const result = verifyHostFingerprint(sampleServerKey, wrongPin);
    expect(result.valid).toBe(false);
    expect(result.pinned).toBe(true);
    expect(result.error).toContain('SSH Host Key Fingerprint uyuşmazlığı tespit edildi');
  });

  it('3. Host key değişti: rejects when server host key changes for pinned fingerprint', () => {
    // Pin expected to be sampleSha256, but server presents changedServerKey
    const result = verifyHostFingerprint(changedServerKey, sampleSha256);
    expect(result.valid).toBe(false);
    expect(result.pinned).toBe(true);
    expect(result.actualSha256).toBe(changedSha256);
    expect(result.error).toContain('Olası Ortadaki Adam (MITM) veya sahte sunucu bağlantı girişimi engellendi');
  });

  it('4. Zorunlu pin eksik: rejects when expectedFingerprint is missing/empty (Fail-Closed)', () => {
    // Empty string
    const resultEmpty = verifyHostFingerprint(sampleServerKey, '');
    expect(resultEmpty.valid).toBe(false);
    expect(resultEmpty.pinned).toBe(false);
    expect(resultEmpty.error).toContain('Zorunlu SSH Host Key Parmak İzi (expectedHostFingerprint) eksik');

    // Undefined
    const resultUndefined = verifyHostFingerprint(sampleServerKey, undefined);
    expect(resultUndefined.valid).toBe(false);
    expect(resultUndefined.pinned).toBe(false);
    expect(resultUndefined.error).toContain('fail-closed');
  });

  it('5. testConnection fail-closed: refuses to initiate connection when expectedHostFingerprint is omitted', async () => {
    const testResult = await sshTunnelService.testConnection({
      sshHost: '127.0.0.1',
      sshPort: 22,
      sshUser: 'admin',
      authType: 'password',
      password: 'secretPassword123',
      remoteDbHost: '127.0.0.1',
      remoteDbPort: 5432,
      localPort: 5433,
    });

    expect(testResult.success).toBe(false);
    expect(testResult.message).toContain('SHA256 parmak izini VPS üzerinden doğrulayıp girin');
  });

  it('6. connectTunnel fail-closed: refuses to establish tunnel when expectedHostFingerprint is omitted', async () => {
    const probeSpy = vi.spyOn(sshTunnelService as any, 'probeHostFingerprint');
    const connectResult = await sshTunnelService.connectTunnel({
      sshHost: '127.0.0.1',
      sshPort: 22,
      sshUser: 'admin',
      authType: 'password',
      password: 'secretPassword123',
      remoteDbHost: '127.0.0.1',
      remoteDbPort: 5432,
      localPort: 5433,
    });

    expect(connectResult.success).toBe(false);
    expect(connectResult.message).toContain('Zorunlu SSH Host Key Parmak İzi');
    expect(probeSpy).not.toHaveBeenCalled();
    probeSpy.mockRestore();
  }, 15000);
});
