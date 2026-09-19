import * as fs from 'fs';
const content = fs.readFileSync('src/components/widgets/DevicesWidget.tsx', 'utf-8');
const lines = content.split('\n');
console.log(lines.slice(45, 90).join('\n'));
