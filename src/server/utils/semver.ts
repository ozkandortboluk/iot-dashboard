// Helper utilities for SemVer version parsing, comparison and validation

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  raw: string;
}

export function parseSemver(v: string): SemVer | null {
  if (!v || typeof v !== 'string') return null;
  const raw = v.trim();
  const clean = raw.replace(/^[vV]/, '');
  const match = clean.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || '',
    raw,
  };
}

export function isValidSemver(v: string): boolean {
  return parseSemver(v) !== null;
}

export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1 && !p2) return 0;
  if (!p1) return -1;
  if (!p2) return 1;

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // Release without prerelease is newer than a prerelease version (e.g. 1.0.0 > 1.0.0-beta)
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease !== p2.prerelease) return p1.prerelease.localeCompare(p2.prerelease);

  return 0;
}

export function isTargetVersionNewer(targetVersion: string, currentVersion: string): boolean {
  return compareSemver(targetVersion, currentVersion) > 0;
}
