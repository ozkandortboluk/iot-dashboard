import * as fs from 'fs';
const content = fs.readFileSync('src/server/utils/telemetry.parser.ts', 'utf-8');
const lines = content.split('\n');
console.log(lines.slice(20, 80).join('\n'));
