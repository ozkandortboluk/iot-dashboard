import { describe, expect, it, vi } from 'vitest';
import { EventDeduplicator } from '../../notifications/dedup.js';
import { FakeMessageSender, formatCriticalNotifications, readTelegramCredentials, TelegramHttpSender } from '../../notifications/telegram.js';
import { deliverNotifications } from '../../notifications/delivery.js';
import { formatDailySummary, isDailySummaryDue } from '../../reports/dailySummary.js';
import { buildReport } from '../../core/report.js';

describe('outgoing notification behavior', () => {
  it('deduplicates repeated events and permits them after TTL', () => {
    const dedup = new EventDeduplicator(1_000, 4);
    const event = { code: 'health_http_unavailable', checkId: 'app_readiness', status: 'critical' as const };
    expect(dedup.shouldSend(event, 10_000)).toBe(true);
    dedup.markSent(event, 10_000);
    expect(dedup.shouldSend(event, 10_500)).toBe(false);
    expect(dedup.shouldSend(event, 11_001)).toBe(true);
  });

  it('restores notification deduplication from persisted state', () => {
    const event = { code: 'status_critical', checkId: 'app_readiness', status: 'critical' as const };
    const firstRun = new EventDeduplicator(86_400_000);
    firstRun.markSent(event, 10_000);
    const secondRun = new EventDeduplicator(86_400_000, 200, firstRun.exportState(10_500));
    expect(secondRun.wasSent(event, 10_500)).toBe(true);
    expect(secondRun.shouldSend(event, 10_500)).toBe(false);
  });

  it('uses fixed notification text and excludes metric/log content', async () => {
    const report = buildReport([{ id: 'app_readiness', status: 'critical', severity: 'critical', checkedAt: new Date().toISOString(), durationMs: 2, summary: 'health_connection_failed', metrics: { httpStatus: 503 } }]);
    const notifications = formatCriticalNotifications(report);
    const sender = new FakeMessageSender();
    await sender.send(notifications[0].text);
    expect(sender.messages[0]).toContain('readiness');
    expect(sender.messages[0]).not.toContain('503');
  });

  it('keeps provider token out of errors and discards provider response body', async () => {
    const token = '123456:abcdefghijklmnopqrstuvwxyzABCDEF';
    const fetcher = vi.fn(async () => new Response('provider private detail', { status: 503 }));
    const sender = new TelegramHttpSender({ botToken: token, chatId: '12345678' }, fetcher);
    await expect(sender.send('safe fixed alert')).rejects.toThrow('telegram_delivery_failed');
    await expect(sender.send('safe fixed alert')).rejects.not.toThrow(token);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sendMessage'), expect.objectContaining({ method: 'POST', redirect: 'error' }));
  });

  it('reads credentials only from named environment values and summarizes by status', () => {
    expect(readTelegramCredentials({ TOKEN: 'x', CHAT: 'y' }, 'TOKEN', 'CHAT')).toEqual({ botToken: 'x', chatId: 'y' });
    const report = buildReport([{ id: 'x', status: 'warning', severity: 'warning', checkedAt: new Date().toISOString(), durationMs: 1, summary: 'safe' }]);
    expect(formatDailySummary(report)).toContain('uyarı=1');
    expect(isDailySummaryDue(new Date('2026-10-26T06:01:00Z'), 'Europe/Istanbul', 9, {})).toBe(true);
    expect(isDailySummaryDue(new Date('2026-10-26T06:01:00Z'), 'Europe/Istanbul', 9, { lastSentLocalDate: '2026-10-26' })).toBe(false);
  });

  it('deduplicates critical alerts and sends one daily summary per Turkey-local day', async () => {
    const report = buildReport([{ id: 'app_readiness', status: 'critical', severity: 'critical', checkedAt: new Date().toISOString(), durationMs: 1, summary: 'safe' }]);
    const sender = new FakeMessageSender();
    const dedup = new EventDeduplicator();
    const options = { now: new Date('2026-10-26T06:01:00Z'), timeZone: 'Europe/Istanbul', summaryHour: 9 };
    const first = await deliverNotifications(report, sender, dedup, options);
    const second = await deliverNotifications(report, sender, dedup, { ...options, dailyState: first.dailySummaryState });
    expect(first.sent).toBe(2);
    expect(second.deduplicated).toBe(1);
    expect(second.sent).toBe(0);
    expect(sender.messages).toHaveLength(2);
  });

  it('blocks real Telegram delivery unless explicitly approved for this call', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const sender = new TelegramHttpSender({ botToken: '123456:abcdefghijklmnopqrstuvwxyzABCDEF', chatId: '12345678' }, fetcher);
    const report = buildReport([{ id: 'app_readiness', status: 'critical', severity: 'critical', checkedAt: new Date().toISOString(), durationMs: 1, summary: 'safe' }]);
    const result = await deliverNotifications(report, sender, new EventDeduplicator(), { now: new Date('2026-10-26T06:01:00Z'), timeZone: 'Europe/Istanbul', summaryHour: 9 });
    expect(result.blocked).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
