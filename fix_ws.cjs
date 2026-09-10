const fs = require('fs');
let code = fs.readFileSync('src/server/services/websocket.ts', 'utf8');

// fix the malformed lines
code = code.replace(/\.then\(\(pendingCmds\) =>  \{\(\(err: any\) => console\.error\("\[WebSocket DB Error\]:", err\.message \|\| err\)\);/g, '.then((pendingCmds) => {');
code = code.replace(/\.then\(async \(\{ addedReadings, writeAck \}\) =>  \{\(\(err: any\) => console\.error\("\[WebSocket DB Error\]:", err\.message \|\| err\)\);/g, '.then(async ({ addedReadings, writeAck }) => {');

// now append .catch to the end of blocks:
// For line 668:
code = code.replace(/        \}\n      \}\);\n    \} else if/g, '        }\n      }).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));\n    } else if');

fs.writeFileSync('src/server/services/websocket.ts', code);
