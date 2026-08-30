const fs = require('fs');
let code = fs.readFileSync('src/server/routes/devices.ts', 'utf8');

code = code.replace(/db\.getCommands\(/g, 'await db.getCommands(');
code = code.replace(/db\.getPendingCommands\(/g, 'await db.getPendingCommands(');
code = code.replace(/deviceCommandsRouter\.get\('\/devices\/:deviceId\/commands', authenticateUser, \(req, res\) => \{/g, "deviceCommandsRouter.get('/devices/:deviceId/commands', authenticateUser, async (req, res) => {");
code = code.replace(/deviceCommandsRouter\.get\('\/device\/commands', \(req, res\) => \{/g, "deviceCommandsRouter.get('/device/commands', async (req, res) => {");

fs.writeFileSync('src/server/routes/devices.ts', code);
