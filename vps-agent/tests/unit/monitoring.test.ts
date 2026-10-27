import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpHealthChecker } from '../../monitoring/httpHealth.js';
import { DockerReadOnlyHttpReader, DockerStatusChecker } from '../../monitoring/dockerStatus.js';
import { BackupArtifactChecker } from '../../monitoring/backupArtifact.js';
import { AllowedLogSummaryChecker } from '../../monitoring/allowedLogs.js';
import { runChecker } from '../../core/runner.js';
import { withInstanceLock } from '../../core/lock.js';
import { parseMonitorConfig } from '../../core/config.js';
import { createReadOnlyCheckers } from '../../operations/checkFactory.js';

const tempDirs: string[] = [];
afterEach(async () => { await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function tempDir() { const dir = await mkdtemp(path.join(os.tmpdir(), 'nexus-codex-test-')); tempDirs.push(dir); return dir; }
const context = { signal: new AbortController().signal, now: () => new Date('2026-10-26T10:00:00.000Z') };

describe('read-only monitoring checks', () => {
  it('reads health status only and cancels response body without retaining it', async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response('secret-bearing-body', { status: 503 }) as Response);
    const checker = new HttpHealthChecker('http://127.0.0.1:3000/api/health/ready', fetcher);
    const result = await checker.run(context);
    expect(result.status).toBe('critical');
    expect(result.summary).toBe('health_http_unavailable');
    expect(JSON.stringify(result)).not.toContain('secret-bearing-body');
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'GET', redirect: 'error' }));
    void cancel;
  });

  it('checks expected containers through a loopback read-only proxy only', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      { Names: ['/nexus_app'], State: 'running' },
      { Names: ['/nexus_timescaledb'], State: 'running' },
    ]), { status: 200 }));
    const reader = new DockerReadOnlyHttpReader('http://127.0.0.1:2375/', fetcher);
    const result = await new DockerStatusChecker(['nexus_app', 'nexus_timescaledb'], reader).run(context);
    expect(result.status).toBe('ok');
    expect(fetcher).toHaveBeenCalledWith(new URL('http://127.0.0.1:2375/containers/json?all=1&limit=100'), expect.objectContaining({ method: 'GET', redirect: 'error' }));
    expect(() => new DockerReadOnlyHttpReader('http://example.com:2375/')).toThrow('docker_proxy_url_must_be_loopback_http');
  });

  it('verifies only a single allowed artifact checksum', async () => {
    const dir = await tempDir();
    const artifactPath = path.join(dir, 'backup.archive.age');
    const checksumPath = path.join(dir, 'backup.archive.age.sha256');
    const bytes = 'encrypted-fixture';
    const { createHash } = await import('node:crypto');
    await writeFile(artifactPath, bytes);
    await writeFile(checksumPath, `${createHash('sha256').update(bytes).digest('hex')}  backup.archive.age\n`);
    const result = await new BackupArtifactChecker({ allowedRoot: dir, artifactPath, checksumPath, maxAgeHours: 24, maxArtifactBytes: 1000 }).run(context);
    expect(result.status).toBe('ok');
    expect(await readFile(artifactPath, 'utf8')).toBe(bytes);
  });

  it('returns unsupported for secret-bearing artifact names', async () => {
    const dir = await tempDir();
    const artifactPath = path.join(dir, 'encryption_key.backup');
    const checksumPath = `${artifactPath}.sha256`;
    await writeFile(artifactPath, 'fixture');
    await writeFile(checksumPath, `${'a'.repeat(64)}  encryption_key.backup`);
    const result = await new BackupArtifactChecker({ allowedRoot: dir, artifactPath, checksumPath, maxAgeHours: 24, maxArtifactBytes: 1000 }).run(context);
    expect(result.summary).toBe('backup_artifact_name_not_allowed');
  });

  it('counts error markers but never returns log lines', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'app.log');
    await writeFile(file, 'ERROR token=super-secret\nINFO ok\n');
    const result = await new AllowedLogSummaryChecker({ files: [file], maxBytesPerFile: 2048 }).run(context);
    expect(result.metrics?.errorLines).toBe(1);
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });

  it('times out a checker, retries within bounds, and uses a safe error code', async () => {
    let calls = 0;
    const checker = { id: 'slow', async run() { calls += 1; return new Promise<never>(() => undefined); } };
    const result = await runChecker(checker, { timeoutMs: 10, retries: 1, retryDelayMs: 1 });
    expect(calls).toBe(2);
    expect(result.summary).toBe('timeout');
    expect(result.status).toBe('unknown');
  });

  it('prevents concurrent runs while lock exists', async () => {
    const dir = await tempDir();
    const lock = path.join(dir, 'monitor.lock');
    let release!: () => void;
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const held = withInstanceLock(lock, () => new Promise<void>((resolve) => { release = resolve; markEntered(); }));
    await entered;
    await expect(withInstanceLock(lock, async () => undefined)).rejects.toThrow();
    release();
    await held;
  });

  it('wires only enabled read-only checks and rejects unsupported modes', () => {
    const config = parseMonitorConfig({ mode: 'observe_only', system: { enabled: false }, health: { enabled: true } });
    expect(createReadOnlyCheckers(config).map((checker) => checker.id)).toEqual(['app_liveness', 'database_readiness']);
    const unsupported = parseMonitorConfig({ mode: 'propose_changes' });
    expect(() => createReadOnlyCheckers(unsupported)).toThrow('observe_only');

  });
});
