// Helper utilities for SemVer version parsing, comparison and validation

import semver from 'semver';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  raw: string;
}

export function parseSemver(v: string): SemVer | null {
  if (!v || typeof v !== 'string') return null;
  const cleaned = semver.clean(v.trim(), { loose: true }) || semver.valid(v.trim(), { loose: true });
  if (!cleaned) return null;
  const parsed = semver.parse(cleaned);
  if (!parsed) return null;

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.join('.'),
    raw: v,
  };
}

export function isValidSemver(v: string): boolean {
  if (!v || typeof v !== 'string') return false;
  return semver.valid(v.trim(), { loose: true }) !== null;
}

export function compareSemver(v1: string, v2: string): number {
  const c1 = semver.clean(v1.trim(), { loose: true }) || semver.valid(v1.trim(), { loose: true });
  const c2 = semver.clean(v2.trim(), { loose: true }) || semver.valid(v2.trim(), { loose: true });

  if (!c1 && !c2) return 0;
  if (!c1) return -1;
  if (!c2) return 1;

  return semver.compare(c1, c2);
}

export function isTargetVersionNewer(targetVersion: string, currentVersion: string): boolean {
  const cTarget = semver.clean(targetVersion.trim(), { loose: true }) || semver.valid(targetVersion.trim(), { loose: true });
  const cCurrent = semver.clean(currentVersion.trim(), { loose: true }) || semver.valid(currentVersion.trim(), { loose: true });

  if (!cTarget) return false;
  if (!cCurrent) return true; // If current is unparseable, target is newer

  return semver.gt(cTarget, cCurrent);
}

export function normalizeHardwareModel(model?: string): string {
  if (!model || typeof model !== 'string') return 'UNKNOWN';
  const clean = model.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return clean || 'UNKNOWN';
}

export function isHardwareModelCompatible(deviceModel?: string, firmwareModel?: string): boolean {
  if (!firmwareModel || firmwareModel.toUpperCase() === 'ALL') return true;
  if (!deviceModel) return false;
  return normalizeHardwareModel(deviceModel) === normalizeHardwareModel(firmwareModel);
}

export function isHardwareRevisionCompatible(deviceRevision?: string, minRequiredRevision?: string): boolean {
  if (!minRequiredRevision) return true;
  if (!deviceRevision) return false;

  const devRevClean = deviceRevision.trim().replace(/^[vV]/, '');
  const reqRevClean = minRequiredRevision.trim().replace(/^[vV]/, '');

  const devSem = parseSemver(devRevClean);
  const reqSem = parseSemver(reqRevClean);

  if (devSem && reqSem) {
    return compareSemver(devRevClean, reqRevClean) >= 0;
  }

  const devNum = parseFloat(devRevClean);
  const reqNum = parseFloat(reqRevClean);
  if (!isNaN(devNum) && !isNaN(reqNum)) {
    return devNum >= reqNum;
  }

  return devRevClean.localeCompare(reqRevClean, undefined, { numeric: true }) >= 0;
}

