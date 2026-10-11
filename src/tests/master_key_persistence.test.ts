import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { masterKeyProvider } from '../server/services/masterKeyProvider.js';

describe('Master key / persistent key protection', () => {
  const keyPath = path.resolve(process.cwd(), 'data', '.vault_key');
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    masterKeyProvider.resetCache();
  });

  it('fails closed if an existing development key file is invalid', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VPS_PRODUCTION;
    const realExists = fs.existsSync.bind(fs);
    const realRead = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === keyPath ? true : realExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
      String(file) === keyPath ? 'invalid' : (realRead as any)(file, ...args)
    ) as typeof fs.readFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()).toBeNull();
    expect(masterKeyProvider.getStatus().configured).toBe(false);
  });

  it('does not regenerate a key when an existing development key cannot be read', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VPS_PRODUCTION;
    const realExists = fs.existsSync.bind(fs);
    const realRead = fs.readFileSync.bind(fs);
    const write = vi.spyOn(fs, 'writeFileSync');
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === keyPath ? true : realExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) => {
      if (String(file) === keyPath) throw new Error('simulated EACCES');
      return (realRead as any)(file, ...args);
    }) as typeof fs.readFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});
