import * as fs from 'fs';
const content = fs.readFileSync('src/server/services/deviceWsProtocol.service.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('async handleTelemetry'));
console.log(lines.slice(start, start + 50).join('\n'));
