const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

code = code.replace(/        auditLogs,\n        dispatchLogs,/g, '        auditLogs,\n        telemetry,\n        dispatchLogs,');

fs.writeFileSync('src/server/database/postgres.ts', code);
