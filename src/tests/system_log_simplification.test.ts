import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { systemLogger } from '../server/services/systemLogger.service.js';
import type { SystemEvent } from '../types.js';

describe('System Log Simplification & Deduplication Test Suite', () => {
  beforeEach(() => {
    systemLogger.updateConfig({
      enabled: true,
      deduplication: true,
      deduplicateWindowMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Suppresses rapid identical log messages within throttle window', () => {
    // First message should be logged
    const event1 = systemLogger.warn(
      'database',
      'Test veritabanı bağlantı uyarısı: connect ECONNREFUSED'
    );
    expect(event1.id).not.toContain('suppressed_');

    // Immediate second identical message should be suppressed
    const event2 = systemLogger.warn(
      'database',
      'Test veritabanı bağlantı uyarısı: connect ECONNREFUSED'
    );
    expect(event2.id).toContain('suppressed_');

    // A different message should NOT be suppressed
    const event3 = systemLogger.warn(
      'database',
      'Farklı bir veritabanı hatası meydana geldi'
    );
    expect(event3.id).not.toContain('suppressed_');
  });

  it('2. Preserves critical error messages and distinct lifecycle events', () => {
    const errorEvent = systemLogger.error(
      'server',
      'Kritik sunucu hatası: Beklenmeyen API çökmesi'
    );
    expect(errorEvent.id).not.toContain('suppressed_');

    const infoEvent = systemLogger.info(
      'security',
      'Yönetici oturum açtı (USR_ADMIN)'
    );
    expect(infoEvent.id).not.toContain('suppressed_');
  });

  it('3. simplifyExistingLogs eliminates flapping state transitions and redundant duplicates', () => {
    // Clear and feed simulated flapping events
    systemLogger.clearEvents();

    systemLogger.info('database', '[Database State Machine] Durum değişti: BOOTSTRAP -> DB_CONNECTING');
    systemLogger.info('auto_repair', 'Veritabanı otomatik onarım servisi başlatıldı');
    systemLogger.info('database', '[Database State Machine] Durum değişti: DB_CONNECTING -> DB_UNAVAILABLE');
    systemLogger.warn('database', 'Veritabanı sağlık kontrolü başarısız: ECONNREFUSED');

    const result = systemLogger.simplifyExistingLogs();
    expect(result).toHaveProperty('removedCount');
    expect(result).toHaveProperty('remainingCount');
    expect(result.remainingCount).toBeGreaterThan(0);

    const events = systemLogger.getEvents({ limit: 10 }).events;
    // Check that required events are retained
    const hasBoot = events.some(e => e.message.includes('BOOTSTRAP'));
    const hasRepair = events.some(e => e.message.includes('otomatik onarım'));
    const hasWarn = events.some(e => e.message.includes('ECONNREFUSED'));

    expect(hasBoot).toBe(true);
    expect(hasRepair).toBe(true);
    expect(hasWarn).toBe(true);
  });
});
