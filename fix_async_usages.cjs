const fs = require('fs');

function replaceFile(path, regex, replacement) {
  let code = fs.readFileSync(path, 'utf8');
  code = code.replace(regex, replacement);
  fs.writeFileSync(path, code);
}

replaceFile('src/server/services/noDataWorker.ts',
  /broadcast\('notifications:updated', db\.getNotifications\(\)\);/g,
  `db.getNotifications().then(n => broadcast('notifications:updated', n));`
);

replaceFile('src/server/services/alarmEngine.ts',
  /const tenantNotifications = db\.getNotifications\(alarm\.tenantId, alarm\.tenantId\);\s+broadcastToTenant\(alarm\.tenantId, 'notifications:updated', tenantNotifications, db\.getNotifications\(\)\);/g,
  `db.getNotifications(alarm.tenantId, alarm.tenantId).then(tenantNotifications => {
        db.getNotifications().then(allNotifs => {
          broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, allNotifs);
        });
      });`
);

replaceFile('src/server/services/websocket.ts',
  /const initialNotifications = user\.role === 'admin'\s+\? db\.getNotifications\(\)\s+: db\.getNotifications\(user\.id, user\.id\);/g,
  `const initialNotifications = user.role === 'admin' ? await db.getNotifications() : await db.getNotifications(user.id, user.id);`
);

replaceFile('src/server/services/websocket.ts',
  /safeSend\(client, JSON\.stringify\(\{ event, payload: db\.getNotifications\(\), timestamp: new Date\(\)\.toISOString\(\) \}\)\);/g,
  `db.getNotifications().then(n => safeSend(client, JSON.stringify({ event, payload: n, timestamp: new Date().toISOString() })));`
);

replaceFile('src/server/services/websocket.ts',
  /const userNotifs = db\.getNotifications\(clientUser\.id, clientUser\.id\);\s+safeSend\(client, JSON\.stringify\(\{ event, payload: userNotifs, timestamp: new Date\(\)\.toISOString\(\) \}\)\);/g,
  `db.getNotifications(clientUser.id, clientUser.id).then(userNotifs => {
          safeSend(client, JSON.stringify({ event, payload: userNotifs, timestamp: new Date().toISOString() }));
        });`
);

replaceFile('src/server/services/websocket.ts',
  /broadcast\('notifications:updated', db\.getNotifications\(\)\);/g,
  `db.getNotifications().then(n => broadcast('notifications:updated', n));`
);

replaceFile('src/server/repositories/notification.repository.ts',
  /this\.db\.notifyNotificationListeners\('notifications:updated', this\.getNotifications\(\)\);/g,
  `this.db.getNotifications().then(n => this.db.notifyNotificationListeners('notifications:updated', n));`
);

