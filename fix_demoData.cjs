const fs = require('fs');
let code = fs.readFileSync('src/server/db/demoData.ts', 'utf8');

code = code.replace(/  \/\/ Sync to PostgreSQL if active/, '  dbInstance.telemetryRepository.addTelemetryBatchAsync(readings).catch(() => {});\n\n  // Sync to PostgreSQL if active');

fs.writeFileSync('src/server/db/demoData.ts', code);
