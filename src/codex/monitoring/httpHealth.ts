import type { CheckContext, ReadOnlyChecker } from '../core/types.js';

export class HttpHealthChecker implements ReadOnlyChecker {
  readonly id: string;

  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch = fetch, id = 'app_readiness') { this.id = id; }

  async run({ signal }: CheckContext) {
    try {
      const response = await this.fetchImpl(this.url, { method: 'GET', redirect: 'error', signal });
      try { await response.body?.cancel(); } catch { /* response content is intentionally discarded */ }
      if (response.status === 200) return { status: 'ok' as const, severity: 'info' as const, summary: 'health_http_200', metrics: { httpStatus: 200 } };
      return { status: response.status >= 500 ? 'critical' as const : 'warning' as const, severity: response.status >= 500 ? 'critical' as const : 'warning' as const, summary: 'health_http_unavailable', metrics: { httpStatus: response.status } };
    } catch {
      return { status: 'critical' as const, severity: 'critical' as const, summary: signal.aborted ? 'health_timeout_or_cancelled' : 'health_connection_failed' };
    }
  }
}
