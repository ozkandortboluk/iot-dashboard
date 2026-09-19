import 'dotenv/config';
import { db } from './src/server/db.js';
import { SchemaAuditor } from './src/server/database/schemaAuditor.js';

async function run() {
  try {
    await db.waitForInitialization();
    const pool = db.getPool();
    if (pool) {
      console.log('Running audit...');
      const report = await SchemaAuditor.auditSchema(pool);
      console.log('Is Healthy:', report.isHealthy);
      console.log('Score:', report.score);
      console.log('Discrepancies:', JSON.stringify(report.discrepancies.missingConstraints, null, 2));
      
      console.log('Attempting auto-heal...');
      const healResult = await SchemaAuditor.autoHeal(pool, report);
      console.log('Heal success:', healResult.success);
      console.log('Heal messages:', healResult.summaryMessage);
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
