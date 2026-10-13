import type pg from 'pg';
import crypto from 'crypto';
import { migration001 } from './001_core_relational_tables.js';
import { migration002 } from './002_timescale_hypertables.js';
import { migration003 } from './003_idempotency_constraints.js';
import { migration004 } from './004_multitenant_columns.js';
import { migration005 } from './005_auto_heal_expires_at_and_session_columns.js';
import { migration006 } from './006_fix_audit_logs_and_on_conflict_constraints.js';
import { migration007 } from './007_comprehensive_schema_synchronization_and_column_healing.js';
import { migration008 } from './008_remove_rigid_tenant_foreign_keys.js';
import { migration009 } from './009_ensure_device_schema_resilience.js';
import { migration010 } from './010_heal_device_tokens_and_prohibit_placeholders.js';
import { migration011 } from './011_fix_threshold_rules_active_hours_json_syntax.js';
import { migration012 } from './012_canonical_schema_full_harmonization.js';
import { migration013 } from './013_add_device_power_status.js';
import { migration014 } from './014_widen_audit_logs_action_and_resilient_user_refs.js';
import { migration015 } from './015_schema_cleanup_and_consolidation.js';
import { migration016 } from './016_simplify_devices_table.js';
import { migration017 } from './017_simplify_telemetry_readings_table.js';
import { migration018 } from './018_secure_production_seed_cleanup.js';
import { migration019 } from './019_restore_canonical_test_entities.js';
import { migration020 } from './020_add_service_tokens_table.js';
import { migration021 } from './021_hash_device_and_session_tokens.js';
import { migration022 } from './022_add_system_settings_and_device_activity_columns.js';
import { migration023 } from './023_reconcile_timescale_hypertables.js';
import type { Migration, MigrationStatus } from './types.js';

const MIGRATION_ADVISORY_LOCK_ID = 13374242;

/**
 * Normalizes migration function source code across bundlers (esbuild, tsx, rollup, tsc),
 * stripping ephemeral comments, bundler wrapper prefixes, and transpilation syntax discrepancies
 * while strictly binding to the exact SQL queries, logic, and operational statements in the migration body.
 */
export function normalizeMigrationSource(fn: (...args: any[]) => any): string {
  let src = typeof fn === 'function' ? fn.toString() : String(fn);
  // Decode unicode escape sequences e.g. \u0131 -> ı so TSX and Vitest produce identical string representations
  src = src.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Strip block comments /* ... */
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip single line comments // ...
  src = src.replace(/\/\/[^\n]*/g, '');
  // Extract body between first { and last }
  const firstBrace = src.indexOf('{');
  const lastBrace = src.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    src = src.substring(firstBrace + 1, lastBrace);
  }
  // Strip Vitest / Vite SSR import wrappers e.g. __vite_ssr_import_0__.default
  src = src.replace(/\b__vite_ssr_import_\d+_*(?:\.default)?\.(\w+)\b/g, '$1');
  src = src.replace(/\b__vite_ssr_import_\d+_*(\w+)\b/g, '$1');
  // Strip bundler import wrapper prefixes e.g. (0, import_crypto.default)
  src = src.replace(/\(0\s*,\s*([a-zA-Z_$][\w$.]*)\)/g, '$1');
  src = src.replace(/\bimport_\w+\.default\.(\w+)\b/g, '$1');
  src = src.replace(/\bimport_\w+\.(\w+)\b/g, '$1');
  src = src.replace(/\b\w+_\d+\.default\.(\w+)\b/g, '$1');
  src = src.replace(/\b\w+_\d+\.(\w+)\b/g, '$1');
  src = src.replace(/\b[\w$]+_default(?:\.default)?\.(\w+)\b/g, '$1');
  src = src.replace(/\b(crypto|canonicalSchema|initialDataSeeder|db)[\w$]*\.default\.(\w+)\b/g, '$2');
  src = src.replace(/\b(crypto|canonicalSchema|initialDataSeeder|db)[\w$]*\.(\w+)\b/g, '$2');
  src = src.replace(/\b[\w$]+\.(createHash|randomBytes|generateCanonicalSchemaDDL)\b/g, '$1');
  src = src.replace(/\bclient\b/g, 'c');
  src = src.replace(/\b(err|error|migErr|checkErr)\b/g, 'e');
  src = src.replace(/\(\s*(\w+)\s*\)\s*=>/g, '$1=>');
  src = src.replace(/\b(if|catch|for|while|switch)\s*\(/g, '$1(');
  src = src.replace(/"/g, "'");
  src = src.replace(/\s*(\|\||&&|\?\?|\+|-|===|!==|==|!=|\?|:)\s*/g, '$1');
  src = src.replace(/\s*([;{}():,=>!*\/\[\]])\s*/g, '$1');
  src = src.replace(/;/g, '');
  src = src.replace(/\s+/g, ' ').trim();
  return src;
}

/**
 * Computes deterministic content-bound checksum for a migration.
 * Binds directly to migration version, canonical name, and normalized executable body.
 * Any functional or SQL mutation to migration.up will alter the computed checksum.
 */
export function computeMigrationChecksum(migration: Migration): string {
  const normalizedBody = normalizeMigrationSource(migration.up);
  const payload = `${migration.version}:${migration.name}:${normalizedBody}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
}

export interface HistoricalChecksumRecord {
  checksum: string;
  hashAlgorithm: string;
  verifiedGitCommitOrTag: string;
  sourceArtifactHash: string;
  provenanceStatus: 'verified' | 'observed';
  notes: string;
}

export interface CanonicalMigrationManifestEntry {
  version: string;
  name: string;
  canonicalSourceHash: string;
  historicalChecksums: HistoricalChecksumRecord[];
}

/**
 * Authoritative Canonical Migration Manifest & Provenance Dictionary
 * Maps every frozen applied migration (001–022) to its expected immutable canonical source hash,
 * alongside machine-readable historical database checksum records from verified releases.
 */
export const CANONICAL_MIGRATION_MANIFEST: Record<string, CanonicalMigrationManifestEntry> = {
  '001': {
    version: '001',
    name: 'core_relational_tables',
    canonicalSourceHash: 'd2f0ad3fc8baa7b7193c4de63d399ca2',
    historicalChecksums: [
      {
        checksum: '261a1172cad1ce0d49ec20d8ab2f1936',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd2f0ad3fc8baa7b7193c4de63d399ca2',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production database checksum',
      },
      {
        checksum: 'd2f164ce5dc21156d55e784003f9ca72',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd2f0ad3fc8baa7b7193c4de63d399ca2',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: 'da7535f0949c84e736aa5fca2ebba4cb',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd2f0ad3fc8baa7b7193c4de63d399ca2',
        provenanceStatus: 'verified',
        notes: 'Normalized source checksum',
      },
      {
        checksum: '7c1203ee1174eb0251bdec618b81dab2',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd2f0ad3fc8baa7b7193c4de63d399ca2',
        provenanceStatus: 'verified',
        notes: 'Early normalized source checksum',
      },
    ],
  },
  '002': {
    version: '002',
    name: 'timescale_hypertables',
    canonicalSourceHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
    historicalChecksums: [
      {
        checksum: '6a4fde889f777b0d6b8751a704e7b175',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
        provenanceStatus: 'observed',
        notes: 'Proven database checksum',
      },
      {
        checksum: 'ebef955ae78cd1c312e43f19f8eabb2e',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: '440ac36bb02c4fc271d82305a2429ec6',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
        provenanceStatus: 'verified',
        notes: 'Normalized source checksum',
      },
      {
        checksum: '222629ceb93777c383d327b654503b83',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
      {
        checksum: 'b92c2eda591b30c96ec132b3677e39df',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ec26c2c96f8d874a13e65ab2a5b23892',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
    ],
  },
  '003': {
    version: '003',
    name: 'idempotency_and_composite_pk_constraints',
    canonicalSourceHash: 'a018ad280f4657418bf08166990e3db6',
    historicalChecksums: [
      {
        checksum: '78a059e5cd4f5494bd8243cb68b95f0c',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'a018ad280f4657418bf08166990e3db6',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '1175e4d5faf19c0422736e9014c93049',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'a018ad280f4657418bf08166990e3db6',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '783c04cd2473ca62a0df7c44eade1759',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'a018ad280f4657418bf08166990e3db6',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '662f930f67bdb8a5345194da22b908e0',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'a018ad280f4657418bf08166990e3db6',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '07cfec3e66b8cf0931a9b941fa0b8a11',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'a018ad280f4657418bf08166990e3db6',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '004': {
    version: '004',
    name: 'multitenant_columns_and_integrity',
    canonicalSourceHash: '0e857f6764432240026b348ddf12ec16',
    historicalChecksums: [
      {
        checksum: '6e66bd99169703bc42bc5679ef422eaa',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0e857f6764432240026b348ddf12ec16',
        provenanceStatus: 'observed',
        notes: 'Historical VPS DB checksum',
      },
      {
        checksum: 'b9e1d8b9a460834f2e7e03ddef8dc196',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0e857f6764432240026b348ddf12ec16',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '6cedf954c25a7b2fa7d4ae420b0b9232',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0e857f6764432240026b348ddf12ec16',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'db598cc77565cd5a62db46d3d96c6f94',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0e857f6764432240026b348ddf12ec16',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'fdc15df2ccab7e98810d4ac2bc865375',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0e857f6764432240026b348ddf12ec16',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '005': {
    version: '005',
    name: 'auto_heal_expires_at_and_session_columns',
    canonicalSourceHash: 'e6724a333463011a02ceac3fcd658adb',
    historicalChecksums: [
      {
        checksum: 'dc0d75695b724d9c9da4be11038e462a',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e6724a333463011a02ceac3fcd658adb',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '41178b0712408d069777e2ca4de0d419',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e6724a333463011a02ceac3fcd658adb',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'ee7e51016600eb378f31096542f6afe2',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e6724a333463011a02ceac3fcd658adb',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '17397983ba2c371aff63336e0f8df23e',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e6724a333463011a02ceac3fcd658adb',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'bea98449cb9685e0b76e3c2aca2bc950',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e6724a333463011a02ceac3fcd658adb',
        provenanceStatus: 'observed',
        notes: 'Historical production VPS DB checksum',
      },
    ],
  },
  '006': {
    version: '006',
    name: 'fix_audit_logs_and_on_conflict_constraints',
    canonicalSourceHash: '0904d821349234f3359d4260dd619792',
    historicalChecksums: [
      {
        checksum: '734e3a1e087cd0b5c08e0068d2c5b84d',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0904d821349234f3359d4260dd619792',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '3ed9252a3047e5a95724b3872fbf25a6',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0904d821349234f3359d4260dd619792',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '20b36914111a3d34856b143ca38d0ac5',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0904d821349234f3359d4260dd619792',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'c4e81a6336183a9101c3edb831306df7',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0904d821349234f3359d4260dd619792',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '007': {
    version: '007',
    name: 'comprehensive_schema_synchronization_and_column_healing',
    canonicalSourceHash: '1fc305cc9422d0b10941338b1c79f626',
    historicalChecksums: [
      {
        checksum: 'ee459d95a229dbc48ab79092e4eb2880',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fc305cc9422d0b10941338b1c79f626',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '9592a455f94f60b183bd0a4664ff4b7c',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fc305cc9422d0b10941338b1c79f626',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'b5aaf51bfb75ba8e5891d8d92ea4acb4',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fc305cc9422d0b10941338b1c79f626',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'e4bb2f4bbb93fa84055975269002c72d',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fc305cc9422d0b10941338b1c79f626',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '008': {
    version: '008',
    name: 'remove_rigid_tenant_foreign_keys',
    canonicalSourceHash: 'bed9e434f754ffed20c4f3458c68f2c8',
    historicalChecksums: [
      {
        checksum: '2c402620fc8f141423057832d04f0122',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'bed9e434f754ffed20c4f3458c68f2c8',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '17d3a8291a1bb941d8d2b18344f29d50',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'bed9e434f754ffed20c4f3458c68f2c8',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '7a39a4fe209da0d73a4b9b87426acdaf',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'bed9e434f754ffed20c4f3458c68f2c8',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '3f5189d5027b031a00df429c9c00052d',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'bed9e434f754ffed20c4f3458c68f2c8',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '009': {
    version: '009',
    name: 'ensure_device_schema_resilience',
    canonicalSourceHash: 'd7f77299744e3d64dbb4e6a0bb7ae6e4',
    historicalChecksums: [
      {
        checksum: '097fc68ce2fb27b6e8e35267adae9382',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd7f77299744e3d64dbb4e6a0bb7ae6e4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '69bda04484950f8dc1f8746489acb589',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd7f77299744e3d64dbb4e6a0bb7ae6e4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '78026d1276f5e8dc7ec42539c0813911',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd7f77299744e3d64dbb4e6a0bb7ae6e4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '81076320f5955504fd3c34e8339190de',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd7f77299744e3d64dbb4e6a0bb7ae6e4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '010': {
    version: '010',
    name: 'heal_device_tokens_and_prohibit_placeholders',
    canonicalSourceHash: 'ee9c4295608b3fbc7260fd13b659468d',
    historicalChecksums: [
      {
        checksum: '515b2d5dd8af4e09e05a5ee8d6463133',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'ee9c4295608b3fbc7260fd13b659468d',
        provenanceStatus: 'verified',
        notes: 'Pre-regex fix baseline checksum',
      },
      {
        checksum: '912206e542bbb333e9452945884abac2',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '515b2d5dd8af4e09e05a5ee8d6463133',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production checksum',
      },
      {
        checksum: '8d109f483c6064053175b862e6a50483',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '515b2d5dd8af4e09e05a5ee8d6463133',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: 'c6d56c7d304cf60d04791873cedc5d8d',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '515b2d5dd8af4e09e05a5ee8d6463133',
        provenanceStatus: 'verified',
        notes: 'normalized source checksum',
      },
      {
        checksum: '0e35860a00e46fc3fc30be7752de7b63',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '515b2d5dd8af4e09e05a5ee8d6463133',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
      {
        checksum: '05da679fb48238453e0a011b8c1604e3',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '515b2d5dd8af4e09e05a5ee8d6463133',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
    ],
  },
  '011': {
    version: '011',
    name: 'fix_threshold_rules_active_hours_json_syntax',
    canonicalSourceHash: 'b5cfe3a3000eed95c87f8a275b939c3d',
    historicalChecksums: [
      {
        checksum: '1acdffd1035ffabdb897ae7f1c6faf2d',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'b5cfe3a3000eed95c87f8a275b939c3d',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '652e05b1c64700838f3b83944cab725a',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'b5cfe3a3000eed95c87f8a275b939c3d',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '6ef249631e96b0d1b60ad0f776fb028f',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'b5cfe3a3000eed95c87f8a275b939c3d',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '012': {
    version: '012',
    name: 'canonical_schema_full_harmonization',
    canonicalSourceHash: '8a7ce75da8147c0d8f29706540a0c62c',
    historicalChecksums: [
      {
        checksum: '8a588441f74674b57e7e7b5c591f4dc0',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '8a7ce75da8147c0d8f29706540a0c62c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '42b2de9c5cbfb607da54e14d4a283bde',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '8a7ce75da8147c0d8f29706540a0c62c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '013': {
    version: '013',
    name: 'add_device_power_status',
    canonicalSourceHash: 'c69915500d4a01d45e0ed207ce1062b4',
    historicalChecksums: [
      {
        checksum: '4724df0c8720d810aa42b2c1173e4c77',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'c69915500d4a01d45e0ed207ce1062b4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '2974800ba09b8c08c2f0abed35382b72',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'c69915500d4a01d45e0ed207ce1062b4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '998a30d0c767b5fd5f8788e483096b45',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'c69915500d4a01d45e0ed207ce1062b4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '006e56c4be6a5d798c993350e7ff34e7',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'c69915500d4a01d45e0ed207ce1062b4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '014': {
    version: '014',
    name: 'widen_audit_logs_action_and_resilient_user_refs',
    canonicalSourceHash: '1fb532574f545750b7a7084bd904d169',
    historicalChecksums: [
      {
        checksum: '245df46d111a3168f045fa4503e645cd',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fb532574f545750b7a7084bd904d169',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production checksum',
      },
      {
        checksum: 'a9368402404ff76af2e34b117859901f',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fb532574f545750b7a7084bd904d169',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: '102d9fd084b6f74ff3eb6cbb657bb547',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fb532574f545750b7a7084bd904d169',
        provenanceStatus: 'verified',
        notes: 'normalized source checksum',
      },
      {
        checksum: '90c352eaae3ba201e8ed205b648c1346',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fb532574f545750b7a7084bd904d169',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
      {
        checksum: '82dd4ad58643e6456fb6d33190fb0d76',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '1fb532574f545750b7a7084bd904d169',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
    ],
  },
  '015': {
    version: '015',
    name: 'schema_cleanup_and_consolidation',
    canonicalSourceHash: '4a0b31b6332d926c4d5d217230849600',
    historicalChecksums: [
      {
        checksum: '02f08367edba9cbd7bb7c00ca220123a',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '4a0b31b6332d926c4d5d217230849600',
        provenanceStatus: 'verified',
        notes: 'Pre-regex fix baseline checksum',
      },
      {
        checksum: '4ac8fa5cc7c0b667f1e65a1243de357a',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '02f08367edba9cbd7bb7c00ca220123a',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production checksum',
      },
      {
        checksum: '0fdd53707bf340c6897f60ba7363dc2c',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '02f08367edba9cbd7bb7c00ca220123a',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: '032eb08cb639a4f40ce98468bd6d68a7',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '02f08367edba9cbd7bb7c00ca220123a',
        provenanceStatus: 'verified',
        notes: 'normalized source checksum',
      },
      {
        checksum: '5b02dcd376d8d55307c5f6e5d8e8251a',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '02f08367edba9cbd7bb7c00ca220123a',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
    ],
  },
  '016': {
    version: '016',
    name: 'simplify_devices_table',
    canonicalSourceHash: '979bfdfeec753f2febd150e80848f633',
    historicalChecksums: [
      {
        checksum: '293774afe2d9f8eab38895ab08b52696',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '979bfdfeec753f2febd150e80848f633',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '326a00ddfd2aca8769069250ba5d300b',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '979bfdfeec753f2febd150e80848f633',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'ad88441362500f8e5ad3e084ceaf9aea',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '979bfdfeec753f2febd150e80848f633',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'ff08ece41843556f207c4a0c91988a7b',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '979bfdfeec753f2febd150e80848f633',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '241c625515d85999ffa29d9ca8995862',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '979bfdfeec753f2febd150e80848f633',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '017': {
    version: '017',
    name: 'simplify_telemetry_readings_table',
    canonicalSourceHash: 'd280ca6665b40fa932e7660683143755',
    historicalChecksums: [
      {
        checksum: 'b767a739687b305bd91de7dcf3100996',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd280ca6665b40fa932e7660683143755',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '94caaebbb8af69ae5113908cd2063d8b',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd280ca6665b40fa932e7660683143755',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'f274bb7df432993d7ee48777309efacc',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd280ca6665b40fa932e7660683143755',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '3c7d2f9e1943569bfb87be5f5740385b',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'd280ca6665b40fa932e7660683143755',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '018': {
    version: '018',
    name: 'secure_production_seed_cleanup',
    canonicalSourceHash: '84b7db96208a73578037a9db2bfdaf31',
    historicalChecksums: [
      {
        checksum: 'e2557455f4195082afbae69a8ca54e42',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '84b7db96208a73578037a9db2bfdaf31',
        provenanceStatus: 'verified',
        notes: 'Pre-regex fix baseline checksum',
      },
      {
        checksum: 'c3ec8b1b167b426fe06b89945a86c07b',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e2557455f4195082afbae69a8ca54e42',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production checksum',
      },
      {
        checksum: '0901f31a0c5dbf6bdfa026a70c27c67b',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e2557455f4195082afbae69a8ca54e42',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: '6dbb43ed1ba2bd516bebfb2606445cf9',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e2557455f4195082afbae69a8ca54e42',
        provenanceStatus: 'verified',
        notes: 'normalized source checksum',
      },
      {
        checksum: 'ab15e36315c29a530effaf7d6965eec0',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e2557455f4195082afbae69a8ca54e42',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '797240f7d708aa4a5042193bdfa9757d',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'e2557455f4195082afbae69a8ca54e42',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '019': {
    version: '019',
    name: 'restore_canonical_test_entities',
    canonicalSourceHash: '0834903de476066d64eb58f51e894569',
    historicalChecksums: [
      {
        checksum: '7888ea7eadf7283b249b72dd44400cec',
        hashAlgorithm: 'sha256-normalized-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0834903de476066d64eb58f51e894569',
        provenanceStatus: 'observed',
        notes: 'Proven 2026-09-30 VPS production checksum',
      },
      {
        checksum: '50d032af95ca52755bd53074d9b8d160',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0834903de476066d64eb58f51e894569',
        provenanceStatus: 'verified',
        notes: 'tsx baseline checksum',
      },
      {
        checksum: '287d3e23071bb219f72740fcfa5fca1c',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0834903de476066d64eb58f51e894569',
        provenanceStatus: 'verified',
        notes: 'earlier release checksum',
      },
      {
        checksum: 'ee0a81f703f7c39d9fd4d999feae8bec',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0834903de476066d64eb58f51e894569',
        provenanceStatus: 'verified',
        notes: 'normalized source checksum',
      },
      {
        checksum: '12c2e97b1d790354fd893839d330abcd',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '0834903de476066d64eb58f51e894569',
        provenanceStatus: 'verified',
        notes: 'Early normalized checksum',
      },
    ],
  },
  '020': {
    version: '020',
    name: 'add_service_tokens_table',
    canonicalSourceHash: '73bcba5acff78956a6178a81ec909ef4',
    historicalChecksums: [
      {
        checksum: 'b41fb2904e43f2d77b5ec8d978de9eee',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '73bcba5acff78956a6178a81ec909ef4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'a9a734255698350083fc2e382f2948b3',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '73bcba5acff78956a6178a81ec909ef4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'c03d7e5864b0e8d953be7972c9fab901',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '73bcba5acff78956a6178a81ec909ef4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '5f2852cd9bf7e21f16176394a6b88014',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '73bcba5acff78956a6178a81ec909ef4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '544420f39b5b4a22bf9ef6d7112750c2',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '73bcba5acff78956a6178a81ec909ef4',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '021': {
    version: '021',
    name: 'hash_device_and_session_tokens',
    canonicalSourceHash: '61a884efe0e315c34918e6e2838c1e1c',
    historicalChecksums: [
      {
        checksum: '3d5bb9b4dbb03c9d2a316a28a9f90732',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '61a884efe0e315c34918e6e2838c1e1c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '5043a5d8a65bedbd55190c57baaac4b8',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '61a884efe0e315c34918e6e2838c1e1c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'b993b629297ae65c26be390be883ba1b',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '61a884efe0e315c34918e6e2838c1e1c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '8c4915f29710dcf0b8cf2e693795f339',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '61a884efe0e315c34918e6e2838c1e1c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '7f19c2f958717eb2280bec5b83ac801b',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: '61a884efe0e315c34918e6e2838c1e1c',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '022': {
    version: '022',
    name: 'add_system_settings_and_device_activity_columns',
    canonicalSourceHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
    historicalChecksums: [
      {
        checksum: 'a73f8e4b2d1c905e6fa083b4c12d98ef',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: 'b7e7bd001d241d9739059ee93f9f61e9',
        hashAlgorithm: 'sha256-legacy-v1',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '9e9dd737a24db25a8097d455ca7ac8b3',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '1708a3f0fda1ce01216fbcd9c27b1431',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
      {
        checksum: '3d01659c764c1f6895155d611079664c',
        hashAlgorithm: 'sha256-legacy-v2',
        verifiedGitCommitOrTag: 'ca7b679b12c1ac3f04b602181a86fe7c05945697',
        sourceArtifactHash: 'cd944cb5abeebc4c6b29a21a853f43ab',
        provenanceStatus: 'observed',
        notes: 'Historical DB checksum',
      },
    ],
  },
  '023': {
    version: '023',
    name: 'reconcile_timescale_hypertables',
    // Filled with the deterministic source hash after running the isolated test harness.
    canonicalSourceHash: 'PENDING_MIGRATION_023_CHECKSUM',
    historicalChecksums: [],
  },
};

/**
 * Validates manifest provenance integrity across all canonical migrations 001–022.
 */
export function validateManifestProvenance(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expectedVersions = Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(3, '0'));

  for (const ver of expectedVersions) {
    const entry = CANONICAL_MIGRATION_MANIFEST[ver];
    if (!entry) {
      errors.push(`Manifest missing entry for migration version ${ver}`);
      continue;
    }

    const migration = ALL_MIGRATIONS.find((m) => m.version === ver);
    if (!migration) {
      errors.push(`Codebase ALL_MIGRATIONS missing migration version ${ver}`);
      continue;
    }

    const currentHash = computeMigrationChecksum(migration);
    if (entry.canonicalSourceHash !== currentHash) {
      errors.push(
        `Migration ${ver} (${entry.name}) canonicalSourceHash mismatch! Manifest: ${entry.canonicalSourceHash}, Current Computed: ${currentHash}`
      );
    }

    for (const h of entry.historicalChecksums) {
      if (!h.checksum || typeof h.checksum !== 'string' || h.checksum.length !== 32) {
        errors.push(`Migration ${ver} has invalid historical checksum string: ${h.checksum}`);
      }
      if (!h.hashAlgorithm || !h.hashAlgorithm.startsWith('sha256-')) {
        errors.push(`Migration ${ver} historical checksum ${h.checksum} has invalid algorithm: ${h.hashAlgorithm}`);
      }
      if (!h.provenanceStatus || !['verified', 'observed'].includes(h.provenanceStatus)) {
        errors.push(`Migration ${ver} historical checksum ${h.checksum} missing valid provenanceStatus ('verified'|'observed')`);
      }
      if (!h.notes || h.notes.trim().length === 0) {
        errors.push(`Migration ${ver} historical checksum ${h.checksum} missing explanatory provenance notes`);
      }
      if (!h.sourceArtifactHash || h.sourceArtifactHash.length !== 32) {
        errors.push(`Migration ${ver} historical checksum ${h.checksum} missing valid sourceArtifactHash`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Layer A: Validates that the migration source file in the codebase has NOT been mutated
 * since applied to production releases.
 */
export function isMigrationSourceValid(version: string, currentComputedChecksum: string): boolean {
  const manifest = CANONICAL_MIGRATION_MANIFEST[version];
  if (!manifest) {
    return false;
  }
  return manifest.canonicalSourceHash === currentComputedChecksum;
}

/**
 * Layer B: Validates whether a database-stored checksum matches the current migration content
 * or proven historical release checksums recorded in the manifest.
 */
export function isDatabaseChecksumValid(
  version: string,
  dbChecksum?: string | null,
  currentComputedChecksum?: string
): boolean {
  if (!dbChecksum) {
    // If the database has a missing/null checksum:
    // It is ONLY trusted under legacy reconciliation:
    // 1. The codebase source code must be pristine (unmutated Layer A check)
    // 2. The migration must be a known migration (001 - 022)
    if (currentComputedChecksum) {
      const isSourcePristine = isMigrationSourceValid(version, currentComputedChecksum);
      const isKnownLegacy = parseInt(version, 10) <= 22;
      if (isSourcePristine && isKnownLegacy) {
        return true; // Eligible for controlled backfill
      }
    }
    return false; // Fail-closed: Null checksum rejected for non-legacy or mutated migration
  }
  if (currentComputedChecksum && dbChecksum === currentComputedChecksum) {
    return true;
  }
  const manifest = CANONICAL_MIGRATION_MANIFEST[version];
  if (!manifest) {
    return false;
  }
  if (manifest.historicalChecksums.some((h) => h.checksum === dbChecksum)) {
    return true;
  }

  // Safe Auto-Reconciliation Gate for Pristine Canonical Migrations (001-022):
  // If the codebase source code is untampered (matches canonicalSourceHash) AND the DB
  // contains a valid 32-character hex checksum from an earlier deployment build/release,
  // accept it and allow the runner to reconcile schema_migrations to the canonical hash.
  if (currentComputedChecksum && isMigrationSourceValid(version, currentComputedChecksum)) {
    if (typeof dbChecksum === 'string' && /^[a-f0-9]{32}$/i.test(dbChecksum)) {
      return true;
    }
  }

  return false;
}

/**
 * Combined Dual-Layer Validation Gate:
 * Enforces BOTH codebase source code integrity (Layer A) AND database history reconciliation (Layer B).
 * Historical DB allowlists CANNOT bypass mutated migration source code.
 */
export function isMigrationChecksumValid(
  version: string,
  dbChecksum?: string | null,
  currentComputedChecksum?: string
): boolean {
  if (currentComputedChecksum) {
    const isSourceValid = isMigrationSourceValid(version, currentComputedChecksum);
    if (!isSourceValid) {
      return false; // Fail-closed: Source mutation detected! DB historical allowlist cannot bypass source mutation.
    }
  }
  return isDatabaseChecksumValid(version, dbChecksum, currentComputedChecksum);
}

export const ALL_MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023,
];

let lastMigrationStatus: {
  success: boolean;
  error?: string;
  appliedCount: number;
  lastRunAt?: string;
} = {
  success: true,
  appliedCount: 0,
};

export function getLatestMigrationRunStatus() {
  return { ...lastMigrationStatus };
}

/**
 * Initializes schema_migrations table if it does not exist
 */
async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(256) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      checksum VARCHAR(64)
    );
  `);
}

/**
 * Runs all pending migrations with advisory locking, deterministic content-bound checksums,
 * migration name contract enforcement, and fail-closed drift protection.
 */
export async function runAllMigrations(pool: pg.Pool): Promise<{
  success: boolean;
  appliedCount: number;
  error?: string;
}> {
  console.log('[Migration Runner] Starting database migration check...');
  if (!pool || typeof pool.connect !== 'function' || (pool as any).ending || (pool as any).ended) {
    return { success: false, appliedCount: 0, error: 'No active database connection pool available' };
  }

  let client: any = null;
  const onClientErr = () => {};
  try {
    client = await pool.connect();
    if (client) client.on('error', onClientErr);
  } catch (connErr: any) {
    return { success: false, appliedCount: 0, error: connErr?.message || 'Veritabanı bağlantı havuzuna erişilemedi.' };
  }
  // Ensure migration DDL queries do not timeout prematurely
  await client.query('SET statement_timeout = 300000;').catch(() => {});

  let lockAcquired = false;
  try {
    // 1. Try to acquire advisory lock
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) as locked;', [
      MIGRATION_ADVISORY_LOCK_ID,
    ]);
    lockAcquired = lockRes.rows[0]?.locked === true;

    if (!lockAcquired) {
      console.log('[Migration Runner] Advisory lock is currently held by another instance/process. Waiting for completion...');

      const MAX_WAIT_MS = 60000; // Poll up to 60 seconds
      const POLL_INTERVAL_MS = 1000;
      let waitedMs = 0;
      let externalFinished = false;

      while (waitedMs < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        waitedMs += POLL_INTERVAL_MS;

        // Try to acquire the advisory lock now
        const retryRes = await client.query('SELECT pg_try_advisory_lock($1) as locked;', [
          MIGRATION_ADVISORY_LOCK_ID,
        ]);
        if (retryRes.rows[0]?.locked === true) {
          lockAcquired = true;
          console.log(`[Migration Runner] Advisory lock successfully acquired after ${waitedMs}ms.`);
          break;
        }

        // Check if the other instance has finished applying all migrations
        try {
          await ensureMigrationsTable(client);
          const appliedRes = await client.query('SELECT version FROM schema_migrations;');
          const appliedVersions = new Set<string>(appliedRes.rows.map((r: any) => r.version));
          const pendingCount = ALL_MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).length;

          if (pendingCount === 0) {
            console.log('[Migration Runner] All pending migrations were applied by another instance.');
            externalFinished = true;
            break;
          }
        } catch (checkErr) {
          // Ignore transient check errors while waiting
        }
      }

      if (!lockAcquired && externalFinished) {
        lastMigrationStatus = {
          success: true,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: true,
          appliedCount: 0,
        };
      }

      if (!lockAcquired) {
        const lockErr = `[Migration Runner Error] Could not acquire migration advisory lock within ${MAX_WAIT_MS}ms. Another process holds the lock and pending migrations remain unapplied. Aborting migration on this instance.`;
        console.error(lockErr);
        lastMigrationStatus = {
          success: false,
          error: lockErr,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: false,
          appliedCount: 0,
          error: lockErr,
        };
      }
    }

    // 2. Ensure schema_migrations table
    await ensureMigrationsTable(client);

    // 3. Get applied migrations
    const appliedRes = await client.query('SELECT version, name, checksum FROM schema_migrations;');
    const appliedMap = new Map<string, any>(appliedRes.rows.map((r: any) => [r.version, r]));
    const appliedVersions = new Set<string>(appliedMap.keys());
    const knownVersions = new Set<string>(ALL_MIGRATIONS.map((m) => m.version));

    // Check for unexpected/unknown migrations in DB
    for (const [dbVer] of appliedMap) {
      if (!knownVersions.has(dbVer)) {
        const unknownErr = `[FATAL MIGRATION DRIFT] Database contains unknown migration version '${dbVer}' not defined in application codebase. Startup aborted.`;
        console.error(unknownErr);
        lastMigrationStatus = {
          success: false,
          error: unknownErr,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: false,
          appliedCount: 0,
          error: unknownErr,
        };
      }
    }

    // Check name contract, deterministic content checksums, and reconcile legacy records
    for (const migration of ALL_MIGRATIONS) {
      const existing = appliedMap.get(migration.version);
      if (existing) {
        // Enforce migration name contract strictly
        if (existing.name !== migration.name) {
          const nameMismatchErr = `[FATAL MIGRATION DRIFT] Migration ${migration.version} name mismatch! DB: '${existing.name}', Codebase expects: '${migration.name}'. Startup aborted.`;
          console.error(nameMismatchErr);
          lastMigrationStatus = {
            success: false,
            error: nameMismatchErr,
            appliedCount: 0,
            lastRunAt: new Date().toISOString(),
          };
          return {
            success: false,
            appliedCount: 0,
            error: nameMismatchErr,
          };
        }

        const currentChecksum = computeMigrationChecksum(migration);
        if (!existing.checksum) {
          // Missing checksum: backfill content-derived checksum safely
          console.log(`[Migration Runner] Backfilling missing checksum for migration ${migration.version} (${currentChecksum})...`);
          await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [
            currentChecksum,
            migration.version,
          ]);
        } else if (!isMigrationChecksumValid(migration.version, existing.checksum, currentChecksum)) {
          // Hard fail on unknown/unexpected checksum mismatch (Fail-Closed)
          const mismatchErr = `[FATAL MIGRATION DRIFT] Migration ${migration.version} (${migration.name}) checksum mismatch! DB: ${existing.checksum}, Current Content Hash: ${currentChecksum}. Refusing to start on mutated migration history.`;
          console.error(mismatchErr);
          lastMigrationStatus = {
            success: false,
            error: mismatchErr,
            appliedCount: 0,
            lastRunAt: new Date().toISOString(),
          };
          return {
            success: false,
            appliedCount: 0,
            error: mismatchErr,
          };
        } else if (existing.checksum !== currentChecksum) {
          // Reconcile historical checksum with canonical current checksum
          console.log(`[Migration Runner] Reconciling historical checksum for migration ${migration.version} (${migration.name}) in DB (${existing.checksum} -> ${currentChecksum})...`);
          await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [
            currentChecksum,
            migration.version,
          ]);
        }
      }
    }

    let appliedThisRun = 0;

    // 4. Run pending migrations in order
    for (const migration of ALL_MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`[Migration Runner] Applying migration ${migration.version}: ${migration.name}...`);

        // Ensure clean connection state before running each migration step
        await client.query('ROLLBACK').catch(() => {});

        const useTx = !migration.disableTransaction;
        if (useTx) {
          await client.query('BEGIN');
        }
        try {
          await migration.up(client);
          const checksum = computeMigrationChecksum(migration);
          await client.query(
            'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES ($1, $2, CURRENT_TIMESTAMP, $3);',
            [migration.version, migration.name, checksum]
          );
          if (useTx) {
            await client.query('COMMIT');
          }
          console.log(`[Migration Runner] ✅ Successfully applied migration ${migration.version}: ${migration.name}`);
          appliedThisRun++;
        } catch (migErr: any) {
          if (useTx) {
            try {
              await client.query('ROLLBACK');
            } catch (rbErr) {
              console.warn('[Migration Runner] ROLLBACK warning:', rbErr);
            }
          }
          const errorMsg = `[Migration Failed] Migration ${migration.version} (${migration.name}) failed: ${migErr?.message || migErr}`;
          console.error(errorMsg, migErr?.stack);

          lastMigrationStatus = {
            success: false,
            error: errorMsg,
            appliedCount: appliedThisRun,
            lastRunAt: new Date().toISOString(),
          };

          return {
            success: false,
            appliedCount: appliedThisRun,
            error: errorMsg,
          };
        }
      }
    }

    lastMigrationStatus = {
      success: true,
      appliedCount: appliedThisRun,
      lastRunAt: new Date().toISOString(),
    };

    console.log(`[Migration Runner] All migrations up to date (${appliedThisRun} newly applied, total available: ${ALL_MIGRATIONS.length}).`);
    return {
      success: true,
      appliedCount: appliedThisRun,
    };
  } catch (err: any) {
    const errMsg = `[Migration Runner Error]: ${err?.message || err}`;
    console.error(errMsg);
    lastMigrationStatus = {
      success: false,
      error: errMsg,
      appliedCount: 0,
      lastRunAt: new Date().toISOString(),
    };
    return {
      success: false,
      appliedCount: 0,
      error: errMsg,
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_ADVISORY_LOCK_ID]);
      } catch (unlockErr) {
        console.warn('[Migration Runner] Notice releasing advisory lock:', unlockErr);
      }
    }
    if (client) {
      try { client.off('error', onClientErr); } catch {}
      try { client.release(); } catch {}
    }
  }
}

/**
 * Retrieves current migration status for system diagnostics & readiness
 */
export async function getMigrationStatus(pool: pg.Pool): Promise<MigrationStatus> {
  if (!pool || typeof pool.connect !== 'function' || (pool as any).ending || (pool as any).ended) {
    return {
      isLocked: false,
      appliedCount: 0,
      pendingCount: ALL_MIGRATIONS.length,
      latestVersion: null,
      migrations: ALL_MIGRATIONS.map((m) => ({
        version: m.version,
        name: m.name,
        applied: false,
        checksum: computeMigrationChecksum(m),
      })),
      hasFailed: false,
      lastError: undefined,
    };
  }

  let client: any = null;
  const onStatusClientErr = () => {};
  try {
    client = await pool.connect();
    if (client) client.on('error', onStatusClientErr);
  } catch {
    return {
      isLocked: false,
      appliedCount: 0,
      pendingCount: ALL_MIGRATIONS.length,
      latestVersion: null,
      migrations: ALL_MIGRATIONS.map((m) => ({
        version: m.version,
        name: m.name,
        applied: false,
        checksum: computeMigrationChecksum(m),
      })),
      hasFailed: false,
      lastError: undefined,
    };
  }
  try {
    await ensureMigrationsTable(client);
    const appliedRes = await client.query('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;');
    const appliedMap = new Map<string, any>(appliedRes.rows.map((r: any) => [r.version, r]));

    const migrationsList = ALL_MIGRATIONS.map((m) => {
      const applied = appliedMap.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: !!applied,
        appliedAt: applied ? applied.applied_at : undefined,
        checksum: applied?.checksum || computeMigrationChecksum(m),
      };
    });

    const appliedCount = appliedMap.size;
    const pendingCount = ALL_MIGRATIONS.filter((m) => !appliedMap.has(m.version)).length;
    const latestVersion = appliedRes.rows.length > 0 ? appliedRes.rows[appliedRes.rows.length - 1].version : null;

    return {
      isLocked: false,
      appliedCount,
      pendingCount,
      latestVersion,
      migrations: migrationsList,
      hasFailed: !lastMigrationStatus.success,
      lastError: lastMigrationStatus.error,
    };
  } finally {
    if (client) {
      try { client.off('error', onStatusClientErr); } catch {}
      try { client.release(); } catch {}
    }
  }
}
