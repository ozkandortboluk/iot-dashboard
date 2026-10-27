import type { MonitorReport } from '../core/types.js';
import type { DailySummaryState } from '../reports/dailySummary.js';
import { formatDailySummary, isDailySummaryDue, localDateKey } from '../reports/dailySummary.js';
import { EventDeduplicator } from './dedup.js';
import { formatCriticalNotifications, type MessageSender } from './telegram.js';
import { authorizeAction } from '../core/policy.js';

export interface DeliveryResult { sent: number; deduplicated: number; failed: number; blocked: number; dailySummaryState: DailySummaryState; }

export async function deliverNotifications(
  report: MonitorReport,
  sender: MessageSender,
  deduplicator: EventDeduplicator,
  options: { now: Date; timeZone: string; summaryHour: number; dailyState?: DailySummaryState; signal?: AbortSignal; realTelegramApproved?: boolean },
): Promise<DeliveryResult> {
  let sent = 0;
  let deduplicated = 0;
  let failed = 0;
  const blocked = 0;
  const state = { ...options.dailyState };
  const externalAllowed = !sender.external || authorizeAction(report.mode, 'send_telegram', { realTelegramApproved: options.realTelegramApproved }).allowed;
  if (!externalAllowed) return { sent: 0, deduplicated: 0, failed: 0, blocked: 1, dailySummaryState: state };

  for (const notification of formatCriticalNotifications(report)) {
    const event = { checkId: notification.checkId, code: `status_${notification.status}`, status: notification.status };
    if (deduplicator.wasSent(event, options.now.getTime())) { deduplicated += 1; continue; }
    try {
      await sender.send(notification.text, options.signal);
      deduplicator.markSent(event, options.now.getTime());
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  if (isDailySummaryDue(options.now, options.timeZone, options.summaryHour, state)) {
    try {
      await sender.send(formatDailySummary(report), options.signal);
      state.lastSentLocalDate = localDateKey(options.now, options.timeZone);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, deduplicated, failed, blocked, dailySummaryState: state };
}
