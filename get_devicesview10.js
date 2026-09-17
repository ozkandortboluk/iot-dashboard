import * as fs from 'fs';
const content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');
const lines = content.split('\n');
console.log(lines.slice(1775, 1825).join('\n'));
