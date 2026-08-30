const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

// Modify the return type of hydrateFromPostgres
code = code.replace(/    dashboards: DashboardLayout\[\];\n    notifications: NotificationItem\[\];\n    auditLogs: AuditLog\[\];\n    telemetry\?: TelemetryReading\[\];\n    dispatchLogs\?: DispatchLogItem\[\];\n    commands\?: DeviceCommand\[\];\n    sessions\?: any\[\];\n    firmwares\?: Firmware\[\];\n    otaJobs\?: OtaDeploymentJob\[\];\n/g, '    dashboards: DashboardLayout[];\n    sessions?: any[];\n');

// Modify the return statement of hydrateFromPostgres
code = code.replace(/      return \{\n        users,\n        passwords,\n        devices,\n        rules,\n        alarms,\n        dashboards,\n        notifications,\n        auditLogs,\n        telemetry,\n        dispatchLogs,\n        commands,\n        sessions,\n        firmwares,\n        otaJobs,\n      \};\n/g, '      return {\n        users,\n        passwords,\n        devices,\n        rules,\n        alarms,\n        dashboards,\n        sessions,\n      };\n');

// Also remove the array declarations in hydrateFromPostgres to prevent "unused variable" TS errors
code = code.replace(/\/\/ 6\. Notifications \(Skipped - Load on demand\)\n      const notifications: NotificationItem\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 7\. Audit Logs \(Skipped - Load on demand\)\n      const auditLogs: AuditLog\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 8\. Latest Telemetry \(Skipped - Load on demand\)\n      const telemetry: TelemetryReading\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 9\. Dispatch Logs \(Skipped - Load on demand\)\n      const dispatchLogs: DispatchLogItem\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 10\. Device Commands \(Skipped - Load on demand\)\n      const commands: DeviceCommand\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 12\. Firmwares \(Skipped - Load on demand\)\n      const firmwares: Firmware\[\] = \[\];\n\n/g, '');
code = code.replace(/\/\/ 13\. OTA Deployment Jobs \(Skipped - Load on demand\)\n      const otaJobs: OtaDeploymentJob\[\] = \[\];\n\n/g, '');

fs.writeFileSync('src/server/database/postgres.ts', code);
