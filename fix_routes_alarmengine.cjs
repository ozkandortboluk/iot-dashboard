const fs = require('fs');

let code = fs.readFileSync('src/server/routes/alarms.ts', 'utf8');

code = code.replace(/const success = alarmEngine\.acknowledge/g, "const success = await alarmEngine.acknowledge");
code = code.replace(/const success = alarmEngine\.silence/g, "const success = await alarmEngine.silence");
code = code.replace(/const success = alarmEngine\.resolve/g, "const success = await alarmEngine.resolve");

code = code.replace(/router\.post\('\/:id\/acknowledge', authenticateUser, \(req, res\) => \{/g, "router.post('/:id/acknowledge', authenticateUser, async (req, res) => {");
code = code.replace(/router\.post\('\/acknowledge-all', authenticateUser, \(req, res\) => \{/g, "router.post('/acknowledge-all', authenticateUser, async (req, res) => {");
code = code.replace(/router\.post\('\/:id\/silence', authenticateUser, \(req, res\) => \{/g, "router.post('/:id/silence', authenticateUser, async (req, res) => {");
code = code.replace(/router\.post\('\/:id\/resolve', authenticateUser, \(req, res\) => \{/g, "router.post('/:id/resolve', authenticateUser, async (req, res) => {");

fs.writeFileSync('src/server/routes/alarms.ts', code);
