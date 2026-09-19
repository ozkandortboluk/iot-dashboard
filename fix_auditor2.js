import * as fs from 'fs';

let content = fs.readFileSync('src/server/database/schemaAuditor.ts', 'utf-8');

// Update uqSql
content = content.replace(
  /const uqSql = `DO \$\$ BEGIN IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '\${uq\.name}'\) THEN ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${uq\.name}" UNIQUE \("\${uq\.columns\.join\('", "'\)}"\); END IF; END \$\$;`;/g,
  `const uqSql = \`ALTER TABLE "\${tableName}" DROP CONSTRAINT IF EXISTS "\${uq.name}"; ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${uq.name}" UNIQUE ("\${uq.columns.join('", "')}");\`;`
);

// Update fkSql
content = content.replace(
  /const fkSql = `DO \$\$ BEGIN IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '\${fk\.name}'\) THEN ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${fk\.name}" FOREIGN KEY \("\${fk\.columns\.join\('", "'\)}"\) REFERENCES "\${fk\.referencedTable}" \("\${fk\.referencedColumns\.join\('", "'\)}"\) ON DELETE \${fk\.onDelete \|\| 'NO ACTION'}; END IF; END \$\$;`;/g,
  `const fkSql = \`ALTER TABLE "\${tableName}" DROP CONSTRAINT IF EXISTS "\${fk.name}"; ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${fk.name}" FOREIGN KEY ("\${fk.columns.join('", "')}") REFERENCES "\${fk.referencedTable}" ("\${fk.referencedColumns.join('", "')}") ON DELETE \${fk.onDelete || 'NO ACTION'}\${fk.onUpdate ? ' ON UPDATE ' + fk.onUpdate : ''};\`;`
);

// Update chkSql
content = content.replace(
  /const chkSql = `DO \$\$ BEGIN IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '\${chk\.name}'\) THEN ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${chk\.name}" CHECK \(\${chk\.condition}\); END IF; END \$\$;`;/g,
  `const chkSql = \`ALTER TABLE "\${tableName}" DROP CONSTRAINT IF EXISTS "\${chk.name}"; ALTER TABLE "\${tableName}" ADD CONSTRAINT "\${chk.name}" CHECK (\${chk.condition});\`;`
);

fs.writeFileSync('src/server/database/schemaAuditor.ts', content);
