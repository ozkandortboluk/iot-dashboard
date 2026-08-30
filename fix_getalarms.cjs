const fs = require('fs');

function replaceFile(path, regex, replacement) {
  let code = fs.readFileSync(path, 'utf8');
  code = code.replace(regex, replacement);
  fs.writeFileSync(path, code);
}

replaceFile('src/server/services/noDataWorker.ts',
  /broadcast\('alarms:updated', db\.getAlarms\(\)\);/g,
  `db.getAlarms().then(a => broadcast('alarms:updated', a));`
);

replaceFile('src/server/services/alarmEngine.ts',
  /return db\.getAlarms\(requestingUserId, targetCustomerId\);/g,
  `return db.getAlarms(requestingUserId, targetCustomerId);` // this is already inside async functions in alarmEngine, wait!
);

replaceFile('src/server/services/websocket.ts',
  /safeSend\(ws, JSON\.stringify\(\{ event: 'alarms:updated', payload: db\.getAlarms\(\) \}\)\);/g,
  `db.getAlarms().then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a })));`
);

replaceFile('src/server/services/websocket.ts',
  /safeSend\(ws, JSON\.stringify\(\{ event: 'alarms:updated', payload: db\.getAlarms\(user\.id, user\.id\) \}\)\);/g,
  `db.getAlarms(user.id, user.id).then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a })));`
);

replaceFile('src/server/services/websocket.ts',
  /safeSend\(client, JSON\.stringify\(\{ event, payload: db\.getAlarms\(\), timestamp: new Date\(\)\.toISOString\(\) \}\)\);/g,
  `db.getAlarms().then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() })));`
);

replaceFile('src/server/services/websocket.ts',
  /safeSend\(client, JSON\.stringify\(\{ event, payload: db\.getAlarms\(clientUser\.id, clientUser\.id\), timestamp: new Date\(\)\.toISOString\(\) \}\)\);/g,
  `db.getAlarms(clientUser.id, clientUser.id).then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() })));`
);

