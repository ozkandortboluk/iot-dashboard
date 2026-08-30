const fs = require('fs');
let code = fs.readFileSync('src/server/routes/devices.ts', 'utf8');

code = code.replace(/const queuedCmd = db\.addCommand\(/g, 'const queuedCmd = await db.addCommand(');
code = code.replace(/const newCmd = db\.addCommand\(/g, 'const newCmd = await db.addCommand(');

fs.writeFileSync('src/server/routes/devices.ts', code);
