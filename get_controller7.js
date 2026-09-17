import * as fs from 'fs';
const content = fs.readFileSync('src/server/controllers/physicalTelemetry.controller.ts', 'utf-8');
const lines = content.split('\n');
console.log(lines.slice(220, 260).join('\n'));
