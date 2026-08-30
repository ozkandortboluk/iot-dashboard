const fs = require('fs');
let code = fs.readFileSync('src/server/routes/system.ts', 'utf8');

code = code.replace(/databaseRouter\.post\('\/backup', authenticateUser, requireAdmin, \(req, res\) => \{\n  const result = db\.createBackup\(\);/g, 'databaseRouter.post(\'/backup\', authenticateUser, requireAdmin, async (req, res) => {\n  const result = await db.createBackup();');

fs.writeFileSync('src/server/routes/system.ts', code);
