import { ALL_MIGRATIONS, computeMigrationChecksum, CANONICAL_MIGRATION_MANIFEST } from '../src/server/database/migrations/migrationRunner.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function verifyBundleParity() {
  console.log('📦 [P0 Parity Gate] Starting TSX ↔ Production Bundle Parity Gate...');

  const distDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const tmpBundlePath = path.resolve(distDir, 'test-mig-parity.cjs');

  try {
    // 1. Bundle migrationRunner using esbuild exactly as production build does
    console.log('⚡ Bundling migrationRunner with esbuild...');
    execSync(
      `npx esbuild src/server/database/migrations/migrationRunner.ts --bundle --platform=node --format=cjs --packages=external --outfile="${tmpBundlePath}"`,
      { stdio: 'pipe' }
    );

    // 2. Load bundled module
    const bundled = require(tmpBundlePath);

    if (!bundled.ALL_MIGRATIONS || !Array.isArray(bundled.ALL_MIGRATIONS)) {
      console.error('❌ [PARITY FATAL] Bundled module did not export ALL_MIGRATIONS array.');
      process.exit(1);
    }

    if (bundled.ALL_MIGRATIONS.length !== ALL_MIGRATIONS.length) {
      console.error(
        `❌ [PARITY FATAL] Migration count mismatch! TSX has ${ALL_MIGRATIONS.length}, Bundled has ${bundled.ALL_MIGRATIONS.length}`
      );
      process.exit(1);
    }

    let parityFailed = false;

    // 3. Compare each migration version, name, and computed checksum
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      const tsxMig = ALL_MIGRATIONS[i];
      const bundledMig = bundled.ALL_MIGRATIONS[i];

      if (tsxMig.version !== bundledMig.version) {
        console.error(
          `❌ [PARITY MISMATCH] Version mismatch at index ${i}: TSX=${tsxMig.version}, Bundled=${bundledMig.version}`
        );
        parityFailed = true;
      }

      if (tsxMig.name !== bundledMig.name) {
        console.error(
          `❌ [PARITY MISMATCH] Name mismatch at index ${i} (${tsxMig.version}): TSX='${tsxMig.name}', Bundled='${bundledMig.name}'`
        );
        parityFailed = true;
      }

      const tsxChecksum = computeMigrationChecksum(tsxMig);
      const bundledChecksum = bundled.computeMigrationChecksum(bundledMig);

      if (tsxChecksum !== bundledChecksum) {
        console.error(
          `❌ [PARITY MISMATCH] Migration ${tsxMig.version} (${tsxMig.name}) checksum mismatch! TSX=${tsxChecksum}, Bundled=${bundledChecksum}`
        );
        parityFailed = true;
      }

      const manifestEntry = CANONICAL_MIGRATION_MANIFEST[tsxMig.version];
      if (!manifestEntry || manifestEntry.canonicalSourceHash !== tsxChecksum) {
        console.error(
          `❌ [MANIFEST MISMATCH] Migration ${tsxMig.version} TSX checksum ${tsxChecksum} does not match canonical manifest hash ${manifestEntry?.canonicalSourceHash}`
        );
        parityFailed = true;
      }
    }

    if (parityFailed) {
      console.error('💥 [P0 Parity Gate FATAL] Parity check failed with mismatches! Exiting with non-zero status.');
      process.exit(1);
    } else {
      console.log(
        `🎉 [P0 Parity Gate SUCCESS] 100% Parity verified across all ${ALL_MIGRATIONS.length} migrations between TSX and Production Bundle.`
      );
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ [PARITY FATAL] Unexpected error during bundle parity verification:', err);
    process.exit(1);
  } finally {
    if (fs.existsSync(tmpBundlePath)) {
      try {
        fs.unlinkSync(tmpBundlePath);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

verifyBundleParity();
