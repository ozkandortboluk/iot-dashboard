const fs = require('fs');
let code = fs.readFileSync('src/server/routes/devices.ts', 'utf8');

code = code.replace(/router\.post\('\/:id\/control', authenticateUser, \(req, res\) => \{/g, "router.post('/:id/control', authenticateUser, async (req, res) => {");

code = code.replace(/deviceCommandsRouter\.post\('\/devices\/:deviceId\/commands', authenticateUser, \(req, res\) => \{/g, "deviceCommandsRouter.post('/devices/:deviceId/commands', authenticateUser, async (req, res) => {");

fs.writeFileSync('src/server/routes/devices.ts', code);
