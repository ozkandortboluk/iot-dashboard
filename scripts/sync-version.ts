import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any;
}

interface PackageLockJson {
  name: string;
  version: string;
  lockfileVersion?: number;
  packages?: {
    ''?: {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

function detectLineEnding(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

export function syncProjectVersions(options?: {
  bump?: 'patch' | 'minor' | 'major';
  setVersion?: string;
  checkOnly?: boolean;
}): { success: boolean; version: string; changed: boolean } {
  const rootDir = process.cwd();
  const pkgPath = path.resolve(rootDir, 'package.json');
  const lockPath = path.resolve(rootDir, 'package-lock.json');
  const versionTsPath = path.resolve(rootDir, 'src/config/version.ts');
  const changelogPath = path.resolve(rootDir, 'CHANGELOG.md');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`[VersionSync] package.json bulunamadı: ${pkgPath}`);
  }

  const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
  const pkgEnding = detectLineEnding(pkgRaw);
  const pkg: PackageJson = JSON.parse(pkgRaw);

  let lock: PackageLockJson | null = null;
  let lockRaw = '';
  let lockEnding = '\n';
  if (fs.existsSync(lockPath)) {
    lockRaw = fs.readFileSync(lockPath, 'utf8');
    lockEnding = detectLineEnding(lockRaw);
    lock = JSON.parse(lockRaw);
  }

  let versionTsRaw = '';
  let versionTsEnding = '\n';
  let tsVersion: string | null = null;
  if (fs.existsSync(versionTsPath)) {
    versionTsRaw = fs.readFileSync(versionTsPath, 'utf8');
    versionTsEnding = detectLineEnding(versionTsRaw);
    const tsMatch = versionTsRaw.match(/export const APP_VERSION = ["']([^"']+)["']/);
    if (tsMatch && tsMatch[1]) {
      tsVersion = tsMatch[1];
    }
  }

  // Determine Target Version
  let targetVersion = pkg.version;

  if (options?.setVersion) {
    if (!semver.valid(options.setVersion)) {
      throw new Error(`[VersionSync] Geçersiz sürüm formatı: ${options.setVersion}`);
    }
    targetVersion = options.setVersion;
  } else if (options?.bump) {
    const base = semver.valid(pkg.version) || '1.0.0';
    const bumped = semver.inc(base, options.bump);
    if (!bumped) {
      throw new Error(`[VersionSync] Sürüm artırılamadı: ${base} (${options.bump})`);
    }
    targetVersion = bumped;
  } else {
    // Synchronize to the highest valid semver among package.json, package-lock.json, and version.ts
    const candidateVersions = [pkg.version];
    if (lock?.version) candidateVersions.push(lock.version);
    if (lock?.packages?.['']?.version) candidateVersions.push(lock.packages[''].version);
    if (tsVersion) candidateVersions.push(tsVersion);

    for (const v of candidateVersions) {
      if (semver.valid(v) && semver.gt(v, targetVersion)) {
        targetVersion = v;
      }
    }
  }

  const targetReleaseTag = `v${targetVersion}`;
  const todayDate = new Date().toISOString().split('T')[0];

  let hasChanges = false;
  const changesLog: string[] = [];

  // Check & Update package.json
  if (pkg.version !== targetVersion) {
    changesLog.push(`package.json: ${pkg.version} -> ${targetVersion}`);
    pkg.version = targetVersion;
    hasChanges = true;
  }

  // Check & Update package-lock.json
  if (lock) {
    if (lock.version !== targetVersion) {
      changesLog.push(`package-lock.json (root): ${lock.version} -> ${targetVersion}`);
      lock.version = targetVersion;
      hasChanges = true;
    }

    if (!lock.packages) {
      lock.packages = {};
    }
    if (!lock.packages['']) {
      lock.packages[''] = { name: pkg.name, version: targetVersion };
      changesLog.push(`package-lock.json (packages[""]): initialized to ${targetVersion}`);
      hasChanges = true;
    } else if (lock.packages[''].version !== targetVersion) {
      changesLog.push(`package-lock.json (packages[""]): ${lock.packages[''].version} -> ${targetVersion}`);
      lock.packages[''].version = targetVersion;
      hasChanges = true;
    }

    // Keep dependencies in packages[""] in sync with package.json
    if (pkg.dependencies) {
      const lockDeps = lock.packages[''].dependencies || {};
      let depsChanged = false;
      for (const [dep, ver] of Object.entries(pkg.dependencies)) {
        if (lockDeps[dep] !== ver) {
          lockDeps[dep] = ver;
          depsChanged = true;
        }
      }
      if (depsChanged) {
        lock.packages[''].dependencies = lockDeps;
        changesLog.push(`package-lock.json (packages[""].dependencies): synced with package.json`);
        hasChanges = true;
      }
    }
  }

  // Check & Update src/config/version.ts
  let updatedVersionTs = versionTsRaw;
  if (versionTsRaw) {
    const newVersionTs = versionTsRaw
      .replace(/export const APP_VERSION = ["'][^"']+["'];/, `export const APP_VERSION = "${targetVersion}";`)
      .replace(/export const APP_RELEASE_TAG = ["'][^"']+["'];/, `export const APP_RELEASE_TAG = "${targetReleaseTag}";`)
      .replace(/export const RELEASE_DATE = ["'][^"']+["'];/, `export const RELEASE_DATE = "${todayDate}";`);

    if (newVersionTs !== versionTsRaw) {
      changesLog.push(`src/config/version.ts: APP_VERSION -> "${targetVersion}", APP_RELEASE_TAG -> "${targetReleaseTag}"`);
      updatedVersionTs = newVersionTs;
      hasChanges = true;
    }
  }

  // Check & Update CHANGELOG.md (when bumping)
  let updatedChangelog = '';
  if (options?.bump && fs.existsSync(changelogPath)) {
    const clContent = fs.readFileSync(changelogPath, 'utf8');
    const clHeader = `## 🚀 [${targetReleaseTag}]`;
    if (!clContent.includes(clHeader)) {
      const lines = clContent.split(/\r?\n/);
      const insertIdx = lines.findIndex((l) => l.startsWith('## 🚀 [v'));
      if (insertIdx !== -1) {
        const newBlock = [
          `## 🚀 [${targetReleaseTag}] - ${todayDate}`,
          '',
          `### 🔄 Sürüm Senkronizasyonu & Güncelleme`,
          `- Sürüm numarası [package.json], [package-lock.json] ve [src/config/version.ts] ile tam senkron yükseltildi.`,
          '',
          '---',
        ];
        lines.splice(insertIdx, 0, ...newBlock);
        updatedChangelog = lines.join(detectLineEnding(clContent));
        changesLog.push(`CHANGELOG.md: [${targetReleaseTag}] başlığı eklendi`);
        hasChanges = true;
      }
    }
  }

  if (options?.checkOnly) {
    if (hasChanges) {
      console.error(`❌ [VersionSync] Sürüm uyumsuzluğu tespit edildi:`);
      changesLog.forEach((c) => console.error(`   - ${c}`));
      return { success: false, version: targetVersion, changed: true };
    }
    console.log(`✅ [VersionSync] Tüm dosyalar senkronize: v${targetVersion}`);
    return { success: true, version: targetVersion, changed: false };
  }

  // Save changes
  if (hasChanges) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + pkgEnding, 'utf8');
    if (lock) {
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + lockEnding, 'utf8');
    }
    if (updatedVersionTs) {
      fs.writeFileSync(versionTsPath, updatedVersionTs, 'utf8');
    }
    if (updatedChangelog) {
      fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');
    }

    console.log(`✨ [VersionSync] Başarıyla senkronize edildi (v${targetVersion}):`);
    changesLog.forEach((c) => console.log(`   + ${c}`));
  } else {
    console.log(`✅ [VersionSync] package.json ve package-lock.json tam senkron (v${targetVersion}). Değişiklik gerekmedi.`);
  }

  return { success: true, version: targetVersion, changed: hasChanges };
}

// CLI Execution Support
if (process.argv[1] && (process.argv[1].endsWith('sync-version.ts') || process.argv[1].endsWith('sync-version.js'))) {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isPatch = args.includes('--patch') || args.includes('--bump');
  const isMinor = args.includes('--minor');
  const isMajor = args.includes('--major');
  const setArg = args.find((a) => a.startsWith('--set='));
  const setVersion = setArg ? setArg.split('=')[1] : undefined;

  let bump: 'patch' | 'minor' | 'major' | undefined;
  if (isPatch) bump = 'patch';
  if (isMinor) bump = 'minor';
  if (isMajor) bump = 'major';

  try {
    const result = syncProjectVersions({ bump, setVersion, checkOnly: isCheck });
    if (isCheck && !result.success) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error(`❌ [VersionSync Hatası]:`, err.message || err);
    process.exit(1);
  }
}
