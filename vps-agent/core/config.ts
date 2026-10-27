import { z } from 'zod';

const localHealthUrl = z.string().url().superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    const localHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
    if (!localHosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
      ctx.addIssue({ code: 'custom', message: 'Health URL must use a loopback host and HTTP(S).' });
    }
    if (!['/api/health/live', '/api/health/ready', '/health/live', '/health/ready'].includes(url.pathname)) {
      ctx.addIssue({ code: 'custom', message: 'Health URL path is not allowlisted.' });
    }
    if (url.username || url.password || url.search || url.hash) {
      ctx.addIssue({ code: 'custom', message: 'Health URL cannot contain credentials, query, or fragment.' });
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid health URL.' });
  }
});

const absolutePath = z.string().min(1).refine((value) => value.startsWith('/') || /^[A-Za-z]:\\/.test(value), 'Path must be absolute.');

export const monitorConfigSchema = z.object({
  mode: z.enum(['observe_only', 'propose_changes', 'isolated_test', 'approved_release']).default('observe_only'),
  timezone: z.string().default('Europe/Istanbul'),
  summaryHour: z.number().int().min(0).max(23).default(9),
  health: z.object({
    enabled: z.boolean().default(true),
    liveUrl: localHealthUrl.default('http://127.0.0.1:3000/api/health/live'),
    readyUrl: localHealthUrl.default('http://127.0.0.1:3000/api/health/ready'),
    timeoutMs: z.number().int().min(100).max(30_000).default(3_000),
    retries: z.number().int().min(0).max(3).default(1),
  }).strict().default({ enabled: true, liveUrl: 'http://127.0.0.1:3000/api/health/live', readyUrl: 'http://127.0.0.1:3000/api/health/ready', timeoutMs: 3_000, retries: 1 }),
  system: z.object({
    enabled: z.boolean().default(true),
    mountPath: absolutePath.default('/'),
    diskWarningPercent: z.number().min(1).max(99).default(80),
    diskCriticalPercent: z.number().min(2).max(100).default(90),
    memoryWarningPercent: z.number().min(1).max(99).default(80),
    memoryCriticalPercent: z.number().min(2).max(100).default(92),
    inodeWarningPercent: z.number().min(1).max(99).default(80),
    inodeCriticalPercent: z.number().min(2).max(100).default(90),
    loadWarningPerCpu: z.number().min(0.1).max(10).default(1.5),
    loadCriticalPerCpu: z.number().min(0.2).max(20).default(3),
  }).strict().default({ mountPath: '/', diskWarningPercent: 80, diskCriticalPercent: 90, memoryWarningPercent: 80, memoryCriticalPercent: 92, inodeWarningPercent: 80, inodeCriticalPercent: 90, loadWarningPerCpu: 1.5, loadCriticalPerCpu: 3, enabled: true }),
  docker: z.object({ enabled: z.boolean().default(false), expectedContainers: z.array(z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/)).max(16).default([]) }).strict().default({ enabled: false, expectedContainers: [] }),
  backup: z.object({
    enabled: z.boolean().default(false),
    allowedRoot: absolutePath,
    artifactPath: absolutePath,
    checksumPath: absolutePath,
    maxAgeHours: z.number().positive().max(24 * 365).default(30),
    maxArtifactBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024).default(2 * 1024 * 1024 * 1024),
  }).strict().optional(),
  logs: z.object({
    enabled: z.boolean().default(false),
    allowedFiles: z.array(absolutePath).max(8).default([]),
    maxBytesPerFile: z.number().int().min(1024).max(1024 * 1024).default(128 * 1024),
  }).strict().default({ enabled: false, allowedFiles: [], maxBytesPerFile: 128 * 1024 }),
  telegram: z.object({
    enabled: z.boolean().default(false),
    tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/).default('VPS_AGENT_TELEGRAM_BOT_TOKEN'),
    chatIdEnv: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/).default('VPS_AGENT_TELEGRAM_CHAT_ID'),
    dailySummaryHour: z.number().int().min(0).max(23).default(9),
  }).strict().default({ enabled: false, tokenEnv: 'VPS_AGENT_TELEGRAM_BOT_TOKEN', chatIdEnv: 'VPS_AGENT_TELEGRAM_CHAT_ID', dailySummaryHour: 9 }),
}).strict().superRefine((value, ctx) => {
  if (value.system.diskCriticalPercent <= value.system.diskWarningPercent) {
    ctx.addIssue({ code: 'custom', path: ['system', 'diskCriticalPercent'], message: 'Critical disk threshold must exceed warning threshold.' });
  }
  if (value.system.memoryCriticalPercent <= value.system.memoryWarningPercent) {
    ctx.addIssue({ code: 'custom', path: ['system', 'memoryCriticalPercent'], message: 'Critical memory threshold must exceed warning threshold.' });
  }
  if (value.system.inodeCriticalPercent <= value.system.inodeWarningPercent) {
    ctx.addIssue({ code: 'custom', path: ['system', 'inodeCriticalPercent'], message: 'Critical inode threshold must exceed warning threshold.' });
  }
  if (value.system.loadCriticalPerCpu <= value.system.loadWarningPerCpu) {
    ctx.addIssue({ code: 'custom', path: ['system', 'loadCriticalPerCpu'], message: 'Critical CPU load threshold must exceed warning threshold.' });
  }
  if (value.backup) {
    for (const [name, path] of [['artifactPath', value.backup.artifactPath], ['checksumPath', value.backup.checksumPath]] as const) {
      const root = value.backup.allowedRoot.replace(/[\\/]+$/, '');
      if (!path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) {
        ctx.addIssue({ code: 'custom', path: ['backup', name], message: 'Backup file must be under allowedRoot.' });
      }
    }
  }
});

export type MonitorConfig = z.infer<typeof monitorConfigSchema>;

export function parseMonitorConfig(input: unknown): MonitorConfig {
  return monitorConfigSchema.parse(input);
}
