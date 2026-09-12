import type pg from 'pg';

export interface Migration {
  version: string;
  name: string;
  up: (client: pg.PoolClient) => Promise<void>;
  down?: (client: pg.PoolClient) => Promise<void>;
}

export interface AppliedMigration {
  version: string;
  name: string;
  applied_at: string;
  checksum?: string;
}

export interface MigrationStatus {
  isLocked: boolean;
  appliedCount: number;
  pendingCount: number;
  latestVersion: string | null;
  migrations: {
    version: string;
    name: string;
    applied: boolean;
    appliedAt?: string;
  }[];
  hasFailed: boolean;
  lastError?: string;
}
