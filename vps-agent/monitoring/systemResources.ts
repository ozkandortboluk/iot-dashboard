import { statfs } from 'node:fs/promises';
import os from 'node:os';
import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export interface ResourceThresholds {
  mountPath: string;
  diskWarningPercent: number;
  diskCriticalPercent: number;
  memoryWarningPercent: number;
  memoryCriticalPercent: number;
}

export class SystemResourcesChecker implements ReadOnlyChecker {
  readonly id = 'host_resources';
  constructor(private readonly thresholds: ResourceThresholds, private readonly statfsImpl = statfs) {}

  async run(_context: CheckContext) {
    const disk = await this.statfsImpl(this.thresholds.mountPath);
    const totalBytes = Number(disk.blocks) * Number(disk.bsize);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes)) {
      return { status: 'unknown' as const, severity: 'warning' as const, summary: 'disk_metrics_unavailable' };
    }
    const diskUsedPercent = Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10;
    const memoryUsedPercent = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 1000) / 10;
    const cpuCount = Math.max(1, os.cpus().length);
    const load1PerCpu = Math.round((os.loadavg()[0] / cpuCount) * 1000) / 1000;
    const diskCritical = diskUsedPercent >= this.thresholds.diskCriticalPercent;
    const memoryCritical = memoryUsedPercent >= this.thresholds.memoryCriticalPercent;
    const diskWarning = diskUsedPercent >= this.thresholds.diskWarningPercent;
    const memoryWarning = memoryUsedPercent >= this.thresholds.memoryWarningPercent;
    const critical = diskCritical || memoryCritical;
    const warning = diskWarning || memoryWarning;
    return {
      status: critical ? 'critical' as const : warning ? 'warning' as const : 'ok' as const,
      severity: critical ? 'critical' as const : warning ? 'warning' as const : 'info' as const,
      summary: critical ? 'resource_threshold_critical' : warning ? 'resource_threshold_warning' : 'resource_threshold_ok',
      metrics: { diskUsedPercent, memoryUsedPercent, totalBytes, freeBytes, load1PerCpu, cpuCount },
    };
  }
}
