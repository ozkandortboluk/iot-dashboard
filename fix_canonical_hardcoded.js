import * as fs from 'fs';
let content = fs.readFileSync('src/server/database/canonicalSchema.ts', 'utf-8');

const regex = /ALTER TABLE telemetry_readings ENABLE ROW LEVEL SECURITY;/g;
content = content.replace(regex, `DO $$ BEGIN ALTER TABLE telemetry_readings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);

const regex2 = /ALTER TABLE simulation_telemetry_readings ENABLE ROW LEVEL SECURITY;/g;
content = content.replace(regex2, `DO $$ BEGIN ALTER TABLE simulation_telemetry_readings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);

fs.writeFileSync('src/server/database/canonicalSchema.ts', content);
