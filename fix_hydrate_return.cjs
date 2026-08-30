const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

code = code.replace(/    auditLogs: AuditLog\[\];\n    dispatchLogs\?: DispatchLogItem\[\];/g, '    auditLogs: AuditLog[];\n    telemetry?: TelemetryReading[];\n    dispatchLogs?: DispatchLogItem[];');

fs.writeFileSync('src/server/database/postgres.ts', code);
