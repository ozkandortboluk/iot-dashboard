import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export interface BackupArtifactOptions {
  allowedRoot: string;
  artifactPath: string;
  checksumPath: string;
  maxAgeHours: number;
  maxArtifactBytes: number;
}

const forbiddenArtifactName = /secret|password|credential|vault|encryption[_-]?key|system_secrets|\.env/i;

export class BackupArtifactChecker implements ReadOnlyChecker {
  readonly id = 'backup_artifact';
  constructor(private readonly options: BackupArtifactOptions) {}

  async run({ signal, now }: CheckContext) {
    const root = await realpath(this.options.allowedRoot);
    const artifact = await realpath(this.options.artifactPath);
    const checksum = await realpath(this.options.checksumPath);
    const insideRoot = (candidate: string) => {
      const relative = path.relative(root, candidate);
      return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    };
    if (!insideRoot(artifact) || !insideRoot(checksum)) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_path_outside_allowlist' };
    }
    if (forbiddenArtifactName.test(path.basename(artifact))) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_artifact_name_not_allowed' };
    }

    const artifactStat = await lstat(artifact);
    const checksumStat = await lstat(checksum);
    if (artifactStat.isSymbolicLink() || checksumStat.isSymbolicLink() || !artifactStat.isFile() || !checksumStat.isFile()) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_file_type_not_allowed' };
    }
    if (artifactStat.size <= 0 || artifactStat.size > this.options.maxArtifactBytes || checksumStat.size > 512) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_artifact_size_not_allowed' };
    }
    const ageHours = (now().getTime() - artifactStat.mtimeMs) / 3_600_000;
    if (ageHours > this.options.maxAgeHours) {
      return { status: 'warning' as const, severity: 'warning' as const, summary: 'backup_artifact_stale', metrics: { ageHours: Math.round(ageHours * 10) / 10 } };
    }

    const manifest = await readFile(checksum, { encoding: 'utf8', signal });
    const match = manifest.match(/^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)\r?\n?$/);
    if (!match || match[2] !== path.basename(artifact)) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_checksum_format_unsupported' };
    }
    if (signal.aborted) return { status: 'unknown' as const, severity: 'warning' as const, summary: 'backup_check_cancelled' };

    const hash = createHash('sha256');
    for await (const chunk of createReadStream(artifact, { signal })) hash.update(chunk as Buffer);
    const matches = hash.digest('hex').toLowerCase() === match[1].toLowerCase();
    return {
      status: matches ? 'ok' as const : 'critical' as const,
      severity: matches ? 'info' as const : 'critical' as const,
      summary: matches ? 'backup_checksum_valid' : 'backup_checksum_mismatch',
      metrics: { artifactBytes: artifactStat.size, ageHours: Math.max(0, Math.round(ageHours * 10) / 10) },
    };
  }
}
