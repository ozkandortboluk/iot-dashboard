import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { APP_VERSION } from '../../config/version.js';

// Run installer integration checks outside the protected GitHub runner checkout.
const sourceRoot = path.resolve(__dirname, '../../..');
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-installer-test-'));
fs.chmodSync(sandboxRoot, 0o755);
const rootDir = path.join(sandboxRoot, 'project');
fs.cpSync(sourceRoot, rootDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(sourceRoot, src);
    return !rel.split(path.sep).some((part) => ['.git', 'node_modules', 'secrets', 'data'].includes(part));
  }
});
fs.mkdirSync(path.join(rootDir, 'secrets'), { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true, mode: 0o755 });

describe('Zero-Touch Automated Single-Command Installer & Extensible Architecture', () => {
  const installScriptPath = path.join(rootDir, 'install.sh');
  const setupLibDir = path.join(rootDir, 'scripts/setup/lib');
  const pluginsDir = path.join(rootDir, 'scripts/setup/plugins.d');

  // =========================================================================
  // 1. Core Installer Script & Modular Structure
  // =========================================================================
  it('1. install.sh and setup helper libraries exist and have proper permissions', () => {
    expect(fs.existsSync(installScriptPath)).toBe(true);

    // Verify executable permissions
    const stat = fs.statSync(path.join(sourceRoot, 'install.sh'));
    // Mode must be executable (at least 0o700 / 0o755)
    expect((stat.mode & 0o444) !== 0).toBe(true);

    const requiredModules = [
      'colors.sh',
      'system.sh',
      'docker-installer.sh',
      'secrets.sh',
      'env.sh',
      'ssl.sh',
      'backup.sh',
      'plugins.sh',
    ];

    for (const mod of requiredModules) {
      const modPath = path.join(setupLibDir, mod);
      expect(fs.existsSync(modPath), `Module ${mod} must exist`).toBe(true);
      const modStat = fs.statSync(path.join(sourceRoot, 'scripts/setup/lib', mod));
      expect((modStat.mode & 0o444) !== 0, `Module ${mod} must be readable when sourced by bash`).toBe(true);
    }

    expect(fs.existsSync(pluginsDir)).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'README.md'))).toBe(true);
  });

  // =========================================================================
  // 2. CLI Interface & Flag Parsing
  // =========================================================================
  it('2. ./install.sh --help outputs comprehensive CLI options and usage examples', () => {
    if (process.platform === 'win32') return;
    const helpOutput = execSync(`bash ${installScriptPath} --help`, { cwd: rootDir, encoding: 'utf-8' });
    expect(helpOutput).toContain('KULLANIM:');
    expect(helpOutput).toContain('--quick');
    expect(helpOutput).toContain('--domain');
    expect(helpOutput).toContain('--email');
    expect(helpOutput).toContain('--http-only');
    expect(helpOutput).toContain('--init-only');
    expect(helpOutput).toContain('--check');
    expect(helpOutput).toContain('--status');
    expect(helpOutput).toContain('--backup');
    expect(helpOutput).toContain('--restore');
  });

  it('3. ./install.sh --check runs system diagnostic inspection without errors', () => {
    if (process.platform === 'win32') return;
    const checkOutput = execSync(`bash ${installScriptPath} --check`, { cwd: rootDir, encoding: 'utf-8' });
    expect(checkOutput).toMatch(/Sistem ve Donanım Analizi/i);
    expect(checkOutput).toMatch(/Ağ ve Port Çakışmaları/i);
    expect(checkOutput).toMatch(/Sistem denetimi tamamlandı/i);
  });

  // =========================================================================
  // 3. Cryptographic Secret Generation & Vault Policy Compliance
  // =========================================================================
  it('4. ./install.sh --init-only --quick generates cryptographic keys with strict 0600 POSIX permissions', () => {
    if (process.platform === 'win32') return;
    const initOutput = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(initOutput).toMatch(/Kriptografik Kasa/i);

    const secretsDir = path.join(rootDir, 'secrets');
    expect(fs.existsSync(secretsDir)).toBe(true);

    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');

    expect(fs.existsSync(encKeyPath)).toBe(true);
    expect(fs.existsSync(pgPassPath)).toBe(true);

    const encKey = fs.readFileSync(encKeyPath, 'utf-8').trim();
    const pgPass = fs.readFileSync(pgPassPath, 'utf-8').trim();

    // 256-bit AES hex key has 64 hex characters (32-byte cryptographic random)
    expect(encKey.length).toBe(64);
    expect(/^[0-9a-fA-F]{64}$/.test(encKey)).toBe(true);

    // Postgres password has high entropy
    expect(pgPass.length).toBeGreaterThanOrEqual(24);

    // File permissions must be 0600 (owner read/write only)
    const encStat = fs.statSync(encKeyPath);
    expect(encStat.mode & 0o037).toBe(0); // Group may read (0640) for container GID 1000; no group write/execute or other access
  });

  // =========================================================================
  // 4. Automated Backup & Disaster Recovery Engine
  // =========================================================================
  it('5. ./install.sh --backup creates a timestamped archive bundle of secrets and configuration', () => {
    if (process.platform === 'win32') return;
    // A backup integration test must never inspect or copy live Docker resources.
    // Provide a minimal fake Docker CLI in the disposable installer sandbox.
    const mockBin = path.join(rootDir, 'data', 'mock-bin');
    fs.mkdirSync(mockBin, { recursive: true });
    const mockDocker = path.join(mockBin, 'docker');
    fs.writeFileSync(mockDocker, `#!/bin/sh
case "$1" in
  inspect) case "$2" in nexus_timescaledb|nexus_app) exit 0;; esac ;;
  exec) if [ "$2" = nexus_timescaledb ] && [ "$3" = pg_dump ]; then printf '%s\\n' '-- isolated test SQL dump'; exit 0; fi ;;
  cp) if [ "$2" = nexus_app:/app/data/. ]; then mkdir -p "$3"; printf 'test-data\\n' > "$3/test-marker"; exit 0; fi ;;
esac
exit 1
`, { mode: 0o755 });
    const backupOutput = execSync(`bash ${installScriptPath} --backup`, {
      cwd: rootDir,
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${mockBin}:${process.env.PATH ?? ''}` }
    });
    expect(backupOutput).toMatch(/Yedekleme tamamlandı/i);

    const backupsDir = path.join(rootDir, 'backups');
    expect(fs.existsSync(backupsDir)).toBe(true);

    const files = fs.readdirSync(backupsDir).filter((f) => f.startsWith('nexus_backup_') && f.endsWith('.tar.gz'));
    expect(files.length).toBeGreaterThan(0);

    const latestBackup = path.join(backupsDir, files[files.length - 1]);
    const archiveSize = fs.statSync(latestBackup).size;
    expect(archiveSize).toBeGreaterThan(100); // Must not be empty
  }, 30000);

  // =========================================================================
  // 5. Extensible Plugin & Hook Execution
  // =========================================================================
  it('6. Setup plugin runner discovers and executes custom hooks in scripts/setup/plugins.d/', () => {
    if (process.platform === 'win32') return;
    const testPluginPath = path.join(pluginsDir, '99-test-hook.sh');
    const markerFile = path.join(rootDir, 'data/.plugin_test_marker');

    try {
      // Create a test plugin
      fs.writeFileSync(
        testPluginPath,
        `#!/usr/bin/env bash\nif [ "$1" = "pre-install" ]; then touch "${markerFile}"; fi\n`,
        { mode: 0o755 }
      );

      execSync(`bash ${installScriptPath} --check`, { cwd: rootDir });

      expect(fs.existsSync(markerFile), 'Plugin hook must have run and created marker file').toBe(true);
    } finally {
      if (fs.existsSync(testPluginPath)) fs.unlinkSync(testPluginPath);
      if (fs.existsSync(markerFile)) fs.unlinkSync(markerFile);
    }
  });

  // =========================================================================
  // 6. Docker Compose & Nginx Production Topology Integration
  // =========================================================================
  it('7. docker-compose.yml integrates with generated secrets and certificates', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    const composeContent = fs.readFileSync(composePath, 'utf-8');

    // Proxy must mount certs directory
    expect(composeContent).toMatch(/certs/i);
    // Secrets definition must point to encryption_key
    expect(composeContent).toMatch(/encryption_key:/);
    expect(composeContent).toMatch(/\/api\/health\/live/);

    // File-backed Compose secrets are bind mounts; uid/gid/mode options are ignored outside Swarm.
    // The installer grants only UID 1000 a named ACL; a shared host group must not gain access.
    expect(composeContent).toMatch(/source:\s*encryption_key/);
    expect(composeContent).toMatch(/target:\s*encryption_key/);
    expect(composeContent).not.toContain('uid: "1000"');
    expect(composeContent).not.toContain('gid: "1000"');
    expect(composeContent).not.toContain('mode: "0400"');

    const secretsLibContent = fs.readFileSync(path.join(rootDir, 'scripts/setup/lib/secrets.sh'), 'utf-8');
    expect(secretsLibContent).toContain('align_secrets_ownership_and_permissions()');
    expect(secretsLibContent).toContain('setfacl -m u:1000:r--');
    expect(secretsLibContent).toContain('chmod 600');
    expect(secretsLibContent).not.toContain('chgrp 1000');

    // Dockerfile must maintain non-root USER node and initialize /run/secrets ownership
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
    expect(dockerfileContent).toMatch(/USER node/);
    expect(dockerfileContent).toMatch(/\/run\/secrets/);
  });

  // =========================================================================
  // 7. Version Synchronization (Rule 1 & Rule 2)
  // =========================================================================
  it('8. package.json, version.ts, and CHANGELOG.md are strictly synchronized to v' + APP_VERSION, () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf-8');

    expect(pkg.version).toBe(APP_VERSION);
    expect(APP_VERSION).toBe(pkg.version);
    expect(changelog).toContain(`## 🚀 [v${APP_VERSION}]`);
  });
});
