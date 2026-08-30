const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

// Replace the sections fetching these tables with simple empty arrays.
// 6. Notifications
code = code.replace(/\/\/ 6\. Notifications([\s\S]*?)\/\/ 7\. Audit Logs/g, '// 6. Notifications (Skipped - Load on demand)\n      const notifications: NotificationItem[] = [];\n\n      // 7. Audit Logs');

// 7. Audit Logs
code = code.replace(/\/\/ 7\. Audit Logs([\s\S]*?)\/\/ 8\. Latest Telemetry/g, '// 7. Audit Logs (Skipped - Load on demand)\n      const auditLogs: AuditLog[] = [];\n\n      // 8. Latest Telemetry');

// 8. Latest Telemetry
code = code.replace(/\/\/ 8\. Latest Telemetry \(Strictly Physical Production Data\)([\s\S]*?)\/\/ 9\. Dispatch Logs/g, '// 8. Latest Telemetry (Skipped - Load on demand)\n      const telemetry: TelemetryReading[] = [];\n\n      // 9. Dispatch Logs');

// 9. Dispatch Logs
code = code.replace(/\/\/ 9\. Dispatch Logs([\s\S]*?)\/\/ 10\. Commands/g, '// 9. Dispatch Logs (Skipped - Load on demand)\n      const dispatchLogs: DispatchLogItem[] = [];\n\n      // 10. Commands');

// 10. Commands
code = code.replace(/\/\/ 10\. Commands([\s\S]*?)\/\/ 11\. Sessions/g, '// 10. Commands (Skipped - Load on demand)\n      const commands: DeviceCommand[] = [];\n\n      // 11. Sessions');

// 12. Firmwares
code = code.replace(/\/\/ 12\. Firmwares([\s\S]*?)\/\/ 13\. OTA Jobs/g, '// 12. Firmwares (Skipped - Load on demand)\n      const firmwares: Firmware[] = [];\n\n      // 13. OTA Jobs');

// 13. OTA Jobs
code = code.replace(/\/\/ 13\. OTA Jobs([\s\S]*?)return \{/g, '// 13. OTA Jobs (Skipped - Load on demand)\n      const otaJobs: OtaDeploymentJob[] = [];\n\n      return {');

fs.writeFileSync('src/server/database/postgres.ts', code);
