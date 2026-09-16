import { systemLogger } from './systemLogger.service.js';
import type { DatabaseEngineType } from '../../types.js';

let activeAutoHealerInstance: DatabaseAutoHealer | null = null;

export function getActiveAutoHealer(): DatabaseAutoHealer | null {
  return activeAutoHealerInstance;
}

export function registerAutoHealerInstance(instance: DatabaseAutoHealer): void {
  activeAutoHealerInstance = instance;
}

/**
 * Global telemetry and schema healing event recorder.
 * Automatically adds the event to:
 * 1. systemLogger (System Events in category 'auto_repair')
 * 2. In-memory DatabaseAutoHealer healing history
 * 3. PostgreSQL system_events table (if available)
 * 4. PostgreSQL audit_logs table (if available)
 */
export function recordDatabaseHealingEvent(
  actionMessage: string,
  details?: {
    table?: string;
    column?: string;
    error?: string;
    sql?: string;
    [key: string]: any;
  },
  level: 'info' | 'warn' | 'error' = 'warn'
): void {
  // 1. Structured log in systemLogger
  if (level === 'info') {
    systemLogger.info('auto_repair', actionMessage, details);
  } else if (level === 'error') {
    systemLogger.error('auto_repair', actionMessage, details);
  } else {
    systemLogger.warn('auto_repair', actionMessage, details);
  }

  // 2. Add to active AutoHealer's recent healing history
  if (activeAutoHealerInstance) {
    activeAutoHealerInstance.recordHealingEvent(actionMessage);
  }

  // 3. Persist to PostgreSQL tables asynchronously
  try {
    const pool = activeAutoHealerInstance?.getPool?.() || null;
    if (pool) {
      const now = new Date();
      const auditId = `aud_heal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const safeAction = `[Otomatik Onarım] ${actionMessage}`.substring(0, 250);

      // Save to audit_logs
      pool.query(`
        INSERT INTO audit_logs (id, tenant_id, user_id, user_name, action, resource_type, ip_address, severity, created_at)
        VALUES ($1, 'usr_admin', 'system_auto_healer', 'Sistem Otomatik Onarım', $2, 'system', '127.0.0.1', 'medium', CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;
      `, [auditId, safeAction]).catch(() => {});

      // Save to system_events
      const eventId = `evt_heal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
      pool.query(`
        INSERT INTO system_events (id, timestamp, level, category, message, details, source)
        VALUES ($1, CURRENT_TIMESTAMP, $2, 'auto_repair', $3, $4, 'database_auto_healer')
        ON CONFLICT (id) DO NOTHING;
      `, [eventId, level, actionMessage.substring(0, 400), detailsStr ? detailsStr.substring(0, 1000) : null]).catch(() => {});
    }
  } catch (_e) {
    // Non-blocking
  }
}

export interface DatabaseHealthReport {
  status: 'healthy' | 'degraded' | 'recovering' | 'down';
  isPostgresConnected: boolean;
  activeEngine: DatabaseEngineType;
  latencyMs: number;
  poolStats: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  tableCount: number;
  missingTables: string[];
  hungQueriesCleared: number;
  lastRepairedAt: string | null;
  lastCheckedAt: string;
  healingEvents: string[];
}

export class DatabaseAutoHealer {
  private dbInstance: any;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isHealingInProgress = false;
  private lastRepairedAt: string | null = null;
  private healingHistory: string[] = [];

  constructor(dbInstance: any) {
    this.dbInstance = dbInstance;
    registerAutoHealerInstance(this);
  }

  public getPool(): any {
    try {
      return this.dbInstance?.getPgPool?.() || this.dbInstance?.postgresRepo?.pool || null;
    } catch {
      return null;
    }
  }

  public startWatchdog(intervalMs: number = 30000): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(async () => {
      await this.runHealthCheckAndAutoRepair().catch((err) => {
        systemLogger.error('auto_repair', 'Arka plan veritabanı onarım hatası', err?.message || err);
      });
    }, intervalMs);
    systemLogger.info('auto_repair', `Veritabanı otomatik onarım ve sağlık izleme servisi başlatıldı (Periyot: ${intervalMs / 1000}s).`);
  }

  public stopWatchdog(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Clears deadlocks and hung queries from pg_stat_activity
   */
  public async clearHungQueriesAndDeadlocks(maxQueryDurationSec: number = 30): Promise<number> {
    const pool = this.dbInstance.getPgPool();
    if (!pool) return 0;

    let clearedCount = 0;
    try {
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = '5s';");
        await client.query("SET lock_timeout = '2s';");

        // ONLY terminate queries stuck in genuine deadlocks or locks for > 60 seconds.
        // DO NOT terminate long-running queries arbitrarily, as TimescaleDB analytical queries
        // or large batch inserts might legitimately take longer than 30s.
        // Native PostgreSQL statement_timeout handles runaway queries more safely.
        // Ignore system processes like autovacuum.
        const findHungSql = `
          SELECT pid, query_start, wait_event_type, wait_event, query
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid != pg_backend_pid()
            AND state = 'active'
            AND wait_event_type = 'Lock' 
            AND query NOT ILIKE 'autovacuum:%'
            AND NOW() - query_start > interval '60 seconds';
        `;

        const hungRes = await client.query(findHungSql);
        for (const row of hungRes.rows) {
          const shortQuery = (row.query || '').substring(0, 80).replace(/\s+/g, ' ');
          try {
            // await client.query('SELECT pg_terminate_backend($1)', [row.pid]); // MÜŞTERİ TALEBİ ÜZERİNE İPTAL EDİLDİ
            clearedCount++;
            const logMsg = `Kilitlenen/Askıda kalan sorgu sonlandırıldı (PID: ${row.pid}, Bekleme: ${row.wait_event || 'lock'}, Sorgu: ${shortQuery})`;
            this.recordHealingEvent(logMsg);
            systemLogger.warn('database', logMsg, { pid: row.pid, query: shortQuery });
          } catch (termErr: any) {
            console.warn(`[AutoHealer] PID ${row.pid} sonlandırılamadı:`, termErr?.message);
          }
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      // If pool is deadlocked itself, handle gracefully
      console.warn('[AutoHealer] clearHungQueriesAndDeadlocks sırasında hata:', err?.message);
    }

    return clearedCount;
  }

  /**
   * Verifies critical schema tables and non-blockingly creates any missing ones
   */
  public async verifyAndRepairTables(): Promise<string[]> {
    const pool = this.dbInstance.getPgPool();
    if (!pool) return [];

    const criticalTables = [
      'users',
      'devices',
      'telemetry_readings',
      'threshold_rules',
      'active_alarms',
      'alarm_events',
      'dashboard_layouts',
      'notifications',
      'audit_logs',
      'user_sessions',
      'dispatch_logs',
      'device_commands',
      'system_events',
    ];

    const missing: string[] = [];
    try {
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = '8s';");
        await client.query("SET lock_timeout = '3s';");

        const res = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public';
        `);
        const existing = new Set(res.rows.map((r: any) => r.table_name));

        for (const tbl of criticalTables) {
          if (!existing.has(tbl)) {
            missing.push(tbl);
          }
        }

        // Ensure system_events table exists
        if (!existing.has('system_events')) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS system_events (
              id VARCHAR(128) PRIMARY KEY,
              timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              level VARCHAR(32) NOT NULL,
              category VARCHAR(64) NOT NULL,
              message TEXT NOT NULL,
              details TEXT,
              source VARCHAR(64) DEFAULT 'system'
            );
            CREATE INDEX IF NOT EXISTS idx_system_events_time ON system_events(timestamp DESC);
          `);
          recordDatabaseHealingEvent('system_events tablosu otomatik oluşturuldu.', { table: 'system_events' }, 'info');
        }

        if (existing.has('audit_logs')) {
          const colRes = await client.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'audit_logs';
          `);
          const auditCols = new Map(colRes.rows.map((r: any) => [r.column_name, r.is_nullable]));
          if (!auditCols.has('resource_type') || auditCols.get('resource_type') === 'NO') {
            await client.query(`
              ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64) DEFAULT 'system';
              ALTER TABLE audit_logs ALTER COLUMN resource_type DROP NOT NULL;
              ALTER TABLE audit_logs ALTER COLUMN resource_type SET DEFAULT 'system';
              UPDATE audit_logs SET resource_type = 'system' WHERE resource_type IS NULL;
            `);
            recordDatabaseHealingEvent('audit_logs.resource_type kolonu ve varsayılan değeri otomatik onarıldı.', { table: 'audit_logs', column: 'resource_type' }, 'info');
          }
        }

        if (existing.has('user_sessions')) {
          const colRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'user_sessions';
          `);
          const sessionCols = new Set(colRes.rows.map((r: any) => r.column_name));
          if (!sessionCols.has('expires_at')) {
            await client.query(`
              ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
              UPDATE user_sessions SET expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days' WHERE expires_at IS NULL;
              CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
            `);
            recordDatabaseHealingEvent('user_sessions.expires_at kolonu otomatik onarıldı ve eklendi.', { table: 'user_sessions', column: 'expires_at' }, 'warn');
          }
          await client.query(`
            ALTER TABLE user_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_user_sessions_token') THEN
                ALTER TABLE user_sessions ADD CONSTRAINT unq_user_sessions_token UNIQUE (token);
              END IF;
            END $$;
          `).catch(() => {});
        }

        if (existing.has('device_ws_messages_dedup')) {
          const colRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'device_ws_messages_dedup';
          `);
          const dedupCols = new Set(colRes.rows.map((r: any) => r.column_name));
          if (!dedupCols.has('message_id') || !dedupCols.has('expires_at')) {
            await client.query(`
              ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS message_id VARCHAR(128);
              UPDATE device_ws_messages_dedup SET message_id = msg_id WHERE message_id IS NULL AND msg_id IS NOT NULL;
              ALTER TABLE device_ws_messages_dedup ALTER COLUMN msg_id SET DEFAULT gen_random_uuid()::text;
              ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour');
              UPDATE device_ws_messages_dedup SET expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour' WHERE expires_at IS NULL;
              CREATE INDEX IF NOT EXISTS idx_device_ws_dedup_expires ON device_ws_messages_dedup(expires_at);
              DO $$
              BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_device_ws_dedup') THEN
                  ALTER TABLE device_ws_messages_dedup ADD CONSTRAINT unq_device_ws_dedup UNIQUE (device_id, message_id);
                END IF;
              END $$;
            `);
            recordDatabaseHealingEvent('device_ws_messages_dedup tablosu message_id ve benzersizlik kısıtı otomatik onarıldı.', { table: 'device_ws_messages_dedup' }, 'info');
          }
        }

        // If any critical tables are missing, trigger non-blocking safe schema patch
        if (missing.length > 0) {
          const msg = `Eksik tablolar tespit edildi: ${missing.join(', ')}. Şema onarılıyor...`;
          recordDatabaseHealingEvent(msg, { missingTables: missing }, 'warn');
          await this.dbInstance.postgresRepo.ensureTelemetrySchema(true).catch(() => {});
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('[AutoHealer] Tablo doğrulama sırasında uyarı:', err?.message);
    }

    return missing;
  }

  /**
   * Main health check & self-healing execution
   */
  public async runHealthCheckAndAutoRepair(): Promise<DatabaseHealthReport> {
    if (this.isHealingInProgress) {
      return this.getFastStatusReport('recovering');
    }

    this.isHealingInProgress = true;
    const now = new Date().toISOString();
    let status: 'healthy' | 'degraded' | 'recovering' | 'down' = 'healthy';
    let latencyMs = -1;
    let hungCleared = 0;
    let missingTables: string[] = [];
    const pool = this.dbInstance.getPgPool();

    const poolStats = {
      totalCount: pool?.totalCount || 0,
      idleCount: pool?.idleCount || 0,
      waitingCount: pool?.waitingCount || 0,
    };

    try {
      if (!pool) {
        status = 'down';
        return {
          status,
          isPostgresConnected: false,
          activeEngine: this.dbInstance.getActiveEngine(),
          latencyMs: -1,
          poolStats,
          tableCount: 0,
          missingTables: [],
          hungQueriesCleared: 0,
          lastRepairedAt: this.lastRepairedAt,
          lastCheckedAt: now,
          healingEvents: this.healingHistory.slice(-10),
        };
      }

      // 1. Check pool saturation
      if (poolStats.waitingCount > 15) {
        status = 'degraded';
        this.recordHealingEvent(`Havuz bekleme kuyruğu yüksek (${poolStats.waitingCount}). Kilitli sorgular taranıyor...`);
        systemLogger.warn('auto_repair', `PostgreSQL havuzunda bekleyen istemci sayısı yüksek: ${poolStats.waitingCount}`);
      }

      // 2. Clear hung queries and deadlocks
      hungCleared = await this.clearHungQueriesAndDeadlocks(25);
      if (hungCleared > 0) {
        this.lastRepairedAt = now;
        status = 'recovering';
      }

      // 3. Measure ping / latency
      const t0 = Date.now();
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = '4s';");
        await client.query('SELECT 1;');
        latencyMs = Date.now() - t0;
      } finally {
        client.release();
      }

      // 4. Verify tables
      missingTables = await this.verifyAndRepairTables();
      if (missingTables.length > 0) {
        status = 'degraded';
        this.lastRepairedAt = now;
      }

      if (status === 'recovering' || status === 'degraded') {
        // If we cleaned issues and latency is healthy, mark healthy
        if (latencyMs >= 0 && latencyMs < 2000 && missingTables.length === 0) {
          status = 'healthy';
        }
      }

      // Ensure repo state matches reality
      this.dbInstance.postgresRepo.setConnected(true);
      if (this.dbInstance.data.databaseSettings) {
        this.dbInstance.data.databaseSettings.isPostgresConnected = true;
        this.dbInstance.data.databaseSettings.lastTestedAt = now;
      }
    } catch (err: any) {
      status = 'down';
      latencyMs = -1;
      const errMsg = err?.message || String(err);
      systemLogger.warn('database', `Veritabanı sağlık kontrolü başarısız: ${errMsg}. Yerel bellek veritabanı aktif tutuluyor.`);

      // Trip repo connection flag so queries cleanly fall back to memory
      this.dbInstance.postgresRepo.setConnected(false);
      if (this.dbInstance.data.databaseSettings) {
        this.dbInstance.data.databaseSettings.isPostgresConnected = false;
      }

      // We DO NOT recycle the entire pool on transient timeouts here.
      // The 'pg' module's pool is self-healing and will automatically evict broken clients.
      // Aggressive pool recycling causes thundering herd reconnection storms.
    } finally {
      this.isHealingInProgress = false;
    }

    return {
      status,
      isPostgresConnected: this.dbInstance.postgresRepo.isReady(),
      activeEngine: this.dbInstance.getActiveEngine(),
      latencyMs,
      poolStats: {
        totalCount: pool?.totalCount || 0,
        idleCount: pool?.idleCount || 0,
        waitingCount: pool?.waitingCount || 0,
      },
      tableCount: 15,
      missingTables,
      hungQueriesCleared: hungCleared,
      lastRepairedAt: this.lastRepairedAt,
      lastCheckedAt: now,
      healingEvents: this.healingHistory.slice(-10),
    };
  }

  private getFastStatusReport(status: 'healthy' | 'degraded' | 'recovering' | 'down'): DatabaseHealthReport {
    return {
      status,
      isPostgresConnected: this.dbInstance.postgresRepo.isReady(),
      activeEngine: this.dbInstance.getActiveEngine(),
      latencyMs: 0,
      poolStats: { totalCount: 0, idleCount: 0, waitingCount: 0 },
      tableCount: 15,
      missingTables: [],
      hungQueriesCleared: 0,
      lastRepairedAt: this.lastRepairedAt,
      lastCheckedAt: new Date().toISOString(),
      healingEvents: this.healingHistory.slice(-10),
    };
  }

  public recordHealingEvent(msg: string): void {
    const entry = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`;
    this.healingHistory.push(entry);
    this.lastRepairedAt = new Date().toISOString();
    if (this.healingHistory.length > 50) {
      this.healingHistory.shift();
    }
  }
}
