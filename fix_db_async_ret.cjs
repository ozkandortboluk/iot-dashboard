const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/public async addCommand\(deviceId: string, commandStr: string, payloadStr: string \| number, source: string = 'user_ui'\): DeviceCommand/g, "public async addCommand(deviceId: string, commandStr: string, payloadStr: string | number, source: string = 'user_ui'): Promise<DeviceCommand>");

fs.writeFileSync('src/server/db.ts', code);
