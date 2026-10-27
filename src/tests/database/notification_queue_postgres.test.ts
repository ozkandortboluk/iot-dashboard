import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { runAllMigrations } from '../../server/database/migrations/migrationRunner.js';
import { PostgresRepository } from '../../server/database/postgres.js';
import type { NotificationQueueItem } from '../../types.js';

const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe('PostgreSQL durable notification queue', () => {
  const adminPool = connectionString ? new pg.Pool({ connectionString }) : null;
  let queuePool: pg.Pool | null = null;
  let schemaName: string | null = null;

  afterAll(async () => {
    await queuePool?.end().catch(() => {});
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`).catch(() => {});
    }
    await adminPool?.end().catch(() => {});
  });

  it('claims work once across workers and recovers expired leases after a restart', async () => {
    if (!connectionString || !adminPool) return;
    schemaName = `nq_${randomUUID().replace(/-/g, '')}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}";`);
    queuePool = new pg.Pool({ connectionString, options: `-c search_path=${schemaName},public` });

    const migration = await runAllMigrations(queuePool);
    expect(migration.success).toBe(true);

    const workerA = new PostgresRepository(queuePool);
    const workerB = new PostgresRepository(queuePool);
    (workerA as any).isConnected = true;
    (workerB as any).isConnected = true;

    const prefix = `q_it_${randomUUID().replace(/-/g, '')}`;
    const makeItem = (suffix: string): NotificationQueueItem => ({
      id: `${prefix}_${suffix}`,
      tenantId: 'usr_queue_test',
      userName: 'Queue Integration',
      channel: 'email',
      recipient: 'queue@example.test',
      title: 'Queue persistence test',
      message: 'Lease and recovery',
      severity: 'warning',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      const batch = Array.from({ length: 8 }, (_, index) => makeItem(`parallel_${index}`));
      for (const item of batch) await workerA.enqueueNotificationQueueItem(item);

      const [claimedA, claimedB] = await Promise.all([
        workerA.claimNotificationQueueItems('worker-a', 8, 30_000),
        workerB.claimNotificationQueueItems('worker-b', 8, 30_000),
      ]);
      const claimedIds = [...claimedA, ...claimedB].map((item) => item.id);
      expect(claimedIds).toHaveLength(batch.length);
      expect(new Set(claimedIds).size).toBe(batch.length);
      expect(claimedA.some((a) => claimedB.some((b) => b.id === a.id))).toBe(false);

      const recoveryItem = makeItem('recovery');
      await workerA.enqueueNotificationQueueItem(recoveryItem);
      const firstClaim = await workerA.claimNotificationQueueItems('old-process', 1, 1000);
      expect(firstClaim.map((item) => item.id)).toContain(recoveryItem.id);
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const recovered = await workerB.claimNotificationQueueItems('replacement-process', 1, 30_000);
      expect(recovered).toHaveLength(1);
      expect(recovered[0].id).toBe(recoveryItem.id);
      expect(recovered[0].attempts).toBe(2);

      const completed = await workerB.completeNotificationQueueItem(recoveryItem.id, 'replacement-process', { success: true });
      expect(completed?.status).toBe('sent');
      expect(await workerA.claimNotificationQueueItems('worker-c', 1, 30_000)).toHaveLength(0);
    } finally {
      await queuePool.query('DELETE FROM notification_queue WHERE id LIKE $1;', [`${prefix}%`]).catch(() => {});
    }
  }, 120_000);
});
