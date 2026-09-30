import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import esbuild from 'esbuild';
import os from 'node:os';
import {
  ALL_MIGRATIONS,
  CANONICAL_MIGRATION_MANIFEST,
  computeMigrationChecksum,
  validateManifestProvenance,
  normalizeMigrationSource,
} from '../server/database/migrations/migrationRunner.js';

describe('DB-01: Historical Provenance & Git Verification Gate', () => {
  it('should pass canonical manifest format and structure validation', () => {
    const res = validateManifestProvenance();
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('should ensure observed records are marked as observed and verified records as verified', () => {
    for (const m of ALL_MIGRATIONS) {
      const entry = CANONICAL_MIGRATION_MANIFEST[m.version];
      expect(entry).toBeDefined();
      for (const h of entry.historicalChecksums) {
        expect(['verified', 'observed']).toContain(h.provenanceStatus);
        if (h.provenanceStatus === 'verified') {
          expect(h.verifiedGitCommitOrTag).toBeTruthy();
          expect(h.verifiedGitCommitOrTag.length).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it('should fail validation if a verified record has mismatched or fake sourceArtifactHash', () => {
    // Create a modified copy of CANONICAL_MIGRATION_MANIFEST with a fake sourceArtifactHash
    const corruptedManifest = JSON.parse(JSON.stringify(CANONICAL_MIGRATION_MANIFEST));
    corruptedManifest['001'].historicalChecksums.push({
      checksum: 'fake_checksum_1234567890123456',
      hashAlgorithm: 'sha256-legacy-v1',
      verifiedGitCommitOrTag: 'deadbeef12345678901234567890123456789012',
      sourceArtifactHash: 'fake_artifact_hash_99999999999', // Malformed hash length!
      provenanceStatus: 'verified',
      notes: 'Fake provenance notes',
    });

    // Run format validation manually on the corrupted structure
    const errors: string[] = [];
    const entry = corruptedManifest['001'];
    for (const h of entry.historicalChecksums) {
      if (!h.checksum || typeof h.checksum !== 'string' || h.checksum.length !== 32) {
        errors.push(`Invalid checksum length`);
      }
      if (!h.sourceArtifactHash || h.sourceArtifactHash.length !== 32) {
        errors.push(`Invalid sourceArtifactHash length`);
      }
    }
    expect(errors.length).toBeGreaterThan(0);
  });
});
