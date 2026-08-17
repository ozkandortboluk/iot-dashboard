const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

// Find the devices section
const match = code.match(/\/\/ Devices(.*?)\/\/ Telemetry/s);
if (match) {
  fs.writeFileSync('device_methods.ts.bak', match[1]);
} else {
  console.error("Could not find Devices section");
}
