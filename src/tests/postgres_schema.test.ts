import { describe, it, expect, vi } from 'vitest';
import { postgresSchemaSQL } from '../server/database/schema.js';
import { PostgresRepository } from '../server/database/postgres.js';
import { db } from '../server/db.js';
import { 
  normalizeDefaultExpression, 
  areDefaultExpressionsEquivalent,
  SchemaAuditor 
} from '../server/database/schemaAuditor.js';
import { generateTriggerDDL, type TriggerDefinition } from '../server/database/canonicalSchema.js';

describe('PostgreSQL & TimescaleDB Production Schema & Migration Suite', () => {
  describe('1. Schema DDL & Multi-Tenant Integrity', () => {
    it('should define all core relational tables with strict tenant isolation', () => {
      // Core tables that must exist in schema
      const requiredTables = [
        'CREATE TABLE IF NOT EXISTS users',
        'CREATE TABLE IF NOT EXISTS devices',
        'CREATE TABLE IF NOT EXISTS telemetry_readings',
        'CREATE TABLE IF NOT EXISTS threshold_rules',
        'CREATE TABLE IF NOT EXISTS active_alarms',
        'CREATE TABLE IF NOT EXISTS device_commands',
        'CREATE TABLE IF NOT EXISTS audit_logs',
        'CREATE TABLE IF NOT EXISTS firmwares',
        'CREATE TABLE IF NOT EXISTS ota_deployment_jobs',
      ];

      for (const tableDdl of requiredTables) {
        expect(postgresSchemaSQL).toContain(tableDdl);
      }

      // Mandatory User Rule 1: Tenant isolation column check
      expect(postgresSchemaSQL).toMatch(/tenant_id VARCHAR\(64\)/);
      expect(postgresSchemaSQL).toContain("DEFAULT 'usr_admin'");
    });

    it('should define TimescaleDB hypertable, compression and retention policies', () => {
      // TimescaleDB extension and hypertable creation
      expect(postgresSchemaSQL).toContain('CREATE EXTENSION IF NOT EXISTS timescaledb');
      expect(postgresSchemaSQL).toContain('create_hypertable');
      expect(postgresSchemaSQL).toContain('telemetry_readings');

      // Hypertable index optimization
      expect(postgresSchemaSQL).toContain('idx_telemetry_device_time');
      expect(postgresSchemaSQL).toContain('idx_telemetry_tenant_time');

      // Compression & retention policies
      expect(postgresSchemaSQL).toContain('add_compression_policy');
      expect(postgresSchemaSQL).toContain('add_retention_policy');
    });

    it('should be completely idempotent and safe against multiple executions', () => {
      // Every ALTER TABLE statement should use IF NOT EXISTS or exception guards
      const alterStatements = postgresSchemaSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.toUpperCase().startsWith('ALTER TABLE'));

      for (const stmt of alterStatements) {
        const hasIfNotExists = stmt.toUpperCase().includes('IF NOT EXISTS');
        const hasAddColumn = stmt.toUpperCase().includes('ADD COLUMN');
        if (hasAddColumn) {
          expect(hasIfNotExists).toBe(true);
        }
      }
    });
  });

  describe('2. Database Version Pinning & Timescale Compatibility Check', () => {
    it('should report compatible when PostgreSQL >= 15 and TimescaleDB >= 2.11', async () => {
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('version()')) {
            return { rows: [{ version: 'PostgreSQL 16.2 on x86_64-pc-linux-gnu' }] };
          }
          if (sql.includes('pg_extension')) {
            return { rows: [{ extname: 'timescaledb', extversion: '2.14.2' }] };
          }
          return { rows: [] };
        }),
      };

      const repo = new PostgresRepository(mockPool);
      repo.setConnected(true);

      const check = await repo.checkDatabaseVersion();
      expect(check.isCompatible).toBe(true);
      expect(check.warnings).toHaveLength(0);
      expect(check.isTimescaleInstalled).toBe(true);
      expect(check.timescaleVersion).toBe('2.14.2');
    });

    it('should flag a warning when PostgreSQL version is below 15', async () => {
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('version()')) {
            return { rows: [{ version: 'PostgreSQL 14.9 (Debian 14.9-1.pgdg110+1)' }] };
          }
          if (sql.includes('pg_extension')) {
            return { rows: [{ extname: 'timescaledb', extversion: '2.13.0' }] };
          }
          return { rows: [] };
        }),
      };

      const repo = new PostgresRepository(mockPool);
      const check = await repo.checkDatabaseVersion();
      expect(check.isCompatible).toBe(false);
      expect(check.warnings.some(w => w.includes('PostgreSQL version 14 detected'))).toBe(true);
    });

    it('should notify and fall back gracefully when TimescaleDB is not installed', async () => {
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('version()')) {
            return { rows: [{ version: 'PostgreSQL 16.1' }] };
          }
          if (sql.includes('pg_extension')) {
            return { rows: [] }; // extension not present
          }
          return { rows: [] };
        }),
      };

      const repo = new PostgresRepository(mockPool);
      const check = await repo.checkDatabaseVersion();
      expect(check.isTimescaleInstalled).toBe(false);
      expect(check.warnings.some(w => w.includes('TimescaleDB extension is not enabled'))).toBe(true);
    });
  });

  describe('3. Repository Connection State & Offline Queue Transition', () => {
    it('should reflect connection status and manage retry queue under offline conditions', () => {
      const repo = new PostgresRepository();
      expect(repo.isReady()).toBe(false);

      const mockPool: any = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      repo.setPool(mockPool);
      expect(repo.isReady()).toBe(false); // pool set but not marked connected yet

      repo.setConnected(true);
      expect(repo.isReady()).toBe(true);

      repo.setConnected(false);
      expect(repo.isReady()).toBe(false);
    });

    it('should track durable retry queue metrics and physical/simulation isolation', () => {
      const stats = db.getRetryQueueStats();
      expect(stats).toBeDefined();
      expect(typeof stats.pendingPacketCount).toBe('number');
      expect(typeof stats.pendingReadingCount).toBe('number');
      expect(stats.durable).toBe(true);

      // Verify physical and simulation isolation
      expect(stats.physical).toBeDefined();
      expect(typeof stats.physical.pendingPacketCount).toBe('number');
      expect(stats.simulation).toBeDefined();
      expect(typeof stats.simulation.pendingPacketCount).toBe('number');
    });
  });

  describe('4. PostgreSQL Default Value Normalization & Mismatch Verification', () => {
    it('should correctly normalize and match equivalent expressions despite PostgreSQL dialect formatting', () => {
      // Booleans
      expect(normalizeDefaultExpression('FALSE')).toBe('false');
      expect(normalizeDefaultExpression('true')).toBe('true');
      expect(normalizeDefaultExpression("'false'::boolean")).toBe('false');
      expect(normalizeDefaultExpression("'true'::boolean")).toBe('true');
      expect(areDefaultExpressionsEquivalent('FALSE', 'false')).toBe(true);
      expect(areDefaultExpressionsEquivalent('TRUE', 'true')).toBe(true);

      // Strings with or without casts
      expect(normalizeDefaultExpression("'IDLE'")).toBe("'IDLE'");
      expect(normalizeDefaultExpression("'IDLE'::character varying")).toBe("'IDLE'");
      expect(areDefaultExpressionsEquivalent("'IDLE'", "'IDLE'::character varying")).toBe(true);
      expect(areDefaultExpressionsEquivalent("'operator'", "'operator'::character varying")).toBe(true);

      // Numbers and floats
      expect(normalizeDefaultExpression('0')).toBe('0');
      expect(normalizeDefaultExpression('0.0')).toBe('0');
      expect(normalizeDefaultExpression('120')).toBe('120');
      expect(areDefaultExpressionsEquivalent('0', '0.0')).toBe(true);
      expect(areDefaultExpressionsEquivalent('120', '120')).toBe(true);

      // Timestamps
      expect(normalizeDefaultExpression('CURRENT_TIMESTAMP')).toBe('CURRENT_TIMESTAMP');
      expect(normalizeDefaultExpression('now()')).toBe('CURRENT_TIMESTAMP');
      expect(areDefaultExpressionsEquivalent('CURRENT_TIMESTAMP', 'now()')).toBe(true);
      expect(areDefaultExpressionsEquivalent('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP')).toBe(true);

      // JSON / JSONB
      expect(areDefaultExpressionsEquivalent("'[]'::jsonb", "'[]'::jsonb")).toBe(true);
      expect(areDefaultExpressionsEquivalent("'{}'::jsonb", "'{}'::jsonb")).toBe(true);
      expect(areDefaultExpressionsEquivalent(
        '\'{"app":true,"email":true}\'::jsonb', 
        '\'{"email": true, "app": true}\'::jsonb'
      )).toBe(true);
    });

    it('should strictly detect DEFAULT value mismatches when values differ semantically', () => {
      // User specific requirement: beklenen: FALSE, mevcut: TRUE
      expect(areDefaultExpressionsEquivalent('FALSE', 'true')).toBe(false);
      expect(areDefaultExpressionsEquivalent('TRUE', 'false')).toBe(false);

      // String value mismatch
      expect(areDefaultExpressionsEquivalent("'custom'", "'sensor'::character varying")).toBe(false);
      expect(areDefaultExpressionsEquivalent("'AES-256-GCM'", "'none'::character varying")).toBe(false);

      // Numeric value mismatch
      expect(areDefaultExpressionsEquivalent('30', '10')).toBe(false);
      expect(areDefaultExpressionsEquivalent('300', '60')).toBe(false);
      expect(areDefaultExpressionsEquivalent('1.0', '0')).toBe(false);

      // JSON structure mismatch
      expect(areDefaultExpressionsEquivalent(
        '\'["app","email"]\'::jsonb', 
        '\'["app"]\'::jsonb'
      )).toBe(false);

      // Date arithmetic mismatch
      expect(areDefaultExpressionsEquivalent(
        'CURRENT_TIMESTAMP', 
        '(CURRENT_TIMESTAMP + \'7 days\'::interval)'
      )).toBe(false);
    });

    it('should generate accurate fix DDL and flag MISMATCH status during schema audit', async () => {
      // Mock pool returning a table where expected default is FALSE but actual is TRUE
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ table_name: 'devices' }] };
          }
          if (sql.includes('information_schema.columns')) {
            return {
              rows: [
                {
                  table_name: 'devices',
                  column_name: 'save_simulated_data_to_db',
                  data_type: 'boolean',
                  udt_name: 'bool',
                  is_nullable: 'NO',
                  column_default: 'true',
                  default_expr: 'true',
                },
                {
                  table_name: 'devices',
                  column_name: 'id',
                  data_type: 'character varying',
                  udt_name: 'varchar',
                  is_nullable: 'NO',
                  column_default: null,
                  default_expr: null,
                },
                {
                  table_name: 'devices',
                  column_name: 'name',
                  data_type: 'character varying',
                  udt_name: 'varchar',
                  is_nullable: 'NO',
                  column_default: null,
                  default_expr: null,
                },
              ],
            };
          }
          if (sql.includes('pg_indexes')) {
            return { rows: [] };
          }
          if (sql.includes('pg_constraint')) {
            return { rows: [{ constraint_name: 'pk_devices', constraint_type: 'p', table_name: 'devices' }] };
          }
          if (sql.includes('information_schema.triggers')) {
            return { rows: [] };
          }
          if (sql.includes('information_schema.routines')) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };

      const audit = await SchemaAuditor.auditSchema(mockPool);
      const defaultMismatch = audit.discrepancies.missingConstraints.find(
        (c) => c.table === 'devices' && c.constraintName === 'df_devices_save_simulated_data_to_db'
      );

      expect(defaultMismatch).toBeDefined();
      expect(defaultMismatch?.status).toBe('MISMATCH');
      expect(defaultMismatch?.constraintType).toBe('DEFAULT');
      expect(defaultMismatch?.expectedValue).toBe('FALSE');
      expect(defaultMismatch?.actualValue).toBe('true');
      expect(defaultMismatch?.suggestedFixSql).toBe(
        'ALTER TABLE "devices" ALTER COLUMN "save_simulated_data_to_db" SET DEFAULT FALSE;'
      );
    });
  });

  describe('7. Trigger Definition & Metadata-Driven Repair Tests', () => {
    it('should generate correct DDL using TriggerDefinition properties (timing, events, level, functionName)', () => {
      const canonicalTrigger: TriggerDefinition = {
        name: 'trg_telemetry_packet_device_sync',
        timing: 'AFTER',
        events: ['INSERT'],
        level: 'ROW',
        functionName: 'fn_device_last_seen_sync',
      };

      const ddl = generateTriggerDDL('telemetry_packets', canonicalTrigger);
      expect(ddl).toContain('DROP TRIGGER IF EXISTS "trg_telemetry_packet_device_sync" ON "telemetry_packets";');
      expect(ddl).toContain('CREATE TRIGGER "trg_telemetry_packet_device_sync"');
      expect(ddl).toContain('AFTER INSERT ON "telemetry_packets"');
      expect(ddl).toContain('FOR EACH ROW');
      expect(ddl).toContain('EXECUTE FUNCTION fn_device_last_seen_sync();');

      // Verify that it does NOT contain the faulty BEFORE UPDATE
      expect(ddl).not.toContain('BEFORE UPDATE');
    });

    it('should generate compound event triggers correctly', () => {
      const compoundTrigger: TriggerDefinition = {
        name: 'trg_audit_logger',
        timing: 'AFTER',
        events: ['INSERT', 'UPDATE', 'DELETE'],
        level: 'ROW',
        functionName: 'fn_audit_recorder',
      };

      const ddl = generateTriggerDDL('devices', compoundTrigger);
      expect(ddl).toContain('AFTER INSERT OR UPDATE OR DELETE ON "devices"');
      expect(ddl).toContain('FOR EACH ROW');
      expect(ddl).toContain('EXECUTE FUNCTION fn_audit_recorder();');
    });

    it('should audit schema and detect mismatched trigger timing/event when live trigger differs from canonical metadata', async () => {
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('FROM information_schema.tables')) {
            return {
              rows: [
                { table_name: 'telemetry_packets' },
                { table_name: 'devices' },
              ],
            };
          }
          if (sql.includes('information_schema.columns')) {
            return {
              rows: [
                {
                  table_name: 'telemetry_packets',
                  column_name: 'id',
                  data_type: 'character varying',
                  udt_name: 'varchar',
                  is_nullable: 'NO',
                  column_default: null,
                  default_expr: null,
                },
              ],
            };
          }
          if (sql.includes('pg_indexes')) {
            return { rows: [] };
          }
          if (sql.includes('pg_constraint')) {
            return { rows: [] };
          }
          if (sql.includes('information_schema.triggers')) {
            // Simulate a faulty live trigger that was repaired with the old BEFORE UPDATE instead of AFTER INSERT
            return {
              rows: [
                {
                  event_object_table: 'telemetry_packets',
                  trigger_name: 'trg_telemetry_packet_device_sync',
                  action_timing: 'BEFORE',
                  event_manipulation: 'UPDATE',
                  action_orientation: 'ROW',
                  action_statement: 'EXECUTE FUNCTION fn_device_last_seen_sync()',
                },
              ],
            };
          }
          if (sql.includes('information_schema.routines')) {
            return {
              rows: [
                { routine_name: 'fn_update_updated_at_timestamp' },
                { routine_name: 'fn_cleanup_expired_records' },
                { routine_name: 'fn_device_last_seen_sync' },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const audit = await SchemaAuditor.auditSchema(mockPool);
      const triggerMismatch = audit.discrepancies.missingTriggers.find(
        (t) => t.table === 'telemetry_packets' && t.triggerName === 'trg_telemetry_packet_device_sync'
      );

      expect(triggerMismatch).toBeDefined();
      expect(triggerMismatch?.status).toBe('MISMATCH');
      expect(triggerMismatch?.timing).toBe('AFTER');
      expect(triggerMismatch?.events).toEqual(['INSERT']);
      expect(triggerMismatch?.level).toBe('ROW');
      expect(triggerMismatch?.expectedDefinition?.timing).toBe('AFTER');
      expect(triggerMismatch?.expectedDefinition?.events).toEqual(['INSERT']);
      expect(triggerMismatch?.actualDefinition?.timing).toBe('BEFORE');
      expect(triggerMismatch?.actualDefinition?.events).toEqual(['UPDATE']);
      expect(triggerMismatch?.ddl).toContain('AFTER INSERT ON "telemetry_packets"');
    });

    it('should heal mismatched trigger using canonical TriggerDefinition metadata in autoHeal', async () => {
      const executedSqls: string[] = [];
      const mockPool: any = {
        query: vi.fn(async (sql: string) => {
          executedSqls.push(sql);
          if (sql.includes('FROM information_schema.tables')) {
            return { rows: [{ table_name: 'telemetry_packets' }] };
          }
          if (sql.includes('information_schema.columns')) {
            return { rows: [] };
          }
          if (sql.includes('pg_indexes')) {
            return { rows: [] };
          }
          if (sql.includes('pg_constraint')) {
            return { rows: [] };
          }
          if (sql.includes('information_schema.triggers')) {
            return {
              rows: [
                {
                  event_object_table: 'telemetry_packets',
                  trigger_name: 'trg_telemetry_packet_device_sync',
                  action_timing: 'BEFORE',
                  event_manipulation: 'UPDATE',
                  action_orientation: 'ROW',
                  action_statement: 'EXECUTE FUNCTION fn_device_last_seen_sync()',
                },
              ],
            };
          }
          if (sql.includes('information_schema.routines')) {
            return {
              rows: [
                { routine_name: 'fn_update_updated_at_timestamp' },
                { routine_name: 'fn_cleanup_expired_records' },
                { routine_name: 'fn_device_last_seen_sync' },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const healResult = await SchemaAuditor.autoHeal(mockPool);
      expect(healResult.actionsTaken.some(a => a.includes('trg_telemetry_packet_device_sync'))).toBe(true);

      // Verify that the trigger heal step created the trigger with AFTER INSERT and NOT BEFORE UPDATE
      const triggerRepairSql = executedSqls.find(
        s => s.includes('DROP TRIGGER IF EXISTS "trg_telemetry_packet_device_sync"') && s.includes('CREATE TRIGGER')
      );
      expect(triggerRepairSql).toBeDefined();
      expect(triggerRepairSql).toContain('AFTER INSERT ON "telemetry_packets"');
      expect(triggerRepairSql).not.toContain('BEFORE UPDATE');
    });
  });
});
