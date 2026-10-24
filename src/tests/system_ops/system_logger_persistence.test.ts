import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { systemLogger } from '../../server/services/systemLogger.service.js';
import type { SystemEvent } from '../../types.js';

const loggerInternals = systemLogger as any;

describe('System logger persistence across restarts', () => {
  let tempDir: string;
  let originalState: Record<string, unknown>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-system-logs-'));
    originalState = {
      logDir: loggerInternals.logDir,
      logFilePath: loggerInternals.logFilePath,
      jsonBackupPath: loggerInternals.jsonBackupPath,
      inMemoryEvents: loggerInternals.inMemoryEvents,
      pendingFileWrites: loggerInternals.pendingFileWrites,
      flushTimeout: loggerInternals.flushTimeout,
      maxInMemoryEvents: loggerInternals.maxInMemoryEvents,
    };
    if (loggerInternals.flushTimeout) clearTimeout(loggerInternals.flushTimeout);
    loggerInternals.flushTimeout = null;
    loggerInternals.logDir = tempDir;
    loggerInternals.logFilePath = path.join(tempDir, 'system_events.log');
    loggerInternals.jsonBackupPath = path.join(tempDir, 'system_events.json');
    loggerInternals.inMemoryEvents = [];
    loggerInternals.pendingFileWrites = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (loggerInternals.flushTimeout) clearTimeout(loggerInternals.flushTimeout);
    Object.assign(loggerInternals, originalState);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const event = (id: string, timestamp: string, message: string): SystemEvent => ({
    id,
    timestamp,
    level: 'info',
    category: 'server',
    message,
    source: 'persistence-test',
  });

  it('recovers from a corrupt JSON snapshot and reads active plus rotated logs newest-first', () => {
    const oldest = event('oldest', '2026-10-01T10:00:00.000Z', 'rotated history');
    const middle = event('middle', '2026-10-20T10:00:00.000Z', 'active history');
    const newest = event('newest', '2026-10-24T10:00:00.000Z', 'latest active history');

    fs.writeFileSync(loggerInternals.jsonBackupPath, '{broken json', 'utf-8');
    fs.writeFileSync(
      path.join(tempDir, 'system_events_20261001.log.bak'),
      JSON.stringify(oldest) + '\n',
      'utf-8',
    );
    fs.writeFileSync(
      loggerInternals.logFilePath,
      [JSON.stringify(middle), '{partial line', JSON.stringify(newest), ''].join('\n'),
      'utf-8',
    );

    loggerInternals.loadPersistedEvents();

    expect(loggerInternals.inMemoryEvents.map((item: SystemEvent) => item.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('does not let a stale snapshot crowd out newer active-file records', () => {
    const staleA = event('stale-a', '2026-10-01T10:00:00.000Z', 'stale snapshot A');
    const staleB = event('stale-b', '2026-10-02T10:00:00.000Z', 'stale snapshot B');
    const activeA = event('active-a', '2026-10-22T10:00:00.000Z', 'active A');
    const activeB = event('active-b', '2026-10-23T10:00:00.000Z', 'active B');
    const activeC = event('active-c', '2026-10-24T10:00:00.000Z', 'active C');

    loggerInternals.maxInMemoryEvents = 3;
    fs.writeFileSync(loggerInternals.jsonBackupPath, JSON.stringify([staleB, staleA]), 'utf-8');
    fs.writeFileSync(
      loggerInternals.logFilePath,
      [activeA, activeB, activeC].map((item) => JSON.stringify(item)).join('\\n') + '\\n',
      'utf-8',
    );

    loggerInternals.loadPersistedEvents();

    expect(loggerInternals.inMemoryEvents.map((item: SystemEvent) => item.id)).toEqual([
      'active-c',
      'active-b',
      'active-a',
    ]);
  });

  it('does not rewrite the append-only source log when simplifying the in-memory list', () => {
    const first = event('first', '2026-10-24T10:00:00.000Z', '[HTTP 200] GET /assets/app.js');
    const second = event('second', '2026-10-24T10:01:00.000Z', 'Important security event');
    const originalLog = [JSON.stringify(first), JSON.stringify(second), ''].join('\n');
    fs.writeFileSync(loggerInternals.logFilePath, originalLog, 'utf-8');
    loggerInternals.inMemoryEvents = [second, first];

    systemLogger.simplifyExistingLogs();

    expect(fs.readFileSync(loggerInternals.logFilePath, 'utf-8')).toBe(originalLog);
  });

  it('retains queued log entries when appending to disk fails', () => {
    const queued = JSON.stringify(event('queued', '2026-10-24T10:02:00.000Z', 'retry this write'));
    loggerInternals.pendingFileWrites = [queued];
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
      throw new Error('simulated disk failure');
    });

    loggerInternals.flushPendingWrites();

    expect(loggerInternals.pendingFileWrites).toEqual([queued]);
    expect(loggerInternals.flushTimeout).not.toBeNull();
  });
});
