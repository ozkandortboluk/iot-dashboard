import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || '';
const sqlHost = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'iot_dashboard_db';
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || 'postgres';
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'postgres';
const port = Number(process.env.SQL_PORT || process.env.PGPORT || 5432);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: connectionUrl
    ? { url: connectionUrl }
    : {
        host: sqlHost,
        port: port,
        user: user,
        password: password,
        database: sqlDbName,
        ssl: false,
      },
  verbose: true,
});
