const fs = require('fs');
const map = JSON.parse(fs.readFileSync('dist/server.cjs.map', 'utf8'));
const idx = map.sources.findIndex(s => s.endsWith('server.ts'));
if(idx > -1) {
  fs.writeFileSync('server.ts', map.sourcesContent[idx]);
  console.log("Restored server.ts");
} else {
  console.log("Could not find server.ts in sources");
}
