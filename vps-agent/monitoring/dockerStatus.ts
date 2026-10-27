import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export interface ContainerSnapshot { name: string; state: 'running' | 'exited' | 'paused' | 'unknown'; restartCount?: number; }
export interface DockerStatusReader { listContainers(signal: AbortSignal): Promise<ContainerSnapshot[]>; }

/** No Docker socket/CLI access is enabled by default; inject a reviewed reader explicitly. */
export class DockerStatusChecker implements ReadOnlyChecker {
  readonly id = 'docker_containers';
  constructor(private readonly expectedNames: string[], private readonly reader?: DockerStatusReader) {}

  async run({ signal }: CheckContext) {
    if (!this.reader) return { status: 'unknown' as const, severity: 'warning' as const, summary: 'docker_adapter_disabled' };
    const containers = await this.reader.listContainers(signal);
    const byName = new Map(containers.map((item) => [item.name, item]));
    const missing = this.expectedNames.filter((name) => !byName.has(name));
    const unhealthy = this.expectedNames.filter((name) => byName.has(name) && byName.get(name)?.state !== 'running');
    const restarts = this.expectedNames.reduce((sum, name) => sum + Math.max(0, byName.get(name)?.restartCount ?? 0), 0);
    const failed = missing.length > 0 || unhealthy.length > 0;
    return {
      status: failed ? 'critical' as const : restarts > 0 ? 'warning' as const : 'ok' as const,
      severity: failed ? 'critical' as const : restarts > 0 ? 'warning' as const : 'info' as const,
      summary: failed ? 'docker_expected_container_not_running' : restarts > 0 ? 'docker_restart_observed' : 'docker_containers_running',
      metrics: { expectedCount: this.expectedNames.length, runningCount: this.expectedNames.length - missing.length - unhealthy.length, restartCount: restarts },
    };
  }
}
