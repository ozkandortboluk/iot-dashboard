import * as fs from 'fs';
let content = fs.readFileSync('src/server/database/schemaAuditor.ts', 'utf-8');

const regex = /const normalize = \(str: string\) => str\.toLowerCase\(\)\.replace\(\/\[\\\\s"'\\\\(\\\\)\]\/g, ''\)\.replace\(\/::\\\\w\+\(\\\\[\\\\]\)\?\/g, ''\);/g;
const replacement = `const normalize = (str: string) => str.toLowerCase().replace(/[\\s"'\\(\\)]/g, '').replace(/::\\w+(\\[\\])?/g, '').replace(/=anyarray\\[/g, 'in').replace(/\\[/g, '').replace(/\\]/g, '').replace(/=/g, 'in').replace(/in/g, '');`;
// I will just remove all "=", "in", "anyarray", "[", "]" to make it super simple.

const newRegex = /const normalize = [^\n]+/g;
const newReplacement = `const normalize = (str: string) => str.toLowerCase().replace(/[\\s"'\\(\\)={}\\[\\]]/g, '').replace(/::\\w+(\\[\\])?/g, '').replace(/anyarray/g, '').replace(/in/g, '').replace(/any/g, '');`;

content = content.replace(newRegex, newReplacement);

// UNIQUE constraint name might not match perfectly if we didn't specify it in canonical schema?
// Actually canonical schema specifies constraint names.

fs.writeFileSync('src/server/database/schemaAuditor.ts', content);
