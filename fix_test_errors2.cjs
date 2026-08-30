const fs = require('fs');

let code = fs.readFileSync('src/tests/alarm-engine.test.ts', 'utf8');

code = code.replace(/db\.getNotifications\(customerA\.id\)\.length/g, '(await db.getNotifications(customerA.id)).length');
code = code.replace(/db\.getNotifications\(\(customerA as any\)\.id\)\.length/g, '(await db.getNotifications((customerA as any).id)).length');
code = code.replace(/db\.getAlarms\('usr_admin'\)\.length/g, '(await db.getAlarms("usr_admin")).data?.length');
code = code.replace(/db\.getAlarms\(customerA\.id\)/g, 'await db.getAlarms(customerA.id)');
code = code.replace(/db\.getAlarms\(customerA\.id, customerA\.id\)/g, 'await db.getAlarms(customerA.id, customerA.id)');

fs.writeFileSync('src/tests/alarm-engine.test.ts', code);
