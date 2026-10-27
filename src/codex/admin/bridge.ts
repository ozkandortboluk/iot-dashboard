import type { MonitorConfig } from '../core/config.js';
import type { AdminControlConfig } from './controlConfig.js';

/** Applies admin preferences to a host-owned monitor config without expanding its paths or network scope. */
export function applyAdminControlConfig(base: MonitorConfig, control: AdminControlConfig): MonitorConfig {
  return {
    ...base,
    mode: 'observe_only',
    health: { ...base.health, enabled: control.pluginEnabled && control.permissions.readHealth && control.features.healthChecks },
    system: { ...base.system, enabled: control.pluginEnabled && control.permissions.readHostMetrics && control.features.hostMetrics },
    docker: { ...base.docker, enabled: control.pluginEnabled && control.permissions.readDockerStatus && control.features.dockerStatus },
    backup: base.backup ? { ...base.backup, enabled: control.pluginEnabled && control.permissions.readBackupMetadata && control.features.backupChecks } : undefined,
    logs: { ...base.logs, enabled: control.pluginEnabled && control.permissions.readAllowedLogs && control.features.logSummary },
    telegram: {
      ...base.telegram,
      enabled: control.pluginEnabled && control.permissions.sendTelegram && (control.features.criticalTelegramAlerts || control.features.dailyTelegramSummary),
    },
  };
}
