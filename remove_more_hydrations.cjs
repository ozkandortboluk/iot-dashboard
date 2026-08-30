const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

// Replace 9. Dispatch Logs
code = code.replace(/\/\/ 9\. Dispatch Logs([\s\S]*?)\/\/ 10\. Device Commands/g, '// 9. Dispatch Logs (Skipped - Load on demand)\n      const dispatchLogs: DispatchLogItem[] = [];\n\n      // 10. Device Commands');

// Replace 10. Device Commands
code = code.replace(/\/\/ 10\. Device Commands([\s\S]*?)\/\/ 11\. User Sessions/g, '// 10. Device Commands (Skipped - Load on demand)\n      const commands: DeviceCommand[] = [];\n\n      // 11. User Sessions');

// Leave 11 alone (User Sessions)
// Replace 12. Firmwares
code = code.replace(/\/\/ 12\. Firmwares([\s\S]*?)\/\/ 13\. OTA Deployment Jobs/g, '// 12. Firmwares (Skipped - Load on demand)\n      const firmwares: Firmware[] = [];\n\n      // 13. OTA Deployment Jobs');

// Replace 13. OTA Deployment Jobs
code = code.replace(/\/\/ 13\. OTA Deployment Jobs([\s\S]*?)return \{/g, '// 13. OTA Deployment Jobs (Skipped - Load on demand)\n      const otaJobs: OtaDeploymentJob[] = [];\n\n      return {');

fs.writeFileSync('src/server/database/postgres.ts', code);
