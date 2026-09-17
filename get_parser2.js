import * as fs from 'fs';
const content = fs.readFileSync('src/server/utils/telemetry.parser.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('metricsToProcess.push('));
console.log(lines.slice(start - 25, start + 25).join('\n'));
