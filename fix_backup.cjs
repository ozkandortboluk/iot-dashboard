const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/  public async createBackup\(\): Promise<\{ success: boolean; filename: string; size: number \}> \{\n    if \(this\.isPostgresProductionMode\(\)\) \{/g, '  public async createBackup(): Promise<{ success: boolean; filename: string; size: number }> {\n    this.ensureBackupDir();\n    const timestamp = new Date().toISOString().replace(/[:.]/g, \'-\');\n\n    if (this.isPostgresProductionMode()) {');

code = code.replace(/const \{ execSync \} = require\('node:child_process'\);/g, 'const { execSync } = await import(\'node:child_process\');');

fs.writeFileSync('src/server/db.ts', code);
