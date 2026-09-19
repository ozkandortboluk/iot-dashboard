import * as fs from 'fs';
const content = fs.readFileSync('src/server/services/physicalTelemetry.service.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('for (const m of metricsToProcess) {'));
console.log(lines.slice(start - 5, start + 35).join('\n'));
