import * as fs from 'fs';
let content = fs.readFileSync('src/server/database/canonicalSchema.ts', 'utf-8');

// Replace:
// if (tableDef.rlsEnabled) {
//   ddl += `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;\n`;
// }

const regex = /if \(tableDef\.rlsEnabled\) \{\s*ddl \+= `ALTER TABLE \$\{tableName\} ENABLE ROW LEVEL SECURITY;\\n`;\s*\}/g;
const replacement = `if (tableDef.rlsEnabled) {
      ddl += \`DO \\\$\\\$ BEGIN ALTER TABLE \${tableName} ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END \\\$\\\$;\\n\`;
    }`;
content = content.replace(regex, replacement);

fs.writeFileSync('src/server/database/canonicalSchema.ts', content);
