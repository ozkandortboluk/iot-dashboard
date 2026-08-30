const fs = require('fs');
let code = fs.readFileSync('src/server/repositories/telemetry.repository.ts', 'utf8');

code = code.replace(/    this\.db\.scheduleSave\(\);\n    return \{/g, '    if (!this.db.isPostgresProductionMode()) {\n      this.db.scheduleSave();\n    }\n    return {');

// Same for `return reading;`
code = code.replace(/    this\.db\.scheduleSave\(\);\n    return fullReading;/g, '    if (!this.db.isPostgresProductionMode()) {\n      this.db.scheduleSave();\n    }\n    return fullReading;');

fs.writeFileSync('src/server/repositories/telemetry.repository.ts', code);
