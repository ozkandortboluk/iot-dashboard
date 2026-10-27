import { z } from 'zod';

const permissionsSchema = z.object({
  readHealth: z.boolean(),
  readHostMetrics: z.boolean(),
  readDockerStatus: z.boolean(),
  readBackupMetadata: z.boolean(),
  readAllowedLogs: z.boolean(),
  sendTelegram: z.boolean(),
  runCodexAnalysis: z.boolean(),
}).strict();

const featuresSchema = z.object({
  healthChecks: z.boolean(),
  hostMetrics: z.boolean(),
  dockerStatus: z.boolean(),
  backupChecks: z.boolean(),
  logSummary: z.boolean(),
  criticalTelegramAlerts: z.boolean(),
  dailyTelegramSummary: z.boolean(),
  codexAnalysis: z.boolean(),
}).strict();

export const adminControlConfigSchema = z.object({
  schemaVersion: z.literal(1),
  pluginEnabled: z.boolean(),
  mode: z.literal('observe_only'),
  permissions: permissionsSchema,
  features: featuresSchema,
}).strict().superRefine((value, ctx) => {
  const dependencies: Array<[boolean, boolean, string]> = [
    [value.features.healthChecks, value.permissions.readHealth, 'healthChecks'],
    [value.features.hostMetrics, value.permissions.readHostMetrics, 'hostMetrics'],
    [value.features.dockerStatus, value.permissions.readDockerStatus, 'dockerStatus'],
    [value.features.backupChecks, value.permissions.readBackupMetadata, 'backupChecks'],
    [value.features.logSummary, value.permissions.readAllowedLogs, 'logSummary'],
    [value.features.criticalTelegramAlerts || value.features.dailyTelegramSummary, value.permissions.sendTelegram, 'sendTelegram'],
    [value.features.codexAnalysis, value.permissions.runCodexAnalysis, 'codexAnalysis'],
  ];
  for (const [featureEnabled, permissionGranted, field] of dependencies) {
    if (featureEnabled && !permissionGranted) ctx.addIssue({ code: 'custom', path: ['features', field], message: 'Feature requires its matching permission.' });
  }
  if (value.features.codexAnalysis || value.permissions.runCodexAnalysis) {
    ctx.addIssue({ code: 'custom', path: ['features', 'codexAnalysis'], message: 'Codex analysis is disabled until its CLI and isolation are verified.' });
  }
  // A saved notification preference is not send approval; delivery requires a separate call-level approval.
});

export type AdminControlConfig = z.infer<typeof adminControlConfigSchema>;

export const DEFAULT_ADMIN_CONTROL_CONFIG: AdminControlConfig = {
  schemaVersion: 1,
  pluginEnabled: false,
  mode: 'observe_only',
  permissions: {
    readHealth: false,
    readHostMetrics: false,
    readDockerStatus: false,
    readBackupMetadata: false,
    readAllowedLogs: false,
    sendTelegram: false,
    runCodexAnalysis: false,
  },
  features: {
    healthChecks: false,
    hostMetrics: false,
    dockerStatus: false,
    backupChecks: false,
    logSummary: false,
    criticalTelegramAlerts: false,
    dailyTelegramSummary: false,
    codexAnalysis: false,
  },
};

export function parseAdminControlConfig(value: unknown): AdminControlConfig {
  return adminControlConfigSchema.parse(value);
}

export function readAdminControlConfig(value: unknown): AdminControlConfig {
  const parsed = adminControlConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_ADMIN_CONTROL_CONFIG;
}
