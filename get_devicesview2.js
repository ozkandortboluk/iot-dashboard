import * as fs from 'fs';
const content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('return ('));
console.log(lines.slice(start + 250, start + 300).join('\n'));
