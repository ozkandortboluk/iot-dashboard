import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(resolved);
    return /\.(ts|json)$/.test(entry.name) ? [resolved] : [];
  }));
  return nested.flat();
}

describe('source safety scan', () => {
  it('contains no token-shaped literals or shell/process execution adapter', async () => {
    const root = path.resolve('src/codex');
    const files = (await listFiles(root)).filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
    const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
    expect(source).not.toMatch(/\b\d{6,}:[A-Za-z0-9_-]{25,}\b/);
    expect(source).not.toMatch(/from\s+['"]node:(?:child_process|net|tls)['"]/);
    expect(source).not.toMatch(/\b(?:exec|execSync|spawn|spawnSync)\s*\(/);
  });
});
