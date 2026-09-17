import * as fs from 'fs';
const content = fs.readFileSync('src/server/services/deviceWsProtocol.service.ts', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('const batchRes = await db.addTelemetryBatchAsync(readingsToInsert);'));
console.log(lines.slice(start - 20, start + 30).join('\n'));
