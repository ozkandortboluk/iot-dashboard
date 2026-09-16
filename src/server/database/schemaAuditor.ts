import type pg from 'pg';
import {
  CANONICAL_SCHEMA_METADATA,
  generateCanonicalSchemaDDL,
  generateSingleTableDDL,
  getCanonicalTableCreationOrder,
  type TableDefinition,
} from './canonicalSchema.js';
import { systemLogger } from '../services/systemLogger.service.js';

export interface ColumnDiscrepancy {
  table: string;
  column: string;
  expectedType: string;
  defaultValue?: string;
  nullable: boolean;
}

export interface TypeMismatchDiscrepancy {
  table: string;
  column: string;
  expectedType: string;
  actualType: string;
  suggestedFixSql: string;
}

export interface ConstraintDiscrepancy {
  table: string;
  constraintName: string;
  constraintType: 'PRIMARY KEY' | 'UNIQUE' | 'FOREIGN KEY' | 'CHECK' | 'NOT NULL' | 'DEFAULT';
  details: string;
  suggestedFixSql: string;
}

export interface IndexDiscrepancy {
  table: string;
  indexName: string;
  columns: string[];
  ddl: string;
}

export interface TriggerDiscrepancy {
  table: string;
  triggerName: string;
  functionName: string;
}

export interface SchemaAuditReport {
  timestamp: string;
  isHealthy: boolean;
  score: number; // 0 to 100%
  summary: {
    totalCanonicalTables: number;
    existingTablesCount: number;
    missingTablesCount: number;
    missingColumnsCount: number;
    typeMismatchCount: number;
    missingIndexesCount: number;
    missingConstraintsCount: number;
    missingTriggersCount: number;
    missingFunctionsCount: number;
  };
  discrepancies: {
    missingTables: string[];
    missingColumns: ColumnDiscrepancy[];
    typeMismatches: TypeMismatchDiscrepancy[];
    missingIndexes: IndexDiscrepancy[];
    missingConstraints: ConstraintDiscrepancy[];
    missingTriggers: TriggerDiscrepancy[];
    missingFunctions: string[];
  };
  humanReadableMessages: string[];
}

export type SchemaRepairStage = 'DETECT' | 'REPAIR' | 'RE_CHECK' | 'VERIFIED';
export type SchemaRepairStatus = 'PASS' | 'FAIL' | 'NO_OP';

export interface SchemaHealingResult {
  timestamp: string;
  stage: SchemaRepairStage;
  status: SchemaRepairStatus;
  success: boolean;
  isHealthy: boolean;
  verificationPassed: boolean;
  actionsTaken: string[];
  errors: string[];
  remainingDiscrepancies: string[];
  beforeReport: SchemaAuditReport;
  afterReport: SchemaAuditReport;
  summaryMessage: string;
}

/**
 * Normalizes PostgreSQL data type representations for robust matching.
 */
function normalizeDataType(rawType: string): string {
  const t = rawType.toLowerCase().trim();

  if (t.includes('varchar') || t.includes('character varying')) return 'varchar';
  if (t === 'text') return 'text';
  if (t === 'int' || t === 'integer' || t === 'int4' || t === 'smallint' || t === 'int2') return 'integer';
  if (t === 'bigint' || t === 'int8') return 'bigint';
  if (t.includes('double') || t.includes('float') || t === 'real' || t === 'numeric' || t === 'decimal') return 'double precision';
  if (t === 'bool' || t === 'boolean') return 'boolean';
  if (t.includes('timestamp') || t.includes('timestamptz') || t.includes('time zone')) return 'timestamp with time zone';
  if (t === 'json' || t === 'jsonb') return 'jsonb';
  if (t.includes('uuid')) return 'uuid';

  return t;
}

/**
 * Checks if two PostgreSQL types are compatible/equivalent in production.
 */
function areTypesCompatible(expected: string, actual: string): boolean {
  const normExpected = normalizeDataType(expected);
  const normActual = normalizeDataType(actual);

  if (normExpected === normActual) return true;

  // Permissive string compatibility: varchar and text can hold each other
  if ((normExpected === 'varchar' || normExpected === 'text') && (normActual === 'varchar' || normActual === 'text')) {
    return true;
  }

  // Double precision, numeric, real are numeric floats
  if (normExpected === 'double precision' && (normActual === 'double precision' || normActual === 'integer' || normActual === 'bigint')) {
    return true;
  }

  return false;
}

/**
 * Real Schema Auditor for PostgreSQL & TimescaleDB.
 * Introspects live database tables, columns, indexes, constraints, triggers, and functions
 * and compares them against the authoritative CANONICAL_SCHEMA_METADATA.
 */
export class SchemaAuditor {
  /**
   * Performs live introspection on the PostgreSQL database and returns a complete audit report.
   */
  public static async auditSchema(poolOrClient: pg.Pool | pg.PoolClient): Promise<SchemaAuditReport> {
    const timestamp = new Date().toISOString();
    const humanReadableMessages: string[] = [];

    // 1. Introspect existing tables
    const tablesRes = await poolOrClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const liveTables = new Set<string>(tablesRes.rows.map((r: any) => r.table_name));

    // 2. Introspect existing columns with data types
    const columnsRes = await poolOrClient.query(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public';
    `);
    
    // Map: "tableName.columnName" -> column row
    const liveColumnsMap = new Map<string, any>();
    for (const row of columnsRes.rows) {
      liveColumnsMap.set(`${row.table_name}.${row.column_name}`, row);
    }

    // 3. Introspect existing indexes
    const indexesRes = await poolOrClient.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);
    const liveIndexes = new Set<string>(indexesRes.rows.map((r: any) => r.indexname));

    // 4. Introspect existing constraints (PK, UNIQUE, FK, CHECK)
    const constraintsRes = await poolOrClient.query(`
      SELECT 
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        rel.relname AS table_name,
        frel.relname AS foreign_table_name,
        pg_get_constraintdef(con.oid, true) AS constraint_def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      LEFT JOIN pg_class frel ON frel.oid = con.confrelid
      WHERE nsp.nspname = 'public';
    `);

    // Map: tableName -> list of constraints
    const liveConstraintsByTable = new Map<string, Array<{ name: string; type: string; def: string; foreignTable?: string }>>();
    const liveConstraintNames = new Set<string>();
    for (const row of constraintsRes.rows) {
      liveConstraintNames.add(row.constraint_name);
      const list = liveConstraintsByTable.get(row.table_name) || [];
      list.push({
        name: row.constraint_name,
        type: row.constraint_type,
        def: row.constraint_def,
        foreignTable: row.foreign_table_name,
      });
      liveConstraintsByTable.set(row.table_name, list);
    }

    // 5. Introspect existing triggers
    const triggersRes = await poolOrClient.query(`
      SELECT event_object_table, trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public';
    `);
    const liveTriggers = new Set<string>(triggersRes.rows.map((r: any) => r.trigger_name));

    // 6. Introspect custom functions
    const funcsRes = await poolOrClient.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public';
    `);
    const liveFunctions = new Set<string>(funcsRes.rows.map((r: any) => r.routine_name));

    // Compare with CANONICAL_SCHEMA_METADATA
    const missingTables: string[] = [];
    const missingColumns: ColumnDiscrepancy[] = [];
    const typeMismatches: TypeMismatchDiscrepancy[] = [];
    const missingIndexes: IndexDiscrepancy[] = [];
    const missingConstraints: ConstraintDiscrepancy[] = [];
    const missingTriggers: TriggerDiscrepancy[] = [];
    const missingFunctions: string[] = [];

    const canonicalTables = CANONICAL_SCHEMA_METADATA.tables;
    const totalCanonicalTables = Object.keys(canonicalTables).length;

    for (const [tableName, tableDef] of Object.entries(canonicalTables)) {
      // A. Check if table exists
      if (!liveTables.has(tableName)) {
        missingTables.push(tableName);
        humanReadableMessages.push(`❌ Eksik tablo: ${tableName}`);
        continue;
      }

      const tableConstraints = liveConstraintsByTable.get(tableName) || [];

      // B. Check columns in existing table (Types, NOT NULL, DEFAULT)
      for (const colDef of tableDef.columns) {
        const key = `${tableName}.${colDef.name}`;
        const liveCol = liveColumnsMap.get(key);

        if (!liveCol) {
          missingColumns.push({
            table: tableName,
            column: colDef.name,
            expectedType: colDef.type,
            defaultValue: colDef.defaultValue,
            nullable: colDef.nullable,
          });
          humanReadableMessages.push(`❌ Eksik kolon: ${tableName}.${colDef.name} (${colDef.type})`);
        } else {
          // Check type compatibility
          const actualType = liveCol.data_type === 'USER-DEFINED' ? liveCol.udt_name : liveCol.data_type;
          if (!areTypesCompatible(colDef.type, actualType)) {
            const fixSql = `ALTER TABLE "${tableName}" ALTER COLUMN "${colDef.name}" TYPE ${colDef.type} USING "${colDef.name}"::text::${colDef.type.split('(')[0]};`;
            typeMismatches.push({
              table: tableName,
              column: colDef.name,
              expectedType: colDef.type,
              actualType,
              suggestedFixSql: fixSql,
            });
            humanReadableMessages.push(`⚠️ Yanlış tip: ${tableName}.${colDef.name} (Beklenen: ${colDef.type}, Mevcut: ${actualType})`);
          }

          // Check NOT NULL constraint
          if (colDef.nullable === false && liveCol.is_nullable === 'YES' && !colDef.primaryKey) {
            const nnFixSql = `DO $$ BEGIN ${colDef.defaultValue ? `UPDATE "${tableName}" SET "${colDef.name}" = ${colDef.defaultValue} WHERE "${colDef.name}" IS NULL; ` : ''}ALTER TABLE "${tableName}" ALTER COLUMN "${colDef.name}" SET NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SET NOT NULL notice: %', SQLERRM; END $$;`;
            missingConstraints.push({
              table: tableName,
              constraintName: `nn_${tableName}_${colDef.name}`,
              constraintType: 'NOT NULL',
              details: `Kolon ${tableName}.${colDef.name} NOT NULL olmalı ancak nullable tanımlı`,
              suggestedFixSql: nnFixSql,
            });
            humanReadableMessages.push(`⚠️ Eksik NOT NULL kısıtı: ${tableName}.${colDef.name}`);
          }

          // Check DEFAULT constraint
          if (colDef.defaultValue !== undefined && (liveCol.column_default === null || liveCol.column_default === undefined)) {
            const dfFixSql = `ALTER TABLE "${tableName}" ALTER COLUMN "${colDef.name}" SET DEFAULT ${colDef.defaultValue};`;
            missingConstraints.push({
              table: tableName,
              constraintName: `df_${tableName}_${colDef.name}`,
              constraintType: 'DEFAULT',
              details: `Kolon ${tableName}.${colDef.name} için beklenen varsayılan değer ${colDef.defaultValue}`,
              suggestedFixSql: dfFixSql,
            });
            humanReadableMessages.push(`⚠️ Eksik DEFAULT değeri: ${tableName}.${colDef.name} (${colDef.defaultValue})`);
          }
        }
      }

      // C. Check Primary Key constraint
      if (tableDef.primaryKey && tableDef.primaryKey.length > 0) {
        const hasPk = tableConstraints.some((c) => c.type === 'p');
        if (!hasPk) {
          const pkSql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid WHERE rel.relname = '${tableName}' AND con.contype = 'p') THEN ALTER TABLE "${tableName}" ADD PRIMARY KEY ("${tableDef.primaryKey.join('", "')}"); END IF; END $$;`;
          missingConstraints.push({
            table: tableName,
            constraintName: `pk_${tableName}`,
            constraintType: 'PRIMARY KEY',
            details: `PRIMARY KEY ("${tableDef.primaryKey.join('", "')}") eksik`,
            suggestedFixSql: pkSql,
          });
          humanReadableMessages.push(`❌ Eksik PRIMARY KEY: ${tableName} (${tableDef.primaryKey.join(', ')})`);
        }
      }

      // D. Check UNIQUE constraints
      if (tableDef.uniqueConstraints) {
        for (const uq of tableDef.uniqueConstraints) {
          const exists = liveConstraintNames.has(uq.name) || tableConstraints.some((c) => c.type === 'u');
          if (!exists) {
            const uqSql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${uq.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${uq.name}" UNIQUE ("${uq.columns.join('", "')}"); END IF; END $$;`;
            missingConstraints.push({
              table: tableName,
              constraintName: uq.name,
              constraintType: 'UNIQUE',
              details: `UNIQUE ("${uq.columns.join('", "')}") eksik`,
              suggestedFixSql: uqSql,
            });
            humanReadableMessages.push(`❌ Eksik UNIQUE kısıtı: ${uq.name} on ${tableName} (${uq.columns.join(', ')})`);
          }
        }
      }

      // E. Check FOREIGN KEY constraints
      if (tableDef.foreignKeys) {
        for (const fk of tableDef.foreignKeys) {
          const exists = liveConstraintNames.has(fk.name) || tableConstraints.some((c) => c.type === 'f' && c.foreignTable === fk.referencedTable);
          if (!exists) {
            const fkSql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.columns.join('", "')}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumns.join('", "')}") ON DELETE ${fk.onDelete || 'NO ACTION'}; END IF; END $$;`;
            missingConstraints.push({
              table: tableName,
              constraintName: fk.name,
              constraintType: 'FOREIGN KEY',
              details: `FOREIGN KEY ("${fk.columns.join('", "')}") -> ${fk.referencedTable}("${fk.referencedColumns.join('", "')}") eksik`,
              suggestedFixSql: fkSql,
            });
            humanReadableMessages.push(`❌ Eksik FOREIGN KEY kısıtı: ${fk.name} on ${tableName} -> ${fk.referencedTable}`);
          }
        }
      }

      // F. Check CHECK constraints
      if (tableDef.checkConstraints) {
        for (const chk of tableDef.checkConstraints) {
          const exists = liveConstraintNames.has(chk.name) || tableConstraints.some((c) => c.type === 'c');
          if (!exists) {
            const chkSql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${chk.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${chk.name}" CHECK (${chk.condition}); END IF; END $$;`;
            missingConstraints.push({
              table: tableName,
              constraintName: chk.name,
              constraintType: 'CHECK',
              details: `CHECK (${chk.condition}) eksik`,
              suggestedFixSql: chkSql,
            });
            humanReadableMessages.push(`❌ Eksik CHECK kısıtı: ${chk.name} on ${tableName}`);
          }
        }
      }

      // G. Check indexes in existing table
      if (tableDef.indexes) {
        for (const idx of tableDef.indexes) {
          if (!liveIndexes.has(idx.name)) {
            const colsSql = idx.columns.join(', ');
            const uniqueSql = idx.unique ? 'UNIQUE ' : '';
            const idxDdl = `CREATE ${uniqueSql}INDEX IF NOT EXISTS "${idx.name}" ON "${tableName}" (${colsSql});`;
            missingIndexes.push({
              table: tableName,
              indexName: idx.name,
              columns: idx.columns,
              ddl: idxDdl,
            });
            humanReadableMessages.push(`❌ Eksik index: ${idx.name} (${tableName} -> [${colsSql}])`);
          }
        }
      }

      // H. Check triggers
      if (tableDef.triggers) {
        for (const trg of tableDef.triggers) {
          if (!liveTriggers.has(trg.name)) {
            missingTriggers.push({
              table: tableName,
              triggerName: trg.name,
              functionName: trg.functionName,
            });
            humanReadableMessages.push(`❌ Eksik trigger: ${trg.name} on ${tableName}`);
          }
        }
      }
    }

    // I. Check critical functions
    const requiredFunctions = ['fn_update_updated_at_timestamp', 'fn_cleanup_expired_records', 'fn_device_last_seen_sync'];
    for (const fn of requiredFunctions) {
      if (!liveFunctions.has(fn)) {
        missingFunctions.push(fn);
        humanReadableMessages.push(`❌ Eksik saklı fonksiyon: ${fn}`);
      }
    }

    // Compute Health Score (0 - 100%)
    const totalDefects =
      missingTables.length * 10 +
      missingColumns.length * 3 +
      typeMismatches.length * 2 +
      missingConstraints.length * 2 +
      missingIndexes.length * 1 +
      missingTriggers.length * 1 +
      missingFunctions.length * 2;

    const score = Math.max(0, 100 - totalDefects);
    const isHealthy = totalDefects === 0;

    if (isHealthy) {
      humanReadableMessages.push('✅ Tüm tablolar, kolonlar, kısıtlar (PK/FK/UNIQUE/CHECK/NOT NULL/DEFAULT), veri tipleri, indeksler ve tetikleyiciler Kanonik Şema ile %100 uyumlu.');
    }

    return {
      timestamp,
      isHealthy,
      score,
      summary: {
        totalCanonicalTables,
        existingTablesCount: liveTables.size,
        missingTablesCount: missingTables.length,
        missingColumnsCount: missingColumns.length,
        typeMismatchCount: typeMismatches.length,
        missingIndexesCount: missingIndexes.length,
        missingConstraintsCount: missingConstraints.length,
        missingTriggersCount: missingTriggers.length,
        missingFunctionsCount: missingFunctions.length,
      },
      discrepancies: {
        missingTables,
        missingColumns,
        typeMismatches,
        missingIndexes,
        missingConstraints,
        missingTriggers,
        missingFunctions,
      },
      humanReadableMessages,
    };
  }

  /**
   * Migration-Independent Auto-Heal Engine with Repair -> Verify Lifecycle:
   * 1. DETECT: Introspect live database structure against Canonical Schema.
   * 2. REPAIR: Apply deterministic DDL fixes for tables, columns, types, indexes, functions, triggers.
   * 3. RE-CHECK: Directly re-read live database catalog from PostgreSQL.
   * 4. PASS / FAIL: Strict evaluation. If repair fails, prevent false "healthy" states,
   *    generate critical logs, record system events, and dispatch admin notifications.
   */
  public static async autoHeal(
    poolOrClient: pg.Pool | pg.PoolClient,
    existingReport?: SchemaAuditReport
  ): Promise<SchemaHealingResult> {
    const timestamp = new Date().toISOString();
    const actionsTaken: string[] = [];
    const errors: string[] = [];

    // ==========================================
    // STAGE 1: DETECT
    // ==========================================
    const beforeReport = existingReport || (await this.auditSchema(poolOrClient));

    if (beforeReport.isHealthy) {
      return {
        timestamp,
        stage: 'VERIFIED',
        status: 'PASS',
        success: true,
        isHealthy: true,
        verificationPassed: true,
        actionsTaken: ['Şema zaten %100 sağlıklı ve Canonical Schema ile tam uyumlu (No-Op).'],
        errors: [],
        remainingDiscrepancies: [],
        beforeReport,
        afterReport: beforeReport,
        summaryMessage: 'Şema zaten %100 sağlıklı ve Canonical Schema ile tam uyumlu.',
      };
    }

    console.log(`[SchemaAutoHealer - DETECT] Canlı şema uyumsuzlukları tespit edildi. Kusur sayısı: ${beforeReport.humanReadableMessages.length}. Onarım başlatılıyor...`);

    // ==========================================
    // STAGE 2: REPAIR
    // ==========================================
    // 1. Recreate missing functions first
    if (beforeReport.discrepancies.missingFunctions.length > 0) {
      try {
        await poolOrClient.query(`
          CREATE OR REPLACE FUNCTION fn_update_updated_at_timestamp()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          CREATE OR REPLACE FUNCTION fn_cleanup_expired_records()
          RETURNS VOID AS $$
          BEGIN
              DELETE FROM device_ws_messages_dedup WHERE expires_at < CURRENT_TIMESTAMP;
              DELETE FROM user_sessions WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
          END;
          $$ LANGUAGE plpgsql;

          CREATE OR REPLACE FUNCTION fn_device_last_seen_sync()
          RETURNS TRIGGER AS $$
          BEGIN
              UPDATE devices 
              SET last_seen = NEW.received_at, 
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = NEW.device_id;
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `);
        actionsTaken.push('Eksik saklı fonksiyonlar oluşturuldu: fn_update_updated_at_timestamp, fn_cleanup_expired_records, fn_device_last_seen_sync');
      } catch (fnErr: any) {
        errors.push(`Fonksiyon onarım hatası: ${fnErr?.message || fnErr}`);
      }
    }

    // 2. Recreate missing tables (in topological dependency order)
    if (beforeReport.discrepancies.missingTables.length > 0) {
      const creationOrder = getCanonicalTableCreationOrder();
      const missingSet = new Set(beforeReport.discrepancies.missingTables);
      const orderedMissing = [
        ...creationOrder.filter((t) => missingSet.has(t)),
        ...beforeReport.discrepancies.missingTables.filter((t) => !creationOrder.includes(t)),
      ];

      for (const tbl of orderedMissing) {
        try {
          if (CANONICAL_SCHEMA_METADATA.tables[tbl]) {
            const singleTableDDL = generateSingleTableDDL(tbl);
            await poolOrClient.query(singleTableDDL);
            actionsTaken.push(`Eksik tablo başarıyla oluşturuldu: ${tbl}`);
          }
        } catch (tblErr: any) {
          errors.push(`Tablo onarım hatası (${tbl}): ${tblErr?.message || tblErr}`);
        }
      }

      // Fallback: Run canonical DDL to ensure all views, triggers, and secondary extensions are applied
      try {
        const canonicalDDL = generateCanonicalSchemaDDL();
        await poolOrClient.query(canonicalDDL);
      } catch (ddlFallbackErr: any) {
        // Log minor warning if non-critical
        console.warn('[SchemaAutoHealer] Canonical schema DDL sweep notice:', ddlFallbackErr?.message || ddlFallbackErr);
      }
    }

    // 3. Heal missing columns in existing tables
    for (const missingCol of beforeReport.discrepancies.missingColumns) {
      try {
        let alterSql = `ALTER TABLE "${missingCol.table}" ADD COLUMN IF NOT EXISTS "${missingCol.column}" ${missingCol.expectedType}`;
        if (missingCol.defaultValue) {
          alterSql += ` DEFAULT ${missingCol.defaultValue}`;
        }
        await poolOrClient.query(alterSql);
        actionsTaken.push(`Eksik kolon eklendi: ${missingCol.table}.${missingCol.column} (${missingCol.expectedType})`);
      } catch (colErr: any) {
        errors.push(`Kolon ekleme hatası (${missingCol.table}.${missingCol.column}): ${colErr?.message || colErr}`);
      }
    }

    // 4. Heal type mismatches
    for (const typeMismatch of beforeReport.discrepancies.typeMismatches) {
      try {
        // Safe casting based on expected type
        let castSql = `"${typeMismatch.column}"::text`;
        if (typeMismatch.expectedType.toLowerCase().includes('varchar')) {
          castSql = `"${typeMismatch.column}"::text`;
        } else if (typeMismatch.expectedType.toLowerCase().includes('int')) {
          castSql = `NULLIF("${typeMismatch.column}"::text, '')::integer`;
        } else if (typeMismatch.expectedType.toLowerCase().includes('json')) {
          castSql = `"${typeMismatch.column}"::jsonb`;
        } else if (typeMismatch.expectedType.toLowerCase().includes('bool')) {
          castSql = `("${typeMismatch.column}"::text = 'true' OR "${typeMismatch.column}"::text = '1')`;
        }

        const alterTypeSql = `
          ALTER TABLE "${typeMismatch.table}" 
          ALTER COLUMN "${typeMismatch.column}" TYPE ${typeMismatch.expectedType} 
          USING (${castSql});
        `;
        await poolOrClient.query(alterTypeSql);
        actionsTaken.push(`Kolon veri tipi düzeltildi: ${typeMismatch.table}.${typeMismatch.column} -> ${typeMismatch.expectedType}`);
      } catch (typeErr: any) {
        errors.push(`Veri tipi düzeltme hatası (${typeMismatch.table}.${typeMismatch.column}): ${typeErr?.message || typeErr}`);
      }
    }

    // 5. Heal missing indexes
    for (const missingIdx of beforeReport.discrepancies.missingIndexes) {
      try {
        await poolOrClient.query(missingIdx.ddl);
        actionsTaken.push(`Eksik indeks oluşturuldu: ${missingIdx.indexName} (${missingIdx.table})`);
      } catch (idxErr: any) {
        errors.push(`İndeks oluşturma hatası (${missingIdx.indexName}): ${idxErr?.message || idxErr}`);
      }
    }

    // 6. Heal missing triggers
    for (const missingTrg of beforeReport.discrepancies.missingTriggers) {
      try {
        await poolOrClient.query(`
          DROP TRIGGER IF EXISTS "${missingTrg.triggerName}" ON "${missingTrg.table}";
          CREATE TRIGGER "${missingTrg.triggerName}"
          BEFORE UPDATE ON "${missingTrg.table}"
          FOR EACH ROW
          EXECUTE FUNCTION "${missingTrg.functionName}"();
        `);
        actionsTaken.push(`Eksik tetikleyici bağlandı: ${missingTrg.triggerName} on ${missingTrg.table}`);
      } catch (trgErr: any) {
        errors.push(`Tetikleyici oluşturma hatası (${missingTrg.triggerName}): ${trgErr?.message || trgErr}`);
      }
    }

    // 6.5. Pre-heal: Clean up data violations before applying constraints (Orphans & Nulls)
    for (const missingConstraint of beforeReport.discrepancies.missingConstraints) {
      if (missingConstraint.constraintType === 'FOREIGN KEY') {
        const tableDef = CANONICAL_SCHEMA_METADATA.tables[missingConstraint.table];
        const fkDef = tableDef?.foreignKeys?.find(fk => fk.name === missingConstraint.constraintName);
        if (fkDef && fkDef.columns.length === 1 && fkDef.referencedColumns.length === 1) {
          const localCol = fkDef.columns[0];
          const refTable = fkDef.referencedTable;
          const refCol = fkDef.referencedColumns[0];
          try {
            const colDef = tableDef.columns.find(c => c.name === localCol);
            if (colDef && colDef.nullable && fkDef.onDelete === 'SET NULL') {
               await poolOrClient.query(`UPDATE "${missingConstraint.table}" SET "${localCol}" = NULL WHERE "${localCol}" IS NOT NULL AND "${localCol}" NOT IN (SELECT "${refCol}" FROM "${refTable}")`);
            } else {
               await poolOrClient.query(`DELETE FROM "${missingConstraint.table}" WHERE "${localCol}" IS NOT NULL AND "${localCol}" NOT IN (SELECT "${refCol}" FROM "${refTable}")`);
            }
          } catch (orphanErr) {
            console.warn(`[AutoHeal] Orphan cleanup failed for ${missingConstraint.constraintName}:`, orphanErr);
          }
        }
      } else if (missingConstraint.constraintType === 'NOT NULL') {
        const tableDef = CANONICAL_SCHEMA_METADATA.tables[missingConstraint.table];
        const colNameMatch = missingConstraint.details.match(/Kolon .*?\.(\w+) NOT NULL/);
        if (colNameMatch && colNameMatch[1]) {
           const localCol = colNameMatch[1];
           const colDef = tableDef?.columns.find(c => c.name === localCol);
           try {
             if (colDef && colDef.type.includes('VARCHAR')) {
               await poolOrClient.query(`UPDATE "${missingConstraint.table}" SET "${localCol}" = 'default_value' WHERE "${localCol}" IS NULL`);
             } else if (colDef && (colDef.type.includes('INT') || colDef.type.includes('NUMERIC'))) {
               await poolOrClient.query(`UPDATE "${missingConstraint.table}" SET "${localCol}" = 0 WHERE "${localCol}" IS NULL`);
             } else if (colDef && colDef.type.includes('BOOL')) {
               await poolOrClient.query(`UPDATE "${missingConstraint.table}" SET "${localCol}" = false WHERE "${localCol}" IS NULL`);
             } else if (colDef && colDef.type.includes('TIMESTAMP')) {
               await poolOrClient.query(`UPDATE "${missingConstraint.table}" SET "${localCol}" = CURRENT_TIMESTAMP WHERE "${localCol}" IS NULL`);
             } else {
               await poolOrClient.query(`DELETE FROM "${missingConstraint.table}" WHERE "${localCol}" IS NULL`);
             }
           } catch (nullErr) {
             console.warn(`[AutoHeal] Null cleanup failed for ${missingConstraint.constraintName}:`, nullErr);
           }
        }
      }
    }

    // 7. Heal missing / mismatched database constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK, NOT NULL, DEFAULT)
    for (const missingConstraint of beforeReport.discrepancies.missingConstraints) {
      try {
        await poolOrClient.query(missingConstraint.suggestedFixSql);
        actionsTaken.push(`Kısıt (Constraint) onarıldı: [${missingConstraint.constraintType}] ${missingConstraint.constraintName} on ${missingConstraint.table}`);
      } catch (conErr: any) {
        const errMsg = conErr?.message || String(conErr);
        if (errMsg.includes('already exists') || errMsg.includes('zaten var')) {
          actionsTaken.push(`Kısıt zaten mevcut (yoksayıldı): [${missingConstraint.constraintType}] ${missingConstraint.constraintName} on ${missingConstraint.table}`);
        } else {
          errors.push(`Kısıt onarım hatası (${missingConstraint.constraintName} on ${missingConstraint.table}): ${errMsg}`);
        }
      }
    }

    // 8. Clean up any obsolete rigid foreign keys that hinder system logging or telemetry
    try {
      await poolOrClient.query(`
        ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_tenant_id;
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_tenant_id;
        ALTER TABLE active_alarms DROP CONSTRAINT IF EXISTS fk_active_alarms_tenant_id;
        ALTER TABLE alarm_events DROP CONSTRAINT IF EXISTS fk_alarm_events_tenant_id;
        ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS fk_device_commands_tenant_id;
        ALTER TABLE telemetry_readings DROP CONSTRAINT IF EXISTS fk_telemetry_readings_tenant_id;
        ALTER TABLE simulation_telemetry_readings DROP CONSTRAINT IF EXISTS fk_simulation_telemetry_readings_tenant_id;
        ALTER TABLE threshold_rules DROP CONSTRAINT IF EXISTS fk_threshold_rules_tenant_id;
      `);
    } catch {
      // Non-blocking
    }

    // ==========================================
    // STAGE 3: RE-CHECK (Direct Live DB Introspection)
    // ==========================================
    console.log('[SchemaAutoHealer - RE-CHECK] Onarım komutları uygulandı. Doğrulama için canlı DB yapısı yeniden taranıyor...');
    const afterReport = await this.auditSchema(poolOrClient);
    const remainingDiscrepancies = afterReport.humanReadableMessages;

    // ==========================================
    // STAGE 4: PASS / FAIL Evaluation
    // ==========================================
    const verificationPassed = afterReport.isHealthy && errors.length === 0;
    const status: SchemaRepairStatus = verificationPassed ? 'PASS' : 'FAIL';
    const success = verificationPassed;
    const isHealthy = afterReport.isHealthy;

    let summaryMessage = '';

    if (verificationPassed) {
      summaryMessage = `Şema onarımı yapıldı ve doğrudan DB okunarak doğrulandı (PASS). Sağlık skoru: %${beforeReport.score} -> %${afterReport.score}. Uygulanan düzeltmeler: ${actionsTaken.length}.`;
      console.log(`[SchemaAutoHealer - VERIFIED PASS] ${summaryMessage}`);

      systemLogger.info('database', summaryMessage, {
        actionsTakenCount: actionsTaken.length,
        initialScore: beforeReport.score,
        verifiedScore: afterReport.score,
      }, 'schema_auditor');

      // Record successful audit log & system event
      try {
        const auditId = `aud_schema_heal_${Date.now()}`;
        const safeAction = `[Schema Auto-Heal PASS] ${actionsTaken.length} şema kusuru onarıldı ve doğrulandı. Sağlık: %${afterReport.score}`.substring(0, 250);
        await poolOrClient.query(`
          INSERT INTO audit_logs (id, tenant_id, user_id, user_name, action, resource_type, ip_address, severity, created_at)
          VALUES ($1, 'usr_admin', 'system_schema_auditor', 'Kanonik Şema Onarıcı', $2, 'database_schema', '127.0.0.1', 'medium', CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING;
        `, [auditId, safeAction]);

        const eventId = `evt_schema_pass_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await poolOrClient.query(`
          INSERT INTO system_events (id, event_type, timestamp, level, category, message, details, source)
          VALUES ($1, 'system_schema_repair', CURRENT_TIMESTAMP, 'info', 'database', $2, $3, 'schema_auditor')
          ON CONFLICT (id) DO NOTHING;
        `, [eventId, summaryMessage, JSON.stringify({ actionsTaken, score: afterReport.score })]);
      } catch {
        // Non-blocking
      }
    } else {
      // CRITICAL: Onarım başarısızsa uygulama bunu sessizce geçmemeli!
      // Sistemi yanlışlıkla "healthy" göstermeyi engelle
      summaryMessage = `[ŞEMA ONARIM VE DOĞRULAMA HATASI - FAIL] Şema onarımı yapıldı ancak re-check doğrulamasında ${remainingDiscrepancies.length} adet kusur giderilemedi. Skor: %${afterReport.score}. Hatalar: ${errors.join(', ')}`;
      console.error(`[SchemaAutoHealer - VERIFIED FAIL] ${summaryMessage}`);

      // 1. Critical log
      systemLogger.critical('database', summaryMessage, {
        errors,
        remainingDiscrepancies,
        actionsTaken,
        beforeScore: beforeReport.score,
        afterScore: afterReport.score,
      }, 'schema_auditor');

      // 2. System event
      try {
        const eventId = `evt_schema_fail_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await poolOrClient.query(`
          INSERT INTO system_events (id, event_type, timestamp, level, category, message, details, source)
          VALUES ($1, 'system_schema_repair_fail', CURRENT_TIMESTAMP, 'critical', 'database', $2, $3, 'schema_auditor')
          ON CONFLICT (id) DO NOTHING;
        `, [
          eventId,
          `Veritabanı Şema Onarımı ve Doğrulaması Başarısız Oldu (FAIL) - Kalan Uyumsuzluklar: ${remainingDiscrepancies.length}`,
          JSON.stringify({
            errors,
            remainingDiscrepancies: remainingDiscrepancies.slice(0, 20),
            afterReportSummary: afterReport.summary,
            actionsTaken,
          }),
        ]);
      } catch (evtErr) {
        console.warn('[SchemaAutoHealer] System event kaydı veritabanına yazılamadı:', evtErr);
      }

      // 3. Admin notification
      try {
        const notifTitle = '⚠️ Veritabanı Şema Onarımı Başarısız (FAIL)';
        const notifMsg = `Kritik: Otomatik şema onarım döngüsü (Repair → Verify) tamamlanamadı. Re-check aşamasında ${remainingDiscrepancies.length} adet uyumsuzluk giderilemedi. Veritabanı sağlık skoru: %${afterReport.score}. Lütfen şema ve izinleri kontrol ediniz.`;
        
        const notifId1 = `notif_schema_fail_adm_${Date.now()}`;
        const notifId2 = `notif_schema_fail_test_${Date.now()}`;

        await poolOrClient.query(`
          INSERT INTO notifications (id, tenant_id, user_id, type, severity, title, message, source, is_read, read, created_at)
          VALUES 
            ($1, 'usr_admin', 'usr_admin', 'DATABASE_SCHEMA_FAIL', 'critical', $2, $3, 'system', false, false, CURRENT_TIMESTAMP),
            ($4, 'usr_test_admin', 'usr_test_admin', 'DATABASE_SCHEMA_FAIL', 'critical', $2, $3, 'system', false, false, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING;
        `, [notifId1, notifTitle, notifMsg, notifId2]);
      } catch (notifErr) {
        console.warn('[SchemaAutoHealer] Yönetici bildirimi kaydedilemedi:', notifErr);
      }
    }

    return {
      timestamp,
      stage: 'VERIFIED',
      status,
      success,
      isHealthy,
      verificationPassed,
      actionsTaken,
      errors,
      remainingDiscrepancies,
      beforeReport,
      afterReport,
      summaryMessage,
    };
  }

  /**
   * Combined audit and auto-repair workflow with full verification.
   */
  public static async auditAndHeal(poolOrClient: pg.Pool | pg.PoolClient): Promise<{
    before: SchemaAuditReport;
    after: SchemaAuditReport;
    healed: boolean;
    verificationPassed: boolean;
    status: SchemaRepairStatus;
    actionsTaken: string[];
    errors: string[];
    remainingDiscrepancies: string[];
  }> {
    const before = await this.auditSchema(poolOrClient);
    if (before.isHealthy) {
      return {
        before,
        after: before,
        healed: false,
        verificationPassed: true,
        status: 'PASS',
        actionsTaken: [],
        errors: [],
        remainingDiscrepancies: [],
      };
    }

    const healResult = await this.autoHeal(poolOrClient, before);
    return {
      before,
      after: healResult.afterReport,
      healed: true,
      verificationPassed: healResult.verificationPassed,
      status: healResult.status,
      actionsTaken: healResult.actionsTaken,
      errors: healResult.errors,
      remainingDiscrepancies: healResult.remainingDiscrepancies,
    };
  }
}
