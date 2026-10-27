import type { MonitorReport } from '../core/types.js';

export interface DailySummaryState { lastSentLocalDate?: string; }

function localParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') };
}

export function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isDailySummaryDue(now: Date, timeZone: string, summaryHour: number, state: DailySummaryState): boolean {
  const local = localParts(now, timeZone);
  const today = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  return local.hour >= summaryHour && state.lastSentLocalDate !== today;
}

export function formatDailySummary(report: MonitorReport): string {
  const counts = report.results.reduce((acc, result) => {
    acc[result.status] += 1;
    return acc;
  }, { ok: 0, warning: 0, critical: 0, unknown: 0 });
  return `NexusNode günlük özet: ${report.status}. Kontrol=${report.results.length}, iyi=${counts.ok}, uyarı=${counts.warning}, kritik=${counts.critical}, bilinmiyor=${counts.unknown}.`;
}
