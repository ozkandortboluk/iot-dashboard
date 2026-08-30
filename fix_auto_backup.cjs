const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/    this\.startPostgresAutoReconnect\(\);\n  \}/, '    this.startPostgresAutoReconnect();\n    this.startAutoBackupWorker();\n  }');

code = code.replace(/  private postgresAutoReconnectInterval: any = null;/, '  private autoBackupInterval: any = null;\n  private startAutoBackupWorker(): void {\n    if (this.autoBackupInterval) return;\n    this.autoBackupInterval = setInterval(() => {\n      this.createBackup().catch(() => {});\n    }, 3600 * 1000);\n  }\n\n  private postgresAutoReconnectInterval: any = null;');

fs.writeFileSync('src/server/db.ts', code);
