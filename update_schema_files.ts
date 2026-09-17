import * as fs from 'fs';

// 1. Update src/types.ts
let typesContent = fs.readFileSync('src/types.ts', 'utf-8');
if (!typesContent.includes('powerSource?:')) {
  typesContent = typesContent.replace(
    /isSimulated\?: boolean;/,
    `isSimulated?: boolean;
  powerSource?: 'battery' | 'mains' | 'unknown';
  batteryLevel?: number;`
  );
  fs.writeFileSync('src/types.ts', typesContent);
}

// 2. Update src/db/schema.ts
let drizzleSchema = fs.readFileSync('src/db/schema.ts', 'utf-8');
if (!drizzleSchema.includes('powerSource: varchar(')) {
  drizzleSchema = drizzleSchema.replace(
    /isSimulated: boolean\('is_simulated'\)\.default\(false\)\.notNull\(\),/,
    `isSimulated: boolean('is_simulated').default(false).notNull(),
  powerSource: varchar('power_source', { length: 32 }).default('mains').notNull(),
  batteryLevel: integer('battery_level'),`
  );
  fs.writeFileSync('src/db/schema.ts', drizzleSchema);
}

// 3. Update src/server/database/canonicalSchema.ts
let canonicalSchema = fs.readFileSync('src/server/database/canonicalSchema.ts', 'utf-8');
if (!canonicalSchema.includes("{ name: 'power_source'")) {
  canonicalSchema = canonicalSchema.replace(
    /\{ name: 'is_simulated', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' \},/,
    `{ name: 'is_simulated', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'power_source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'mains'" },
        { name: 'battery_level', type: 'INT', nullable: true },`
  );
  
  // Also add check constraint for power_source
  canonicalSchema = canonicalSchema.replace(
    /\{ name: 'chk_devices_status', condition: "status IN \('online', 'offline', 'warning', 'error'\)" \},/,
    `{ name: 'chk_devices_status', condition: "status IN ('online', 'offline', 'warning', 'error')" },
        { name: 'chk_devices_power_source', condition: "power_source IN ('battery', 'mains', 'unknown')" },`
  );
  
  fs.writeFileSync('src/server/database/canonicalSchema.ts', canonicalSchema);
}

console.log('Schema files updated.');
