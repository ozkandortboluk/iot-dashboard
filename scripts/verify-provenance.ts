import {
  ALL_MIGRATIONS,
  CANONICAL_MIGRATION_MANIFEST,
  computeMigrationChecksum,
  validateManifestProvenance,
} from '../src/server/database/migrations/migrationRunner.js';

async function verifyProvenance() {
  console.log('📜 [P0 Provenance Gate] Starting Historical Provenance & Manifest Verification...');

  const result = validateManifestProvenance();

  if (!result.valid) {
    console.error('❌ [PROVENANCE FATAL] Provenance verification failed with the following errors:');
    result.errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  let verifiedCount = 0;
  let observedCount = 0;

  for (const m of ALL_MIGRATIONS) {
    const entry = CANONICAL_MIGRATION_MANIFEST[m.version];
    const currentHash = computeMigrationChecksum(m);

    if (entry.canonicalSourceHash !== currentHash) {
      console.error(
        `❌ [PROVENANCE FATAL] Migration ${m.version} canonicalSourceHash '${entry.canonicalSourceHash}' does not match current source hash '${currentHash}'`
      );
      process.exit(1);
    }

    for (const h of entry.historicalChecksums) {
      if (h.provenanceStatus === 'verified') verifiedCount++;
      if (h.provenanceStatus === 'observed') observedCount++;
    }
  }

  console.log(
    `✅ [PROVENANCE SUCCESS] Manifest verified across all ${ALL_MIGRATIONS.length} migrations (${verifiedCount} verified baseline records, ${observedCount} field-observed DB records).`
  );
  process.exit(0);
}

verifyProvenance();
