import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['src/codex/tests/**/*.test.ts'],
    testTimeout: 5_000,
  },
});
