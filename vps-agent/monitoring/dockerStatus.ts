import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export interface ContainerSnapshot { name: string; state: 'running' | 'exited' | 'paused' | 'unknown'; restartCount?: number; }
export interface DockerStatusReader { listContainers(signal: AbortSignal): Promise<ContainerSnapshot[]>; }

/**
 * Calls only the Docker containers-list GET endpoint on a separately configured
 * loopback read-only proxy. Never connects to the Docker socket or runs a shell.
 */
export class DockerReadOnlyHttpReader implements DockerStatusReader {
  constructor(private readonly proxyUrl: string, private readonly fetchImpl: typeof fetch = fetch) {
    const url = new URL(proxyUrl);
    if (!['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.protocol !== 'http:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
      throw new Error('docker_proxy_url_must_be_loopback_http');
    }
  }

  async listContainers(signal: AbortSignal): Promise<ContainerSnapshot[]> {
    const url = new URL('/containers/json?all=1&limit=100', this.proxyUrl);
    const response = await this.fetchImpl(url, { method: 'GET', redirect: 'error', signal, headers: { accept: 'application/json' } });
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* discard response */ }
      throw new Error('docker_proxy_request_failed');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('docker_proxy_response_empty');
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 65_536) {
          await reader.cancel().catch(() => undefined);
          throw new Error('docker_proxy_response_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('docker_proxy_response_invalid'); }
    if (!Array.isArray(payload)) throw new Error('docker_proxy_response_invalid');
    return payload.slice(0, 100).flatMap((item): ContainerSnapshot[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (!Array.isArray(record.Names) || typeof record.State !== 'string') return [];
      const names = record.Names.filter((name): name is string => typeof name === 'string')
        .map((name) => name.replace(/^\//, '')).filter((name) => /^[a-zA-Z0-9_.-]{1,64}$/.test(name));
      const state = record.State === 'running' ? 'running'
        : record.State === 'paused' ? 'paused'
          : record.State === 'exited' || record.State === 'created' || record.State === 'dead' ? 'exited'
            : 'unknown';
      return names.map((name) => ({ name, state }));
    });
  }
}

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
