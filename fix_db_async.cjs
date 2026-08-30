const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

// Convert addCommand to async
code = code.replace(/  public addCommand\(/g, '  public async addCommand(');
code = code.replace(/    this\.data\.commands\.push\(cmd\);\n    if \(this\.isPostgresProductionMode\(\)\) \{\n       this\.postgresRepo\.saveCommand\(cmd\)\.catch\(\(\) => \{\}\);\n    \} else \{\n       this\.saveData\(this\.data\);\n    \}\n    return cmd;/g, `    this.data.commands.push(cmd);
    
    // RAM cache sınırlandır (sadece son 500 komutu tut)
    if (this.data.commands.length > 500) {
       this.data.commands = this.data.commands.slice(-500);
    }

    if (this.isPostgresProductionMode()) {
       await this.postgresRepo.saveCommand(cmd).catch(() => {});
    } else {
       this.saveData(this.data);
    }
    return cmd;`);

fs.writeFileSync('src/server/db.ts', code);
