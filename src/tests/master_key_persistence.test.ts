import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { masterKeyProvider } from '../server/services/masterKeyProvider.js';

describe('Master key / persistent key protection', () => {
  const keyPath = path.resolve(process.cwd(), 'data', '.vault_key');
  const originalEnv = { ...process.env };

  // CI exports ENCRYPTION_KEY for unrelated suites. These tests isolate
  // local key-file creation, read-failure and exclusive-create behavior.
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY_PATH;
    delete process.env.ENCRYPTION_KEY_FILE;
  });

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
  it('keeps the same persisted development key after cache reset', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VPS_PRODUCTION;
    const keyHex = 'ab'.repeat(32);
    const realExists = fs.existsSync.bind(fs);
    const realRead = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === keyPath ? true : realExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
      String(file) === keyPath ? keyHex : (realRead as any)(file, ...args)
    ) as typeof fs.readFileSync);
    const write = vi.spyOn(fs, 'writeFileSync');
    masterKeyProvider.resetCache();
    const first = masterKeyProvider.getKey();
    masterKeyProvider.resetCache();
    const second = masterKeyProvider.getKey();
    expect(first?.toString('hex')).toBe(keyHex);
    expect(second?.toString('hex')).toBe(keyHex);
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the existing key when another process wins exclusive creation', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VPS_PRODUCTION;
    const keyHex = 'cd'.repeat(32);
    const realExists = fs.existsSync.bind(fs);
    const realRead = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === keyPath ? false : realExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
      String(file) === keyPath ? keyHex : (realRead as any)(file, ...args)
    ) as typeof fs.readFileSync);
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: any, ...args: any[]) => {
      if (String(file) === keyPath) {
        const err = new Error('already exists') as NodeJS.ErrnoException;
        err.code = 'EEXIST';
        throw err;
      }
      throw new Error('Unexpected write during master key test');
    }) as typeof fs.writeFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()?.toString('hex')).toBe(keyHex);
    expect(write).toHaveBeenCalledWith(keyPath, expect.any(String), expect.objectContaining({ flag: 'wx', mode: 0o600 }));
  });

  it('fails closed when persistent key creation is denied', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VPS_PRODUCTION;
    const realExists = fs.existsSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === keyPath ? false : realExists(file)
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: any) => {
      if (String(file) === keyPath) {
        const err = new Error('permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      throw new Error('Unexpected write during master key test');
    }) as typeof fs.writeFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()).toBeNull();
    expect(masterKeyProvider.getStatus().configured).toBe(false);
  });

  it('rejects missing Docker secret in production without using an environment fallback', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    const originalExists = fs.existsSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === '/run/secrets/encryption_key' ? false : originalExists(file)
    );
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()).toBeNull();
    expect(masterKeyProvider.getStatus().source).toBe('missing');
  });

  it('rejects invalid Docker secret contents in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    const originalExists = fs.existsSync.bind(fs);
    const originalRead = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === '/run/secrets/encryption_key' ? true : originalExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
      String(file) === '/run/secrets/encryption_key' ? 'invalid-key' : (originalRead as any)(file, ...args)
    ) as typeof fs.readFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()).toBeNull();
    expect(masterKeyProvider.getStatus().configured).toBe(false);
  });

  it('retains the same production Docker master key across cache resets', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    const keyHex = 'cd'.repeat(32);
    const originalExists = fs.existsSync.bind(fs);
    const originalRead = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((file: any) =>
      String(file) === '/run/secrets/encryption_key' ? true : originalExists(file)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) =>
      String(file) === '/run/secrets/encryption_key' ? keyHex : (originalRead as any)(file, ...args)
    ) as typeof fs.readFileSync);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()?.toString('hex')).toBe(keyHex);
    masterKeyProvider.resetCache();
    expect(masterKeyProvider.getKey()?.toString('hex')).toBe(keyHex);
    expect(masterKeyProvider.getStatus().source).toBe('docker_secret');
  });

});
