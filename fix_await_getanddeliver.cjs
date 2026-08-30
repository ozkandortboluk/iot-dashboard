const fs = require('fs');

function fixFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/const commands = commandService\.getAndDeliverPendingCommands/g, 'const commands = await commandService.getAndDeliverPendingCommands');
  fs.writeFileSync(file, code);
}

fixFile('src/server/controllers/simulationTelemetry.controller.ts');
fixFile('src/server/controllers/physicalTelemetry.controller.ts');
fixFile('src/server/services/websocket.ts');

