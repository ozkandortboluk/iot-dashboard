export interface AnalysisRequest {
  findingCodes: string[];
  safeMetrics: Readonly<Record<string, number | string | boolean | null>>;
}

export interface AnalysisResult {
  status: 'disabled';
  summaryCode: 'codex_cli_not_verified';
}

/** Intentionally does not spawn Codex CLI or send metrics to a model. */
export class DisabledCodexAnalyzer {
  async analyze(_request: AnalysisRequest): Promise<AnalysisResult> {
    return { status: 'disabled', summaryCode: 'codex_cli_not_verified' };
  }
}
