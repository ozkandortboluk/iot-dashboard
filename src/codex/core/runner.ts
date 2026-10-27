import { safeErrorCode } from './redaction.js';
import type { CheckResult, ReadOnlyChecker, CheckRunOptions } from './types.js';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runChecker(checker: ReadOnlyChecker, options: CheckRunOptions, now = () => new Date()): Promise<CheckResult> {
  const startedAt = Date.now();
  let finalStatus: CheckResult['status'] = 'unknown';
  let severity: CheckResult['severity'] = 'warning';
  let summary = 'check_failed';
  let metrics: CheckResult['metrics'];

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error('timeout');
          error.name = 'TimeoutError';
          reject(error);
        }, options.timeoutMs);
      });
      const result = await Promise.race([checker.run({ signal: controller.signal, now }), timeout]);
      finalStatus = result.status;
      severity = result.severity;
      summary = result.summary.slice(0, 200);
      metrics = result.metrics;
      if (finalStatus === 'ok' || attempt === options.retries) break;
    } catch (error) {
      finalStatus = 'unknown';
      severity = 'warning';
      summary = safeErrorCode(error);
      if (attempt === options.retries) break;
    } finally {
      if (timer) clearTimeout(timer);
    }
    await wait(Math.min(options.retryDelayMs * (2 ** attempt), 5_000));
  }

  return {
    id: checker.id,
    status: finalStatus,
    severity,
    checkedAt: now().toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt),
    summary,
    ...(metrics ? { metrics } : {}),
  };
}

export async function runCheckers(checkers: ReadOnlyChecker[], options: CheckRunOptions, now = () => new Date()): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const checker of checkers) results.push(await runChecker(checker, options, now));
  return results;
}
