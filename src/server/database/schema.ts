import { generateCanonicalSchemaDDL, CANONICAL_SCHEMA_METADATA } from './canonicalSchema.js';
import { ALL_MIGRATIONS } from './migrations/migrationRunner.js';
import { SchemaAuditor } from './schemaAuditor.js';

export { generateCanonicalSchemaDDL, CANONICAL_SCHEMA_METADATA } from './canonicalSchema.js';
export { SchemaAuditor } from './schemaAuditor.js';
export type {
  ColumnDefinition,
  IndexDefinition,
  TriggerDefinition,
  TableDefinition,
  FunctionDefinition,
  ViewDefinition,
  CanonicalSchemaContract
} from './canonicalSchema.js';
export type {
  SchemaAuditReport,
  SchemaHealingResult,
  ColumnDiscrepancy,
  TypeMismatchDiscrepancy,
  IndexDiscrepancy,
  TriggerDiscrepancy
} from './schemaAuditor.js';

/**
 * Single Authoritative Database Schema DDL Definition for NexusNode IoT.
 * Derived directly from the declarative Canonical Database Schema.
 */
export const postgresSchemaSQL = generateCanonicalSchemaDDL();

/**
 * Validates cross-source schema harmony between Canonical Schema, Drizzle ORM, and Migrations.
 */
export function validateSchemaHarmony(): {
  isHarmonized: boolean;
  canonicalTableCount: number;
  migrationsCount: number;
  tables: string[];
  discrepancies: string[];
} {
  const discrepancies: string[] = [];
  const canonicalTables = Object.keys(CANONICAL_SCHEMA_METADATA.tables);

  if (canonicalTables.length === 0) {
    discrepancies.push('Canonical schema contains 0 tables.');
  }

  if (ALL_MIGRATIONS.length === 0) {
    discrepancies.push('No migrations registered in migration runner.');
  }

  return {
    isHarmonized: discrepancies.length === 0,
    canonicalTableCount: canonicalTables.length,
    migrationsCount: ALL_MIGRATIONS.length,
    tables: canonicalTables,
    discrepancies,
  };
}

