const fs = require('fs');

let code = fs.readFileSync('src/tests/alarm-engine.test.ts', 'utf8');

// src/tests/alarm-engine.test.ts(683,68): error TS2339: Property 'length' does not exist on type 'Promise<NotificationItem[]>'.
code = code.replace(/db\.getNotifications\(\)\.length/g, '(await db.getNotifications()).length');

// src/tests/alarm-engine.test.ts(702,48): error TS2339: Property 'length' does not exist on type 'Promise<NotificationItem[]>'.
code = code.replace(/db\.getNotifications\('tenant_a', 'tenant_a'\)\.length/g, '(await db.getNotifications("tenant_a", "tenant_a")).length');

// src/tests/alarm-engine.test.ts(1042,26): error TS2339: Property 'some' does not exist on type 'Promise<any>'.
code = code.replace(/db\.getAlarms\('usr_admin'\)\.some/g, '(await db.getAlarms("usr_admin")).data?.some');

fs.writeFileSync('src/tests/alarm-engine.test.ts', code);
