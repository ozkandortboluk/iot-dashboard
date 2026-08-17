const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const match = code.match(/\/\/ Telemetry(.*?)\/\/ Notifications/s);
if (match) {
  fs.writeFileSync('telemetry_methods.ts.bak', match[1]);
} else {
  console.error("Could not find Telemetry section");
}
