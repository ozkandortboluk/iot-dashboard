const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/\/\/ 2\. Periodic automatic rolling backup \(once per hour\)\n      const now = Date\.now\(\);\n      if \(now - this\.lastBackupTime > 3600 \* 1000\) \{\n        this\.lastBackupTime = now;\n        this\.createBackup\(\)\.catch\(\(\) => \{\}\);\n      \}/, '// Periodic backup moved to setInterval in constructor');

fs.writeFileSync('src/server/db.ts', code);
