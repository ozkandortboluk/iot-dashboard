import * as fs from 'fs';

let content = fs.readFileSync('src/server/database/schemaAuditor.ts', 'utf-8');

// Replace UNIQUE
const uniqueRegex = /const exists = liveConstraintNames\.has\(uq\.name\) \|\| tableConstraints\.some\(\(c\) => c\.type === 'u'\);/g;
const uniqueReplacement = `const exists = tableConstraints.some((c) => {
            if (c.type !== 'u') return false;
            if (c.name !== uq.name) return false;
            const match = c.def.match(/UNIQUE\\s*\\(([^)]+)\\)/i);
            if (match) {
              const cols = match[1].split(',').map(s => s.trim().replace(/"/g, ''));
              if (cols.join(',') !== uq.columns.join(',')) return false;
            }
            return true;
          });`;
content = content.replace(uniqueRegex, uniqueReplacement);

// Replace FOREIGN KEY
const fkRegex = /const exists = liveConstraintNames\.has\(fk\.name\) \|\| tableConstraints\.some\(\(c\) => c\.type === 'f' && c\.foreignTable === fk\.referencedTable\);/g;
const fkReplacement = `const exists = tableConstraints.some((c) => {
            if (c.type !== 'f') return false;
            if (c.name !== fk.name) return false;
            if (c.foreignTable !== fk.referencedTable) return false;
            
            const match = c.def.match(/FOREIGN KEY\\s*\\(([^)]+)\\)\\s*REFERENCES\\s*[^(]+\\(([^)]+)\\)/i);
            if (match) {
              const cols = match[1].split(',').map(s => s.trim().replace(/"/g, ''));
              if (cols.join(',') !== fk.columns.join(',')) return false;
              
              const refCols = match[2].split(',').map(s => s.trim().replace(/"/g, ''));
              if (refCols.join(',') !== fk.referencedColumns.join(',')) return false;
            }
            
            if (fk.onDelete) {
              if (!c.def.toUpperCase().includes(\`ON DELETE \${fk.onDelete}\`)) return false;
            } else {
              if (c.def.toUpperCase().includes('ON DELETE CASCADE') || c.def.toUpperCase().includes('ON DELETE SET NULL')) return false;
            }
            
            if (fk.onUpdate) {
              if (!c.def.toUpperCase().includes(\`ON UPDATE \${fk.onUpdate}\`)) return false;
            }
            
            return true;
          });`;
content = content.replace(fkRegex, fkReplacement);

// Replace CHECK
const checkRegex = /const exists = liveConstraintNames\.has\(chk\.name\) \|\| tableConstraints\.some\(\(c\) => c\.type === 'c'\);/g;
const checkReplacement = `const exists = tableConstraints.some((c) => {
            if (c.type !== 'c') return false;
            if (c.name !== chk.name) return false;
            
            const normalize = (str: string) => str.toLowerCase().replace(/[\\s"'\\(\\)]/g, '').replace(/::\\w+(\\[\\])?/g, '');
            const match = c.def.match(/CHECK\\s*\\((.*)\\)/i);
            if (match) {
               const dbCond = normalize(match[1]);
               const expectedCond = normalize(chk.condition);
               if (!dbCond.includes(expectedCond) && !expectedCond.includes(dbCond)) {
                  return false;
               }
            }
            return true;
          });`;
content = content.replace(checkRegex, checkReplacement);

fs.writeFileSync('src/server/database/schemaAuditor.ts', content);
