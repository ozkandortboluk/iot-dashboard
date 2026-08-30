const fs = require('fs');
let code = fs.readFileSync('src/server/services/websocket.ts', 'utf8');

code = code.replace(/\.then\(\(\{ addedReadings, writeAck \}\) => \{/g, '.then(async ({ addedReadings, writeAck }) => {');

fs.writeFileSync('src/server/services/websocket.ts', code);
