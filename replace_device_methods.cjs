const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const replacement = `  public checkDeviceStatuses(): boolean { return this.deviceRepository.checkDeviceStatuses(); }
  public getDevices(userId?: string, customerId?: string): Device[] { return this.deviceRepository.getDevices(userId, customerId); }
  public assignDeviceOwner(deviceId: string, targetUserId: string): Device { return this.deviceRepository.assignDeviceOwner(deviceId, targetUserId); }
  public getDeviceByApiKey(apiKey: string): Device { return this.deviceRepository.getDeviceByApiKey(apiKey); }
  public createDevice(userId: string, name: string, type: Device['type'], location: string): Device { return this.deviceRepository.createDevice(userId, name, type, location); }
  public regenerateApiKey(deviceId: string): Device { return this.deviceRepository.regenerateApiKey(deviceId); }
  public updateDevice(deviceId: string, updates: Partial<Device>): Device { return this.deviceRepository.updateDevice(deviceId, updates); }
  public deleteDevice(deviceId: string): void { return this.deviceRepository.deleteDevice(deviceId); }
  public recordUnregisteredDevice(ip: string, reason: string, headers: any, rawPayload: any): void { return this.deviceRepository.recordUnregisteredDevice(ip, reason, headers, rawPayload); }
  public removeUnregisteredDevice(ipOrMacOrToken: string): void { return this.deviceRepository.removeUnregisteredDevice(ipOrMacOrToken); }
  public getDiscoveredDevices(): DiscoveredNetworkDevice[] { return this.deviceRepository.getDiscoveredDevices(); }
  // Telemetry`;

code = code.replace(/\/\/ Devices.*?\/\/ Telemetry/s, replacement);

fs.writeFileSync('src/server/db.ts', code);
