const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/    \}\n\n    this\.ensureBackupDir\(\);\n    const timestamp = new Date\(\)\.toISOString\(\)\.replace\(\/\[:\.\]\/g, '-'\);/g, '    }\n');

fs.writeFileSync('src/server/db.ts', code);
