import { getSharedPgPool } from './src/server/database/connection.js';
import { SchemaAuditor } from './src/server/database/schemaAuditor.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = getSharedPgPool();
  if (!pool) return;
  const res = await SchemaAuditor.auditAndHeal(pool);
  console.log("Success:", res.success);
  console.log("Score:", res.afterReport.score);
  console.log("Remaining Discrepancies:", res.remainingDiscrepancies);
  console.log("Errors:", res.errors);
  console.log("Actions taken:", res.actionsTaken);
  process.exit(0);
}
main();
