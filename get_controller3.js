import * as fs from 'fs';
const content = fs.readFileSync('src/server/controllers/physicalTelemetry.controller.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('if (device.isSimulated) {'));
console.log(lines.slice(start, start + 70).join('\n'));
