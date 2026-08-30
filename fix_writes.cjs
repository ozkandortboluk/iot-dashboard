const fs = require('fs');

// 1. Fix telemetry.repository.ts
let telCode = fs.readFileSync('src/server/repositories/telemetry.repository.ts', 'utf8');

// Replace this.db.scheduleSave(); in addTelemetryReadingBatch and addTelemetryReading
telCode = telCode.replace(/    this\.db\.scheduleSave\(\);\n    return \{/g, '    if (!this.db.isPostgresProductionMode()) {\n      this.db.scheduleSave();\n    }\n    return {');
telCode = telCode.replace(/    this\.db\.scheduleSave\(\);\n    return reading;/g, '    if (!this.db.isPostgresProductionMode()) {\n      this.db.scheduleSave();\n    }\n    return reading;');
telCode = telCode.replace(/  public processHistory\(reading: TelemetryReading, isSimulated: boolean, saveSimulatedDataToDb: boolean = false\) \{/g, '  public processHistory(reading: TelemetryReading, isSimulated: boolean, saveSimulatedDataToDb: boolean = false) {\n    if (this.db.isPostgresProductionMode()) return;\n');

fs.writeFileSync('src/server/repositories/telemetry.repository.ts', telCode);

// 2. Fix db.ts commands
let dbCode = fs.readFileSync('src/server/db.ts', 'utf8');

// Fix addCommand
const oldAddCommand = `    this.data.commands.push(cmd);
    this.saveData(this.data);
    this.postgresRepo.saveCommand(cmd).catch(() => {});
    return cmd;`;
    
const newAddCommand = `    this.data.commands.push(cmd);
    if (this.isPostgresProductionMode()) {
       this.postgresRepo.saveCommand(cmd).catch(() => {});
    } else {
       this.saveData(this.data);
    }
    return cmd;`;
dbCode = dbCode.replace(oldAddCommand, newAddCommand);

// Fix markCommandsDelivered
const oldMarkCmd = `    if (updated) {
      this.saveData(this.data);
      this.postgresRepo.markCommandsDelivered(commandIds).catch(() => {});
    }`;
const newMarkCmd = `    if (updated) {
      if (this.isPostgresProductionMode()) {
        this.postgresRepo.markCommandsDelivered(commandIds).catch(() => {});
      } else {
        this.saveData(this.data);
      }
    }`;
dbCode = dbCode.replace(oldMarkCmd, newMarkCmd);

fs.writeFileSync('src/server/db.ts', dbCode);
