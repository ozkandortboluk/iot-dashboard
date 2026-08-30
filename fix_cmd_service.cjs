const fs = require('fs');
let code = fs.readFileSync('src/server/services/command.service.ts', 'utf8');

code = code.replace(/public getAndDeliverPendingCommands/, 'public async getAndDeliverPendingCommands');
code = code.replace(/const pendingCommands = db\.getPendingCommands/, 'const pendingCommands = await db.getPendingCommands');
code = code.replace(/broadcast\('commands:updated', db\.getCommands\(deviceId\)\);/, "broadcast('commands:updated', await db.getCommands(deviceId));");

fs.writeFileSync('src/server/services/command.service.ts', code);
