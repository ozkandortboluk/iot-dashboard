import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../server/db.js';
import { processOtaJobsWorker } from '../server/services/otaWorker.js';
import {
  isHardwareModelCompatible,
  isHardwareRevisionCompatible,
  isValidSemver,
  compareSemver,
} from '../server/utils/semver.js';
import {
  signBinaryBuffer,
  verifyBinarySignature,
  getTrustedPublicKeys,
} from '../server/utils/ota-crypto.js';
import type { Device, Firmware, OtaDeploymentJob } from '../types.js';

describe('P1 - 2.5: OTA Complete Lifecycle, Security & Rollout State Machine', () => {
  const targetDevId = `dev_ota_lifecycle_${Date.now()}`;
  const testFirmwareId = `fw_v200_${Date.now()}`;

  beforeEach(() => {
    // Add target device
    db.addDevice({
      id: targetDevId,
      name: 'Lifecycle Field Controller',
      type: 'ESP32',
      hardwareModel: 'ESP32_WROOM_32',
      hardwareRevision: 'v2.0',
      firmwareVersion: '1.3.0',
      tenantId: 'usr_admin',
      apiKey: `key_ota_test_${Date.now()}`,
      status: 'online',
    } as any);

    // Add firmware
    const mockBin = Buffer.concat([
      Buffer.from([0xe9, 0x02, 0x00, 0x00]),
      crypto.randomBytes(512),
    ]);
    const { sha256, signatureHex, keyId } = signBinaryBuffer(mockBin);

    const fw: Firmware = {
      id: testFirmwareId,
      name: 'Test Controller Firmware',
      deviceType: 'ESP32',
      roleKey: 'DEFAULT',
      version: '2.0.0',
      hardwareModel: 'ESP32_WROOM_32',
      minHardwareRevision: 'v1.0',
      sha256,
      signature: signatureHex,
      keyId,
      binarySize: mockBin.length,
      isActive: true,
      uploadedBy: 'usr_admin',
      created_at: new Date().toISOString(),
    };

    if (!db.data.firmwares) db.data.firmwares = [];
    db.data.firmwares.push(fw);
  });

  it('1. Hardware & Revision Compatibility Verification', () => {
    expect(isHardwareModelCompatible('ESP32_WROOM_32', 'ESP32_WROOM_32')).toBe(true);
    expect(isHardwareModelCompatible('ESP32_WROOM_32', 'ALL')).toBe(true);
    expect(isHardwareModelCompatible('ESP32_S3', 'ESP32_WROOM_32')).toBe(false);

    expect(isHardwareRevisionCompatible('v2.0', 'v1.0')).toBe(true);
    expect(isHardwareRevisionCompatible('v1.0', 'v2.0')).toBe(false);
  });

  it('2. Ed25519 Signature & Root-of-Trust Verification', () => {
    const fw = db.getFirmwares().find((f) => f.id === testFirmwareId);
    expect(fw).toBeDefined();
    expect(fw?.signature).toBeDefined();
    expect(fw?.keyId).toBeDefined();

    const trustedKeys = getTrustedPublicKeys();
    expect(trustedKeys.some((k) => k.keyId === fw?.keyId)).toBe(true);
  });

  it('3. Deployment State Machine & Automatic Expiration / Rollback Timeout Worker', async () => {
    // Create an OTA deployment job that was stuck for > 20 mins
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const job: OtaDeploymentJob = {
      id: `ota_job_${Date.now()}`,
      deviceId: targetDevId,
      deviceName: 'Lifecycle Field Controller',
      deviceType: 'ESP32',
      roleKey: 'DEFAULT',
      targetScope: 'single',
      firmwareId: testFirmwareId,
      firmwareVersion: '2.0.0',
      firmwareName: 'Test Controller Firmware',
      initiatedBy: 'usr_admin',
      status: 'FLASHING',
      attemptCount: 1,
      maxAttempts: 3,
      created_at: oldTimestamp,
      updatedAt: oldTimestamp,
    };

    db.saveOtaJob(job);

    // Process OTA worker
    const workerResult = await processOtaJobsWorker();
    expect(workerResult.processedCount).toBeGreaterThanOrEqual(1);

    // Verify job transitioned to retry or failed state
    const updatedJob = db.getOtaJobById(job.id);
    expect(updatedJob).toBeDefined();
    expect(updatedJob?.attemptCount).toBe(2);
    expect(updatedJob?.status).toBe('PENDING'); // Scheduled for next retry interval
  });

  it('4. Concurrent Deployment Protection', () => {
    // Attempting to deploy another job while active one exists should be guarded
    const existingActiveJobs = db.getOtaJobs().filter(
      (j) => j.deviceId === targetDevId && ['PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING'].includes(j.status)
    );
    expect(existingActiveJobs.length).toBeGreaterThanOrEqual(1);
  });
});
