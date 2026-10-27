import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export interface AllowedLogsOptions { files: string[]; maxBytesPerFile: number; }

export class AllowedLogSummaryChecker implements ReadOnlyChecker {
  readonly id = 'allowed_log_summary';
  constructor(private readonly options: AllowedLogsOptions) {}

  async run({ signal }: CheckContext) {
    let scannedFiles = 0;
    let errorLines = 0;
    let unreadableFiles = 0;
    for (const file of this.options.files) {
      if (signal.aborted) return { status: 'unknown' as const, severity: 'warning' as const, summary: 'log_scan_cancelled' };
      try {
        const info = await lstat(file);
        if (info.isSymbolicLink() || !info.isFile()) { unreadableFiles += 1; continue; }
        const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const size = Math.min(info.size, this.options.maxBytesPerFile);
          const buffer = Buffer.alloc(size);
          await handle.read(buffer, 0, size, Math.max(0, info.size - size));
          const text = buffer.toString('utf8');
          const lines = text.split(/\r?\n/).slice(info.size > size ? 1 : 0);
          errorLines += lines.reduce((total, line) => total + (/\b(error|fatal|critical)\b/i.test(line) ? 1 : 0), 0);
          scannedFiles += 1;
        } finally {
          await handle.close();
        }
      } catch {
        unreadableFiles += 1;
      }
    }
    return {
      status: unreadableFiles ? 'warning' as const : errorLines ? 'warning' as const : 'ok' as const,
      severity: unreadableFiles || errorLines ? 'warning' as const : 'info' as const,
      summary: unreadableFiles ? 'some_allowed_logs_unreadable' : errorLines ? 'error_lines_observed' : 'no_error_lines_observed',
      metrics: { scannedFiles, unreadableFiles, errorLines },
    };
  }
}
