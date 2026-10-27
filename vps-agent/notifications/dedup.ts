import type { PersistedNotification } from '../core/runtimeState.js';

export interface NotificationEvent {
  code: string;
  checkId: string;
  status: 'warning' | 'critical' | 'unknown';
}

export class EventDeduplicator {
  private readonly sentAt = new Map<string, number>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000, private readonly maxEntries = 200, initial: PersistedNotification[] = []) {
    if (!Number.isFinite(ttlMs) || ttlMs < 1 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Invalid deduplicator limits.');
    for (const entry of initial.slice(-maxEntries)) {
      if (/^[a-z0-9_:-]{1,160}$/.test(entry.key) && Number.isFinite(entry.sentAt) && entry.sentAt >= 0) this.sentAt.set(entry.key, entry.sentAt);
    }
  }

  private key(event: NotificationEvent): string {
    return `${event.checkId}:${event.code}:${event.status}`;
  }

  shouldSend(event: NotificationEvent, nowMs = Date.now()): boolean {
    const key = this.key(event);
    this.prune(nowMs);
    const prior = this.sentAt.get(key);
    return prior === undefined || nowMs - prior >= this.ttlMs;
  }

  wasSent(event: NotificationEvent, nowMs = Date.now()): boolean {
    const sent = this.sentAt.get(this.key(event));
    return sent !== undefined && nowMs >= sent && nowMs - sent < this.ttlMs;
  }

  markSent(event: NotificationEvent, nowMs = Date.now()): void {
    this.sentAt.delete(this.key(event));
    this.sentAt.set(this.key(event), nowMs);
    this.prune(nowMs);
  }

  exportState(nowMs = Date.now()): PersistedNotification[] {
    this.prune(nowMs);
    return Array.from(this.sentAt, ([key, sentAt]) => ({ key, sentAt })).slice(-this.maxEntries);
  }

  private prune(nowMs: number): void {
    for (const [key, at] of this.sentAt) if (nowMs < at || nowMs - at >= this.ttlMs) this.sentAt.delete(key);
    while (this.sentAt.size > this.maxEntries) this.sentAt.delete(this.sentAt.keys().next().value as string);
  }
}
