const fs = require('fs');
let code = fs.readFileSync('src/server/routes/alarms.ts', 'utf8');

code = code.replace(
  /notificationsRouter\.get\('\/', authenticateUser, \(req, res\) => \{/,
  "notificationsRouter.get('/', authenticateUser, async (req, res) => {"
);

fs.writeFileSync('src/server/routes/alarms.ts', code);
