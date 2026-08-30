const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/    this\.data\.telemetry = this\.data\.telemetry\.filter\(\n      \(t\) => \!devicesToDelete\.some\(\(d\) => d\.id === t\.deviceId\)\n    \);\n    cleaned\.telemetry = initTel - this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;/g, '    cleaned.telemetry = 0;');

fs.writeFileSync('src/server/db.ts', code);
