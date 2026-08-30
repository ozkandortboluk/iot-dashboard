const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

// 1. Remove from DatabaseSchema (if still there)
code = code.replace(/  telemetry: TelemetryReading\[\];\n/g, '');

// 2. Remove from emptyData
code = code.replace(/      telemetry: \[\],\n/g, '');

// 3. Remove hydrated.telemetry loading
code = code.replace(/          if \(hydrated\.telemetry(?:\.length > 0)?\) \{\n            this\.data\.telemetry = hydrated\.telemetry;\n          \}\n/g, '');

// 4. Delete parsed.telemetry
code = code.replace(/        if \(\!parsed\.telemetry\) parsed\.telemetry = \[\];\n/g, '        delete (parsed as any).telemetry;\n');

// 5. Update telemetryCount in server stats
code = code.replace(/telemetryCount: latestData\.telemetry\.length/g, 'telemetryCount: this.telemetryRepository.getTelemetryStats().rawBufferCurrentSize');

// 6. Update user telemetry stats
code = code.replace(/const userTelemetry = this\.data\.telemetry\.filter\(\(t\) => userDevs\.some\(\(d\) => d\.id === t\.deviceId\)\);/g, 'const userTelemetry = this.telemetryRepository.getTelemetry(undefined, undefined, 50, u.id);');

// 7. Update get telemetry fallback
code = code.replace(/let readings = this\.data\.telemetry \|\| \[\];/g, 'let readings = this.telemetryRepository.getTelemetry();');

// 8. API endpoints mapping
code = code.replace(/rawItems = this\.data\.telemetry \|\| \[\]; break;/g, 'rawItems = this.telemetryRepository.getTelemetry(); break;');
code = code.replace(/case 'telemetry_readings': case 'telemetry': collectionName = 'telemetry'; break;/g, 'case \'telemetry_readings\': case \'telemetry\': collectionName = null; break;');
code = code.replace(/telemetry_readings: this\.data\.telemetry\?\.length \|\| 0/g, 'telemetry_readings: this.telemetryRepository.getTelemetryStats().rawBufferCurrentSize');

// 9. Data retention (remove RAM array cleanup)
code = code.replace(/      const initial = this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;\n      this\.data\.telemetry = this\.data\.telemetry\.filter\(\(t\) => new Date\(t\.timestamp\)\.getTime\(\) >= cutoff\);\n      cleaned\.telemetry = initial - this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;/g, '      cleaned.telemetry = 0;');

code = code.replace(/    const initTel = this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;\n    this\.data\.telemetry = this\.data\.telemetry\.filter\(\n      \(t\) => !devicesToDelete\.some\(\(d\) => d\.id === t\.deviceId\)\n    \);\n    cleaned\.telemetry = initTel - this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;/g, '    cleaned.telemetry = 0;');

code = code.replace(/      const init = this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;\n      this\.data\.telemetry = this\.data\.telemetry\.filter\(\(t\) => new Date\(t\.timestamp\)\.getTime\(\) >= cutoff\);\n      cleaned\.telemetry = init - this\.telemetryRepository\.getTelemetryStats\(\)\.rawBufferCurrentSize;/g, '      cleaned.telemetry = 0;');


fs.writeFileSync('src/server/db.ts', code);
