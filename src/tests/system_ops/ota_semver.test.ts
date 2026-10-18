import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import {
  isValidSemver,
  compareSemver,
  isTargetVersionNewer,
  isHardwareModelCompatible,
  isHardwareRevisionCompatible,
} from '../../server/utils/semver.js';
import {
  compareTokensSafe,
  hashDownloadToken,
  validateEspBinary,
  signBinaryBuffer,
  getEd25519KeyPair,
  getTrustedPublicKeys,
  verifyBinarySignature,
  getPublicKeyByKeyId,
  setMockKeyPairForTesting,
} from '../../server/utils/ota-crypto.js';

describe('OTA SemVer Version Utility Tests', () => {
  it('should validate valid SemVer strings', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('v2.1.3')).toBe(true);
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
    expect(isValidSemver('invalid.version')).toBe(false);
  });

  it('should correctly compare prerelease SemVer versions (Requirement 8)', () => {
    // Standard semver: beta.2 < beta.10
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.0.0-beta.10')).toBeGreaterThan(0);
  });

  it('should determine whether target version is newer', () => {
    expect(isTargetVersionNewer('1.1.0', '1.0.0')).toBe(true);
    expect(isTargetVersionNewer('1.0.0', '1.1.0')).toBe(false);
    expect(isTargetVersionNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('should enforce exact hardware model compatibility', () => {
    expect(isHardwareModelCompatible('ESP32_WROOM_32', 'ESP32_WROOM_32')).toBe(true);
    expect(isHardwareModelCompatible('ESP32_WROOM_32', 'ALL')).toBe(true);
    expect(isHardwareModelCompatible('ESP32_S3', 'ESP32_WROOM_32')).toBe(false);
  });

  it('should enforce minimum hardware revision compatibility', () => {
    expect(isHardwareRevisionCompatible('v2.0', 'v1.0')).toBe(true);
    expect(isHardwareRevisionCompatible('v1.0', 'v2.0')).toBe(false);
    expect(isHardwareRevisionCompatible('v1.0', undefined)).toBe(true);
  });
});

describe('OTA Crypto & Root of Trust Safety Tests', () => {
  beforeAll(() => {
    const pair = crypto.generateKeyPairSync('ed25519');
    const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    setMockKeyPairForTesting({ keyId: 'test_ed25519_v1', privateKeyPem, publicKeyPem,
      publicKeyHex: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex') });
  });
  afterAll(() => setMockKeyPairForTesting(null));
  it('should perform timing-safe token comparison (Requirement 1 & 3)', () => {
    const token = 'otatkn_1234567890abcdef';
    const tokenHash = hashDownloadToken(token);

    expect(compareTokensSafe(token, tokenHash)).toBe(true);
    expect(compareTokensSafe(token, token)).toBe(true);
    expect(compareTokensSafe('wrong_token', tokenHash)).toBe(false);
  });

  it('should generate Ed25519 signature and bind keyId (Root of Trust Requirement)', () => {
    const mockBinary = Buffer.concat([
      Buffer.from([0xe9, 0x02, 0x00, 0x00]), // Magic ESP header 0xE9
      crypto.randomBytes(1024),
    ]);

    const validation = validateEspBinary(mockBinary);
    expect(validation.valid).toBe(true);

    const { sha256, signatureHex, keyId } = signBinaryBuffer(mockBinary);
    expect(sha256).toHaveLength(64); // SHA-256 hex
    expect(signatureHex.length).toBeGreaterThan(0);
    expect(keyId).toBeDefined();
    const activeKeyExpected = getEd25519KeyPair().keyId;
    expect(keyId).toBe(activeKeyExpected);

    // Verify signature using verifyBinarySignature and keyId
    const isVerified = verifyBinarySignature(mockBinary, signatureHex, keyId);
    expect(isVerified).toBe(true);
  });

  it('should maintain trusted public key ring for key rotation transition periods', () => {
    const activeKeyExpected = getEd25519KeyPair().keyId;
    const trustedKeys = getTrustedPublicKeys();
    expect(Array.isArray(trustedKeys)).toBe(true);
    expect(trustedKeys.length).toBeGreaterThanOrEqual(1);

    const activeKey = trustedKeys.find((k) => k.isCurrent);
    expect(activeKey).toBeDefined();
    expect(activeKey?.keyId).toBe(activeKeyExpected);
    expect(activeKey?.publicKeyPem).toContain('BEGIN PUBLIC KEY');

    // Lookup key by ID
    const keyInfo = getPublicKeyByKeyId(activeKeyExpected);
    expect(keyInfo).not.toBeNull();
    expect(keyInfo?.keyId).toBe(activeKeyExpected);
  });

  it('should reject non-ESP binary headers', () => {
    const invalidBinary = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // Invalid magic byte (not 0xE9)
      Buffer.alloc(2048),
    ]);
    const validation = validateEspBinary(invalidBinary);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('0xE9');
  });
});
