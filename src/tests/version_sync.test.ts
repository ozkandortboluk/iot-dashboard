import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION, APP_RELEASE_TAG } from '../config/version.js';

describe('P1 - 2.1: Version and Lockfile Synchronization Gate', () => {
  it('should have matching version in package.json and src/config/version.ts', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.version).toBe(APP_VERSION);
    expect(`v${pkg.version}`).toBe(APP_RELEASE_TAG);
  });

  it('should have matching version in package-lock.json', () => {
    const lockPath = path.join(process.cwd(), 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      expect(lock.version).toBe(APP_VERSION);
      if (lock.packages && lock.packages['']) {
        expect(lock.packages[''].version).toBe(APP_VERSION);
      }
    }
  });

  it('should mention current version in CHANGELOG.md', () => {
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf8');

    expect(content).toContain(`[v${APP_VERSION}]`);
  });

  it('should follow SemVer format strictly (MAJOR.MINOR.PATCH)', () => {
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
    expect(semverRegex.test(APP_VERSION)).toBe(true);
  });
});
