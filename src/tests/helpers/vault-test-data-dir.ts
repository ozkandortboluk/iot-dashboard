import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// This module is imported before the Vault/setup services initialize their file paths.
// Never use the checkout's persistent data/ directory for destructive filesystem tests.
if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-vitest-'));
  process.env.NEXUS_TEST_DATA_DIR = dir;
}
