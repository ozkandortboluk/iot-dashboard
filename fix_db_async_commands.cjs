const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const oldGetCmds = `  public getCommands(deviceId?: string): DeviceCommand[] {
    if (!this.data.commands) this.data.commands = [];
    if (deviceId && deviceId !== 'all') {
      return this.data.commands.filter((c) => c.deviceId === deviceId);
    }
    return this.data.commands.slice(-100).reverse();
  }`;

const newGetCmds = `  public async getCommands(deviceId?: string): Promise<DeviceCommand[]> {
    if (this.isPostgresProductionMode()) {
      if (deviceId && deviceId !== 'all') {
         return await this.postgresRepo.getCommands(deviceId);
      } else {
         return []; // Not supported/used currently to fetch all commands for all devices from PG without limit
      }
    }
    if (!this.data.commands) this.data.commands = [];
    if (deviceId && deviceId !== 'all') {
      return this.data.commands.filter((c) => c.deviceId === deviceId);
    }
    return this.data.commands.slice(-100).reverse();
  }`;

code = code.replace(oldGetCmds, newGetCmds);

const oldGetPending = `  public getPendingCommands(deviceId: string): DeviceCommand[] {
    if (!this.data.commands) this.data.commands = [];
    return this.data.commands.filter((c) => c.deviceId === deviceId && c.status === 'pending');
  }`;

const newGetPending = `  public async getPendingCommands(deviceId: string): Promise<DeviceCommand[]> {
    if (this.isPostgresProductionMode()) {
       return await this.postgresRepo.getPendingCommands(deviceId);
    }
    if (!this.data.commands) this.data.commands = [];
    return this.data.commands.filter((c) => c.deviceId === deviceId && c.status === 'pending');
  }`;

code = code.replace(oldGetPending, newGetPending);

fs.writeFileSync('src/server/db.ts', code);
