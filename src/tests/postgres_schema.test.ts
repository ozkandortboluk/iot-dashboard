import { describe, it, expect, vi } from 'vitest';
import { postgresSchemaSQL } from '../server/database/schema.js';
import { PostgresRepository } from '../server/database/postgres.js';
import { db } from '../server/db.js';

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
});
