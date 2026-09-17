import * as fs from 'fs';
const content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('function DeviceCard({ device'));
console.log(lines.slice(start, start + 50).join('\n'));
