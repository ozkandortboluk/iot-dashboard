import { open, unlink } from 'node:fs/promises';

/** Exclusive lock; stale locks are never removed automatically after interruption. */
export async function withInstanceLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  const handle = await open(lockPath, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await handle.sync();
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  }
}
