import * as fs from 'fs';
const content = fs.readFileSync('src/server/database/postgres.ts', 'utf-8');
const lines = content.split('\n');
const startIndex = lines.findIndex(l => l.includes('savePhysicalTelemetryBatchInTransaction'));
console.log(lines.slice(startIndex, startIndex + 50).join('\n'));
