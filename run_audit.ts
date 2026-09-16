import { getSharedPgPool } from './src/server/database/connection.js';
import { SchemaAuditor } from './src/server/database/schemaAuditor.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = getSharedPgPool();
  if (!pool) {
    console.error("No pool");
    process.exit(1);
  }
  const report = await SchemaAuditor.auditSchema(pool);
  console.log("Health:", report.isHealthy);
  console.log("Score:", report.score);
  console.log("Discrepancies:");
  report.humanReadableMessages.forEach(m => console.log(m));
  process.exit(0);
}
main().catch(console.error);
