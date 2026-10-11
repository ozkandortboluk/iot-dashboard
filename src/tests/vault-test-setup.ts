import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, vi } from 'vitest';

// Runs before test modules import singleton services. Refuse any environment
// that could accidentally target a live database.
const connectionVariables = ['DATABASE_URL', 'POSTGRES_URL', 'TEST_POSTGRES_URL', 'POSTGRES_HOST', 'DB_HOST', 'DATABASE_HOST'];
for (const key of connectionVariables) {
  if (process.env[key]) {
    throw new Error('Vault test isolation requires unset database connection variables');
  }
}
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Vault isolation setup requires NODE_ENV=test');
}

const isolatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-tests-'));
process.env.NEXUS_TEST_DATA_DIR = isolatedDirectory;

// Guard against unexpected attempts to open a real PostgreSQL socket.
vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<typeof import('pg')>();
  const GuardedPool = class extends original.Pool {
    constructor(...args: ConstructorParameters<typeof original.Pool>) {
      super(...args);
      throw new Error('Vault unit tests must not create a PostgreSQL pool');
    }
  };
  return { ...original, Pool: GuardedPool, default: { ...original.default, Pool: GuardedPool } };
});

afterAll(() => {
  fs.rmSync(isolatedDirectory, { recursive: true, force: true });
  delete process.env.NEXUS_TEST_DATA_DIR;
});
