const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const match = code.match(/\/\/ Audit Logs(.*?)\/\/ System Config/s);
if (match) {
  fs.writeFileSync('system_methods.ts.bak', match[1]);
} else {
  console.error("Could not find Audit Logs section");
}
