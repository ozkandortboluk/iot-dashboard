import 'dotenv/config';
import pg from 'pg';
import { SchemaAuditor } from './src/server/database/schemaAuditor.js';

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  console.log('Running audit...');
  const report = await SchemaAuditor.auditSchema(pool);
  console.log('Is Healthy:', report.isHealthy);
  console.log('Score:', report.score);
  console.log('Discrepancies:', JSON.stringify(report.discrepancies.missingConstraints, null, 2));
  
  console.log('Attempting auto-heal...');
  const healResult = await SchemaAuditor.autoHeal(pool, report);
  console.log('Heal success:', healResult.success);
  console.log('Heal messages:', healResult.summaryMessage);
  console.log('Errors:', healResult.errors);
  console.log('Actions taken:', healResult.actionsTaken);
  process.exit(0);
}
run();
