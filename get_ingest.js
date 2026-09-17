import * as fs from 'fs';
const content = fs.readFileSync('src/server/repositories/telemetry.repository.ts', 'utf-8');
const lines = content.split('\n');
const startIndex = lines.findIndex(l => l.includes('async processHardwareTelemetry'));
console.log(lines.slice(startIndex, startIndex + 50).join('\n'));
