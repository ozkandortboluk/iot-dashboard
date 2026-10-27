export type CheckStatus = 'ok' | 'warning' | 'critical' | 'unknown';
export type CheckSeverity = 'info' | 'warning' | 'critical';

export interface CheckResult {
  id: string;
  status: CheckStatus;
  severity: CheckSeverity;
  checkedAt: string;
  durationMs: number;
  summary: string;
  metrics?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CheckContext {
  signal: AbortSignal;
  now: () => Date;
}

export interface ReadOnlyChecker {
  readonly id: string;
  run(context: CheckContext): Promise<Omit<CheckResult, 'id' | 'checkedAt' | 'durationMs'>>;
}

export interface CheckRunOptions {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export interface MonitorReport {
  schemaVersion: 1;
  mode: 'observe_only' | 'propose_changes' | 'isolated_test' | 'approved_release';
  generatedAt: string;
  results: CheckResult[];
  status: CheckStatus;
}
