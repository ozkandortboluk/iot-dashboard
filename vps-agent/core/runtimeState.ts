import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export interface RuntimeCheckpoint {
  schemaVersion: 1;
  lastRunAt?: string;
  lastCompletedCheck?: string;
  lastResultStatus?: 'ok' | 'warning' | 'critical' | 'unknown';
  dailySummarySentLocalDate?: string;
}

function assertExternalRuntimePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('Runtime state cannot be stored inside the repository working directory.');
  return resolved;
}

function validateState(value: unknown): RuntimeCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid runtime state.');
  const state = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'lastRunAt', 'lastCompletedCheck', 'lastResultStatus', 'dailySummarySentLocalDate']);
  if (Object.keys(state).some((key) => !allowed.has(key)) || state.schemaVersion !== 1) throw new Error('Invalid runtime state schema.');
  if (state.lastRunAt !== undefined && (typeof state.lastRunAt !== 'string' || !Number.isFinite(Date.parse(state.lastRunAt)))) throw new Error('Invalid runtime timestamp.');
  if (state.lastCompletedCheck !== undefined && (typeof state.lastCompletedCheck !== 'string' || !/^[a-z0-9_]{1,64}$/.test(state.lastCompletedCheck))) throw new Error('Invalid runtime check identifier.');
  if (state.lastResultStatus !== undefined && !['ok', 'warning', 'critical', 'unknown'].includes(String(state.lastResultStatus))) throw new Error('Invalid runtime result status.');
  if (state.dailySummarySentLocalDate !== undefined && (typeof state.dailySummarySentLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.dailySummarySentLocalDate))) throw new Error('Invalid daily summary date.');
  return state as unknown as RuntimeCheckpoint;
}

export async function readRuntimeCheckpoint(filePath: string): Promise<RuntimeCheckpoint | undefined> {
  const resolved = assertExternalRuntimePath(filePath);
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 4_096 || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('Runtime state file permissions or size are unsafe.');
    const handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { return validateState(JSON.parse(await handle.readFile('utf8'))); }
    finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeRuntimeCheckpoint(filePath: string, input: RuntimeCheckpoint): Promise<void> {
  const resolved = assertExternalRuntimePath(filePath);
  const state = validateState(input);
  const directory = path.dirname(resolved);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || (process.platform !== 'win32' && (directoryInfo.mode & 0o077) !== 0)) throw new Error('Runtime directory must be a private, non-symlink directory.');
  const temporaryPath = path.join(directory, `.${path.basename(resolved)}.${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(state)}\n`, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    try {
      const existing = await lstat(resolved);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('Runtime state target is not a regular file.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(temporaryPath, resolved);
    await chmod(resolved, 0o600);
  } catch (error) { await unlink(temporaryPath).catch(() => undefined); throw error; }
}
