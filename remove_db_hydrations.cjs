const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

// Replace these hydration blocks in db.ts
code = code.replace(/          if \(hydrated\.notifications\.length > 0\) \{\n            this\.data\.notifications = hydrated\.notifications;\n          \}\n/g, '');

code = code.replace(/          if \(hydrated\.dispatchLogs && hydrated\.dispatchLogs\.length > 0\) \{\n            this\.data\.dispatchLogs = hydrated\.dispatchLogs;\n          \}\n/g, '');

code = code.replace(/          if \(hydrated\.commands && hydrated\.commands\.length > 0\) \{\n            this\.data\.commands = hydrated\.commands;\n          \}\n/g, '');

code = code.replace(/          if \(hydrated\.otaJobs && hydrated\.otaJobs\.length > 0\) \{\n            this\.data\.otaJobs = hydrated\.otaJobs;\n          \} else if \(this\.data\.otaJobs && this\.data\.otaJobs\.length > 0\) \{\n            for \(const job of this\.data\.otaJobs\) \{\n              await this\.postgresRepo\.saveOtaJob\(job\)\.catch\(\(err\) => console\.warn\('\[PostgreSQL OtaJobs Seed Error\]', err\)\);\n            \}\n          \}\n/g, '');

code = code.replace(/          if \(hydrated\.firmwares && hydrated\.firmwares\.length > 0\) \{\n            this\.data\.firmwares = hydrated\.firmwares;\n          \} else if \(this\.data\.firmwares && this\.data\.firmwares\.length > 0\) \{\n            for \(const fw of this\.data\.firmwares\) \{\n              await this\.postgresRepo\.saveFirmware\(fw\)\.catch\(\(err\) => console\.warn\('\[PostgreSQL Firmwares Seed Error\]', err\)\);\n            \}\n          \}\n/g, '');

fs.writeFileSync('src/server/db.ts', code);
