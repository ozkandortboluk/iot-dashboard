import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['src/tests/vault-test-setup.ts'],
    env: { NODE_ENV: 'test', VITEST: 'true' },
    include: [
      'src/tests/system_secrets_vault.test.ts',
      'src/tests/vault_canonical_single_source.test.ts',
    ],
  },
});
