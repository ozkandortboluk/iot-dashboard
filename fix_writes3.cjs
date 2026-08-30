const fs = require('fs');
let code = fs.readFileSync('src/server/repositories/telemetry.repository.ts', 'utf8');

// just globally replace `this.db.scheduleSave();` with the if statement
// but we only want it in a few places, let's just do it directly string replace

code = code.split('this.db.scheduleSave();').join('if (!this.db.isPostgresProductionMode()) this.db.scheduleSave();');

fs.writeFileSync('src/server/repositories/telemetry.repository.ts', code);
