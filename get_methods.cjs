const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const regex = /public ([a-zA-Z]+)\(/g;
let match;
while ((match = regex.exec(code)) !== null) {
  console.log(match[1]);
}
