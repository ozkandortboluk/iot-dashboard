const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const oldMark = `  public markCommandsDelivered(commandIds: string[]): void {
    if (!this.data.commands) return;
    let updated = false;
    const now = new Date().toISOString();
    for (const cmd of this.data.commands) {
      if (commandIds.includes(cmd.id) && cmd.status === 'pending') {
        cmd.status = 'delivered';
        cmd.delivered_at = now;
        updated = true;
      }
    }
    if (updated) {
      if (this.isPostgresProductionMode()) {
        this.postgresRepo.markCommandsDelivered(commandIds).catch(() => {});
      } else {
        this.saveData(this.data);
      }
    }
  }`;

const newMark = `  public markCommandsDelivered(commandIds: string[]): void {
    if (!commandIds || commandIds.length === 0) return;
    
    if (this.isPostgresProductionMode()) {
      this.postgresRepo.markCommandsDelivered(commandIds).catch(() => {});
    }

    if (!this.data.commands) return;
    let updated = false;
    const now = new Date().toISOString();
    for (const cmd of this.data.commands) {
      if (commandIds.includes(cmd.id) && cmd.status === 'pending') {
        cmd.status = 'delivered';
        cmd.delivered_at = now;
        updated = true;
      }
    }
    
    if (updated && !this.isPostgresProductionMode()) {
      this.saveData(this.data);
    }
  }`;

code = code.replace(oldMark, newMark);
fs.writeFileSync('src/server/db.ts', code);
