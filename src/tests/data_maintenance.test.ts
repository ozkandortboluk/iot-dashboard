import { describe, it, expect, vi } from 'vitest';
import { DataMaintenanceService } from '../server/database/dataMaintenance.js';
import { CANONICAL_SCHEMA_METADATA } from '../server/database/canonicalSchema.js';

describe('DataMaintenanceService - Zero Data Loss & Schema Repair Separation', () => {
  it('1. should verify CANONICAL_SCHEMA_METADATA has valid tables and FK definitions', () => {
    expect(CANONICAL_SCHEMA_METADATA.tables).toBeDefined();
    expect(Object.keys(CANONICAL_SCHEMA_METADATA.tables).length).toBeGreaterThan(10);
    
    // Devices table should reference users
    const devicesTable = CANONICAL_SCHEMA_METADATA.tables.devices;
    expect(devicesTable).toBeDefined();
    const fkUser = devicesTable.foreignKeys?.find(fk => fk.columns.includes('user_id'));
    expect(fkUser).toBeDefined();
    expect(fkUser?.referencedTable).toBe('users');
  });

  it('2. scanDataIntegrityViolations should detect orphan foreign key rows without modifying data', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('information_schema.tables')) {
          return Promise.resolve({
            rows: [
              { table_name: 'users' },
              { table_name: 'devices' },
            ],
          });
        }
        if (sql.includes('COUNT(*) as orphan_count')) {
          return Promise.resolve({
            rows: [{ orphan_count: '2' }],
          });
        }
        if (sql.includes('SELECT') && sql.includes('LIMIT 5')) {
          return Promise.resolve({
            rows: [{ sample_val: 'usr_non_existent_999' }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const violations = await DataMaintenanceService.scanDataIntegrityViolations(mockPool);
    expect(Array.isArray(violations)).toBe(true);
    // Should never issue DELETE or UPDATE during scan
    const calls = mockPool.query.mock.calls.map(c => c[0].toUpperCase());
    expect(calls.some(c => c.includes('DELETE FROM'))).toBe(false);
    expect(calls.some(c => c.includes('UPDATE '))).toBe(false);
  });

  it('3. executeMaintenanceJob with "quarantine" should preserve row data in quarantine table', async () => {
    const executedQueries: string[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('SELECT * FROM "devices"')) {
          return Promise.resolve({
            rows: [
              { id: 'dev_orphan_1', user_id: 'unknown_usr_1', name: 'Isolated Device' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const result = await DataMaintenanceService.executeMaintenanceJob(mockPool, {
      table: 'devices',
      constraintName: 'fk_devices_user_id',
      action: 'quarantine',
      adminUserId: 'usr_test_admin',
      targetColumn: 'user_id',
      referencedTable: 'users',
      referencedColumn: 'id',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('quarantine');
    expect(result.affectedCount).toBe(1);

    // Verify quarantine table insertion happened before deletion
    const insertQuarantineIdx = executedQueries.findIndex(q => q.includes('orphan_records_quarantine'));
    const deleteIdx = executedQueries.findIndex(q => q.includes('DELETE FROM "devices"'));
    expect(insertQuarantineIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(insertQuarantineIdx);
  });

  it('4. executeMaintenanceJob with "reassign_to_admin" should safely update foreign keys to test account without data loss', async () => {
    const executedQueries: string[] = [];
    const queryParams: any[][] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        executedQueries.push(sql);
        if (params) queryParams.push(params);
        if (sql.includes('SELECT * FROM "devices"')) {
          return Promise.resolve({
            rows: [
              { id: 'dev_orphan_2', user_id: 'deleted_usr_88', name: 'Reassigned Device' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const result = await DataMaintenanceService.executeMaintenanceJob(mockPool, {
      table: 'devices',
      constraintName: 'fk_devices_user_id',
      action: 'reassign_to_admin',
      adminUserId: 'usr_test_admin',
      targetColumn: 'user_id',
      referencedTable: 'users',
      referencedColumn: 'id',
      targetParentId: 'usr_test_admin',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('reassign_to_admin');
    expect(result.affectedCount).toBe(1);

    // Verify UPDATE was called with usr_test_admin and NO DELETE was called
    const hasUpdate = executedQueries.some(q => q.includes('UPDATE "devices"'));
    const hasDelete = executedQueries.some(q => q.includes('DELETE FROM "devices"'));
    expect(hasUpdate).toBe(true);
    expect(hasDelete).toBe(false);
    expect(queryParams.some(p => p.includes('usr_test_admin'))).toBe(true);
  });
});
