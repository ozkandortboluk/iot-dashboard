import * as fs from 'fs';
const content = fs.readFileSync('src/server/controllers/physicalTelemetry.controller.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('const processedDev = await db.processDeviceTelemetryArrival(device.id);'));
console.log(lines.slice(start - 20, start + 30).join('\n'));
