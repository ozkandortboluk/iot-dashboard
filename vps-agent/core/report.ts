import type { CheckResult, MonitorReport } from './types.js';

export function buildReport(results: CheckResult[], generatedAt = new Date(), mode: MonitorReport['mode'] = 'observe_only'): MonitorReport {
  const rank = { ok: 0, unknown: 1, warning: 2, critical: 3 } as const;
  const status = results.reduce<MonitorReport['status']>((worst, result) => rank[result.status] > rank[worst] ? result.status : worst, 'ok');
  return { schemaVersion: 1, mode, generatedAt: generatedAt.toISOString(), results, status };
}
