const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const match = code.match(/\/\/ Notifications(.*?)\/\/ Audit Logs/s);
if (match) {
  fs.writeFileSync('alarm_methods.ts.bak', match[1]);
} else {
  console.error("Could not find Notifications section");
}
