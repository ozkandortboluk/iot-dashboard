import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import crypto from 'node:crypto';
import esbuild from 'esbuild';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import {
  ALL_MIGRATIONS,
  CANONICAL_MIGRATION_MANIFEST,
  computeMigrationChecksum,
  validateManifestProvenance,
  normalizeMigrationSource,
} from '../src/server/database/migrations/migrationRunner.js';

async function verifyProvenance() {
  console.log('📜 [P0 Provenance Gate] Starting Historical Provenance & Manifest Verification...');

  // 1. Basic manifest schema and structure check
  const result = validateManifestProvenance();

  if (!result.valid) {
    console.error('❌ [PROVENANCE FATAL] Manifest structure validation failed:');
    result.errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  let verifiedCount = 0;
  let observedCount = 0;
  let gitVerifiedCount = 0;

  const hasGit = fs.existsSync('.git');
  console.log(`ℹ️ [PROVENANCE] Git Repository detected on disk: ${hasGit ? 'YES' : 'NO'}`);

  // Find file path of a migration version in migrations folder
  function getMigrationFilePath(version: string): string | null {
    const migrationsDir = 'src/server/database/migrations';
    if (!fs.existsSync(migrationsDir)) return null;
    const files = fs.readdirSync(migrationsDir);
    const matched = files.find((f) => f.startsWith(`${version}_`) && f.endsWith('.ts'));
    return matched ? path.join(migrationsDir, matched) : null;
  }

  for (const m of ALL_MIGRATIONS) {
    const entry = CANONICAL_MIGRATION_MANIFEST[m.version];
    const currentHash = computeMigrationChecksum(m);

    // Verify current source matches the expected canonicalSourceHash
    if (entry.canonicalSourceHash !== currentHash) {
      console.error(
        `❌ [PROVENANCE FATAL] Migration ${m.version} canonicalSourceHash '${entry.canonicalSourceHash}' does not match current computed source hash '${currentHash}'`
      );
      process.exit(1);
    }

    const filePath = getMigrationFilePath(m.version);
    if (!filePath) {
      console.error(`❌ [PROVENANCE FATAL] Migration file not found for version ${m.version}`);
      process.exit(1);
    }

    for (const h of entry.historicalChecksums) {
      if (h.provenanceStatus === 'verified') {
        verifiedCount++;

        // If Git is available, run real Git blob extraction and artifact hash verification
        if (hasGit) {
          try {
            // Verify if commit SHA or tag exists in local repository history
            child_process.execSync(`git rev-parse --verify ${h.verifiedGitCommitOrTag}`, { stdio: 'ignore' });

            // Git revision paths must use forward slashes on Windows as well as POSIX.
            const gitFilePath = filePath.replace(/\\/g, '/');
            const gitShowCmd = `git show ${h.verifiedGitCommitOrTag}:${gitFilePath}`;
            const fileContentAtRevision = child_process.execSync(gitShowCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();

            if (!fileContentAtRevision || !fileContentAtRevision.trim()) {
              throw new Error('Retrieved empty historical file content from Git.');
            }

            // Transpile the retrieved TypeScript file to JS format using esbuild
            const tmpTsFile = path.join(os.tmpdir(), `temp_migration_${m.version}_${Date.now()}.ts`);
            fs.writeFileSync(tmpTsFile, fileContentAtRevision);

            const transpiled = esbuild.buildSync({
              entryPoints: [tmpTsFile],
              bundle: true,
              write: false,
              format: 'cjs',
              platform: 'node',
            });
            fs.unlinkSync(tmpTsFile);

            const tempJsFile = path.join(os.tmpdir(), `temp_migration_${m.version}_${Date.now()}.js`);
            fs.writeFileSync(tempJsFile, transpiled.outputFiles[0].text);

            // Import the transpiled module
            const imported = require(tempJsFile);
            fs.unlinkSync(tempJsFile);

            const migrationKey = `migration${m.version}`;
            const historicalMigration = imported[migrationKey];
            if (!historicalMigration) {
              throw new Error(`Export '${migrationKey}' was not found in the historical file.`);
            }

            // Compute and compare the source artifact hash using the canonical normalize algorithm
            const normalizedBody = normalizeMigrationSource(historicalMigration.up);
            const payload = `${m.version}:${entry.name}:${normalizedBody}`;
            const computedSourceArtifactHash = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);

            if (computedSourceArtifactHash !== h.sourceArtifactHash) {
              console.error(
                `❌ [PROVENANCE FATAL] Migration ${m.version} verified commit ${h.verifiedGitCommitOrTag} produced sourceArtifactHash '${computedSourceArtifactHash}' but manifest expects '${h.sourceArtifactHash}'`
              );
              process.exit(1);
            }

            gitVerifiedCount++;
          } catch (gitErr: any) {
            console.error(
              `❌ [PROVENANCE FATAL] Real Git verification failed for migration ${m.version} at commit ${h.verifiedGitCommitOrTag}: ${gitErr.message || gitErr}`
            );
            process.exit(1);
          }
        }
      } else if (h.provenanceStatus === 'observed') {
        observedCount++;
      }
    }
  }

  if (hasGit) {
    console.log(
      `✅ [PROVENANCE SUCCESS] Real Git objects verified across all ${gitVerifiedCount} records.`
    );
  } else {
    console.log(
      `⚠️ [PROVENANCE WARNING] Skipped real Git objects verification (No local .git repository on disk). Format validation passed.`
    );
  }

  console.log(
    `✅ [PROVENANCE SUCCESS] Manifest verified across all ${ALL_MIGRATIONS.length} migrations (${verifiedCount} verified baseline records, ${observedCount} field-observed DB records).`
  );
  process.exit(0);
}

verifyProvenance();
