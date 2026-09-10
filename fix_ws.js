const fs = require('fs');
let code = fs.readFileSync('src/server/services/websocket.ts', 'utf8');

// fix the malformed lines
code = code.replace(/\.then\(\(pendingCmds\) =>  \{\(\(err: any\) => console\.error\("\[WebSocket DB Error\]:", err\.message \|\| err\)\);/g, '.then((pendingCmds) => {');
code = code.replace(/\.then\(async \(\{ addedReadings, writeAck \}\) =>  \{\(\(err: any\) => console\.error\("\[WebSocket DB Error\]:", err\.message \|\| err\)\);/g, '.then(async ({ addedReadings, writeAck }) => {');

// Add .catch() to the end of blocks if missing
// Let's just restore them correctly first
fs.writeFileSync('src/server/services/websocket.ts', code);
