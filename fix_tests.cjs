const fs = require('fs');
let code = fs.readFileSync('src/tests/alarm-engine.test.ts', 'utf8');

code = code.replace(/db\.getNotifications\(\)\.length/g, '(await db.getNotifications()).length');
code = code.replace(/db\.getNotifications\('tenant_a', 'tenant_a'\)\.length/g, '(await db.getNotifications("tenant_a", "tenant_a")).length');
code = code.replace(/db\.getAlarms\('usr_admin'\)\.some/g, '(await db.getAlarms("usr_admin")).data?.some');

fs.writeFileSync('src/tests/alarm-engine.test.ts', code);
