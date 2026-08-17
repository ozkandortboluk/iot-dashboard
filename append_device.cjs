const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const match = code.match(/  \/\/ Device Downlink Commands(.*?)  \/\/ Stats & System/s);
if (match) {
  let repCode = fs.readFileSync('src/server/repositories/device.repository.ts', 'utf8');
  repCode = repCode.replace(/}$/, match[1].replace(/this\.data/g, 'this.db.data').replace(/this\.saveData/g, 'this.db.saveData').replace(/this\.postgresRepo/g, 'this.db.postgresRepo') + '\n}');
  fs.writeFileSync('src/server/repositories/device.repository.ts', repCode);
  
  const replacement = `  // Device Downlink Commands
  public getCommands(deviceId?: string): DeviceCommand[] { return this.deviceRepository.getCommands(deviceId); }
  public getPendingCommands(deviceId: string): DeviceCommand[] { return this.deviceRepository.getPendingCommands(deviceId); }
  public addCommand(deviceId: string, commandStr: string, payloadStr: string | number, source?: string): DeviceCommand { return this.deviceRepository.addCommand(deviceId, commandStr, payloadStr, source); }
  public markCommandsDelivered(commandIds: string[]): void { return this.deviceRepository.markCommandsDelivered(commandIds); }
  // Stats & System`;

  code = code.replace(/  \/\/ Device Downlink Commands.*?  \/\/ Stats & System/s, replacement);
  fs.writeFileSync('src/server/db.ts', code);
}
