import { describe, expect, it, vi } from 'vitest';
import { OpenAIDiagnoser } from '../../analysis/openAiAnalyzer.js';

describe('optional AI diagnosis', () => {
  it('does not call an external provider when there are no findings', async () => {
    const fetcher = vi.fn();
    const analyzer = new OpenAIDiagnoser({ apiKey: 'test-key', model: 'gpt-4.1-mini', maxOutputTokens: 250, fetchImpl: fetcher });
    await expect(analyzer.diagnose([])).resolves.toEqual({ status: 'skipped', summaryCode: 'no_meaningful_findings' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends safe checker identifiers and numeric metrics, not raw log text', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(JSON.stringify(body)).not.toContain('secret raw log line');
      expect(JSON.stringify(body)).toContain('diskUsedPercent');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Disk doluluğunu salt okunur biçimde tekrar kontrol et.' } }] }), { status: 200 });
    });
    const analyzer = new OpenAIDiagnoser({ apiKey: 'test-key', model: 'gpt-4.1-mini', maxOutputTokens: 250, fetchImpl: fetcher });
    const result = await analyzer.diagnose([{
      checkId: 'host_resources',
      status: 'critical',
      summaryCode: 'resource_threshold_critical',
      metrics: { diskUsedPercent: 95, unsafeText: 'secret raw log line' },
    }]);
    expect(result.status).toBe('completed');
    expect(result.diagnosis).toContain('salt okunur');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns a fixed error code without provider response details', async () => {
    const fetcher = vi.fn(async () => new Response('private provider response', { status: 429 }));
    const analyzer = new OpenAIDiagnoser({ apiKey: 'test-key', model: 'gpt-4.1-mini', maxOutputTokens: 250, fetchImpl: fetcher });
    await expect(analyzer.diagnose([{ checkId: 'app_readiness', status: 'critical', summaryCode: 'health_connection_failed', metrics: {} }]))
      .resolves.toEqual({ status: 'failed', summaryCode: 'ai_provider_rejected' });
  });
});
