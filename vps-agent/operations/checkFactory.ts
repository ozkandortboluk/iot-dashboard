import type { MonitorConfig } from '../core/config.js';
import { assertReadOnlyMode } from '../core/policy.js';
import type { ReadOnlyChecker } from '../core/types.js';
import type { DockerStatusReader } from '../monitoring/dockerStatus.js';
import { DockerReadOnlyHttpReader, DockerStatusChecker } from '../monitoring/dockerStatus.js';
import { AllowedLogSummaryChecker } from '../monitoring/allowedLogs.js';
import { BackupArtifactChecker } from '../monitoring/backupArtifact.js';
import { HttpHealthChecker } from '../monitoring/httpHealth.js';
import { SystemResourcesChecker } from '../monitoring/systemResources.js';

export function createReadOnlyCheckers(config: MonitorConfig, adapters: { fetchImpl?: typeof fetch; dockerReader?: DockerStatusReader } = {}): ReadOnlyChecker[] {
  assertReadOnlyMode(config.mode);
  const checkers: ReadOnlyChecker[] = [];
  if (config.health.enabled) {
    checkers.push(new HttpHealthChecker(config.health.liveUrl, adapters.fetchImpl, 'app_liveness'));
    checkers.push(new HttpHealthChecker(config.health.readyUrl, adapters.fetchImpl, 'database_readiness'));
  }
  if (config.system.enabled) checkers.push(new SystemResourcesChecker(config.system));
  if (config.docker.enabled) {
    const reader = adapters.dockerReader ?? (config.docker.readOnlyProxyUrl ? new DockerReadOnlyHttpReader(config.docker.readOnlyProxyUrl, adapters.fetchImpl) : undefined);
    checkers.push(new DockerStatusChecker(config.docker.expectedContainers, reader));
  }
  if (config.backup?.enabled) checkers.push(new BackupArtifactChecker(config.backup));
  if (config.logs.enabled && config.logs.allowedFiles.length > 0) checkers.push(new AllowedLogSummaryChecker({ files: config.logs.allowedFiles, maxBytesPerFile: config.logs.maxBytesPerFile }));
  return checkers;
}

