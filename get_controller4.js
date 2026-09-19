import * as fs from 'fs';
const content = fs.readFileSync('src/server/controllers/physicalTelemetry.controller.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('if (!parsedPayload.metrics || Object.keys(parsedPayload.metrics).length === 0)'));
console.log(lines.slice(start - 10, start + 70).join('\n'));
