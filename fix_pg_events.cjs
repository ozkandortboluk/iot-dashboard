const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

code = code.replace(/AND tenant_id = \$\{\idx\+\+\}/g, 'AND tenant_id = $$${idx++}');
// Actually just replace exactly the lines that were wrong:
code = code.replace(/AND tenant_id = \$\{idx\+\+\}/g, 'AND tenant_id = $$${idx++}');
code = code.replace(/AND incident_id = \$\{idx\+\+\}/g, 'AND incident_id = $$${idx++}');
code = code.replace(/AND alarm_id = \$\{idx\+\+\}/g, 'AND alarm_id = $$${idx++}');
code = code.replace(/AND device_id = \$\{idx\+\+\}/g, 'AND device_id = $$${idx++}');

fs.writeFileSync('src/server/database/postgres.ts', code);
