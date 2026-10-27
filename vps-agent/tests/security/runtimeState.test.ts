import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRuntimeCheckpoint, writeRuntimeCheckpoint } from '../../core/runtimeState.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('runtime checkpoint safety', () => {
  it('writes atomically with private mode and resumes only whitelisted state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vps-agent-state-'));
    directories.push(root);
    const directory = path.join(root, 'runtime');
    await mkdir(directory, { mode: 0o700 });
    const file = path.join(directory, 'state.json');
    const value = { schemaVersion: 1 as const, lastRunAt: '2026-10-26T13:00:00.000Z', lastCompletedCheck: 'app_readiness', lastResultStatus: 'ok' as const };
    await writeRuntimeCheckpoint(file, value);
    expect(await readRuntimeCheckpoint(file)).toEqual(value);
  });

  it('rejects secrets and arbitrary state fields', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nexus-codex-state-'));
    directories.push(root);
    const directory = path.join(root, 'runtime');
    await mkdir(directory, { mode: 0o700 });
    await expect(writeRuntimeCheckpoint(path.join(directory, 'state.json'), { schemaVersion: 1, token: 'forbidden' } as never)).rejects.toThrow();
  });

  it('refuses to write runtime state below the source tree', async () => {
    await expect(writeRuntimeCheckpoint(path.resolve('vps-agent/runtime-state.json'), { schemaVersion: 1 })).rejects.toThrow('cannot be stored inside the repository working directory');
  });
});
