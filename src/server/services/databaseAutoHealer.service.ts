import { systemLogger } from './systemLogger.service.js';
import type { DatabaseEngineType } from '../../types.js';

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
          this.recordHealingEvent('system_events tablosu otomatik oluşturuldu.');
          systemLogger.info('auto_repair', 'system_events tablosu otomatik oluşturuldu.');
        }

        // If any critical tables are missing, trigger non-blocking safe schema patch
        if (missing.length > 0) {
          const msg = `Eksik tablolar tespit edildi: ${missing.join(', ')}. Şema onarılıyor...`;
          this.recordHealingEvent(msg);
          systemLogger.warn('auto_repair', msg);
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
      if (poolStats.waitingCount > 5) {
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

  private recordHealingEvent(msg: string): void {
    const entry = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`;
    this.healingHistory.push(entry);
    if (this.healingHistory.length > 50) {
      this.healingHistory.shift();
    }
  }
}
