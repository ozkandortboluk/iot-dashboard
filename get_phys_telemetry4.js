import * as fs from 'fs';
const content = fs.readFileSync('src/server/services/physicalTelemetry.service.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('db.updateDevice(device.id, {'));
console.log(lines.slice(start - 5, start + 15).join('\n'));
