import * as fs from 'fs';
let content = fs.readFileSync('src/server/database/schemaAuditor.ts', 'utf-8');

const regex = /const normalize =[^\n]+/g;
const replacement = `const normalize = (str: string) => str.toLowerCase().replace(/[\\s"']/g, '').replace(/::\\w+(\\[\\])?/g, '').replace(/=any\\(array\\[/g, 'in(').replace(/\\]\\)/g, ')').replace(/\\]/g, '').replace(/\\[/g, '');`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/server/database/schemaAuditor.ts', content);
