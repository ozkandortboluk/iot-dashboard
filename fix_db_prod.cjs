const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

if (!code.includes('public isPostgresProductionMode()')) {
  code = code.replace(/  private ensureDirectory\(\) \{/, '  public isPostgresProductionMode() {\n    return process.env.DB_ENGINE === \'postgres\' || process.env.LOCAL_DB_ENABLED === \'false\';\n  }\n\n  private ensureDirectory() {');
}

code = code.replace(/    let parsed = emptyData;\n    const fileExists = fs\.existsSync\(DB_FILE\);/, '    if (this.isPostgresProductionMode()) {\n      console.log(\'[BOOTSTRAP] PostgreSQL mode active, skipping db.json load into RAM.\');\n      return emptyData;\n    }\n\n    let parsed = emptyData;\n    const fileExists = fs.existsSync(DB_FILE);');

code = code.replace(/  public saveData\(dataToSave: DatabaseSchema, forceWrite = false\) \{/, '  public saveData(dataToSave: DatabaseSchema, forceWrite = false) {\n    if (this.isPostgresProductionMode()) {\n      return;\n    }');

code = code.replace(/  public createBackup\(\): \{ success: boolean; filename: string; size: number \} \{/, '  public async createBackup(): Promise<{ success: boolean; filename: string; size: number }> {\n    this.ensureBackupDir();\n    const timestamp = new Date().toISOString().replace(/[:.]/g, \'-\');\n\n    if (this.isPostgresProductionMode()) {\n      const filename = `pg_backup_${timestamp}.sql`;\n      const backupPath = path.join(this.BACKUP_DIR, filename);\n      const dbUrl = process.env.DATABASE_URL;\n      \n      if (!dbUrl) {\n         console.error(\'[BACKUP] DATABASE_URL is not set for pg_dump\');\n         return { success: false, filename: \'\', size: 0 };\n      }\n\n      try {\n        const { execSync } = require(\'node:child_process\');\n        execSync(`pg_dump "${dbUrl}" > "${backupPath}"`);\n        \n        this.pruneBackups();\n        const stats = fs.statSync(backupPath);\n        return { success: true, filename, size: stats.size };\n      } catch (err) {\n        console.error(\'[BACKUP] pg_dump failed:\', err);\n        return { success: false, filename: \'\', size: 0 };\n      }\n    }\n\n');

code = code.replace(/    this\.ensureBackupDir\(\);\n    const timestamp = new Date\(\)\.toISOString\(\)\.replace\(\/\[:\.\]\/g, '-'\);\n\n    if \(this\.isPostgresProductionMode\(\)\)/, '    if (this.isPostgresProductionMode())');

code = code.replace(/  public createBackup\(\): \{ success: boolean; filename: string; size: number \} \{/, '  public async createBackup(): Promise<{ success: boolean; filename: string; size: number }> {'); // fallback

code = code.replace(/        \.filter\(\(f\) => f\.startsWith\('db_backup_'\) && f\.endsWith\('\.json'\)\)/, '        .filter((f) => (f.startsWith(\'db_backup_\') && f.endsWith(\'.json\')) || (f.startsWith(\'pg_backup_\') && f.endsWith(\'.sql\')))');

// Fix synchronous calls to createBackup internally
code = code.replace(/      if \(now - this\.lastBackupTime > 3600 \* 1000\) \{\n        this\.lastBackupTime = now;\n        this\.createBackup\(\);\n      \}/, '      if (now - this.lastBackupTime > 3600 * 1000) {\n        this.lastBackupTime = now;\n        this.createBackup().catch(() => {});\n      }');

fs.writeFileSync('src/server/db.ts', code);
