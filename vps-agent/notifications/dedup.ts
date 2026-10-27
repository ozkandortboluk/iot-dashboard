export interface NotificationEvent {
  code: string;
  checkId: string;
  status: 'warning' | 'critical';
}

export class EventDeduplicator {
  private readonly sentAt = new Map<string, number>();
  constructor(private readonly ttlMs = 60 * 60 * 1000, private readonly maxEntries = 1_000) {
    if (!Number.isFinite(ttlMs) || ttlMs < 1 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Invalid deduplicator limits.');
  }

  shouldSend(event: NotificationEvent, nowMs = Date.now()): boolean {
    const key = `${event.checkId}:${event.code}:${event.status}`;
    for (const [existing, at] of this.sentAt) if (nowMs - at >= this.ttlMs) this.sentAt.delete(existing);
    const prior = this.sentAt.get(key);
    if (prior !== undefined && nowMs - prior < this.ttlMs) return false;
    this.sentAt.delete(key);
    this.sentAt.set(key, nowMs);
    while (this.sentAt.size > this.maxEntries) this.sentAt.delete(this.sentAt.keys().next().value as string);
    return true;
  }

  wasSent(event: NotificationEvent, nowMs = Date.now()): boolean {
    const key = `${event.checkId}:${event.code}:${event.status}`;
    const sent = this.sentAt.get(key);
    return sent !== undefined && nowMs - sent < this.ttlMs;
  }

  markSent(event: NotificationEvent, nowMs = Date.now()): void {
    const key = `${event.checkId}:${event.code}:${event.status}`;
    this.sentAt.delete(key);
    this.sentAt.set(key, nowMs);
    while (this.sentAt.size > this.maxEntries) this.sentAt.delete(this.sentAt.keys().next().value as string);
  }
}
