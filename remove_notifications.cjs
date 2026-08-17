const fs = require('fs');

let code = fs.readFileSync('src/server/repositories/alarm.repository.ts', 'utf8');

// The methods to remove are from getNotifications to resetDashboard
code = code.replace(/  public getNotifications[\s\S]*?public getAlarms/, '  public getAlarms');

fs.writeFileSync('src/server/repositories/alarm.repository.ts', code);
