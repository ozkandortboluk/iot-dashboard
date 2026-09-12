sed -i 's/public async processDeviceTelemetryArrival(deviceId: string): Device | null {/public async processDeviceTelemetryArrival(deviceId: string): Promise<Device | null> {/g' src/server/db.ts
sed -i 's/public async processDeviceTelemetryArrival(deviceId: string): Device | null {/public async processDeviceTelemetryArrival(deviceId: string): Promise<Device | null> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async regenerateApiKey(deviceId: string): string {/public async regenerateApiKey(deviceId: string): Promise<string> {/g' src/server/db.ts
sed -i 's/public async regenerateApiKey(deviceId: string): string {/public async regenerateApiKey(deviceId: string): Promise<string> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async rotateApiKey(deviceId: string, options?: { expiresDays?: number; scopes?: string\[\] }) {/public async rotateApiKey(deviceId: string, options?: { expiresDays?: number; scopes?: string\[\] }): Promise<any> {/g' src/server/db.ts
sed -i 's/public async rotateApiKey(deviceId: string, options?: { expiresDays?: number; scopes?: string\[\] }) {/public async rotateApiKey(deviceId: string, options?: { expiresDays?: number; scopes?: string\[\] }): Promise<any> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async revokeApiKey(deviceId: string, reason?: string): Device {/public async revokeApiKey(deviceId: string, reason?: string): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async revokeApiKey(deviceId: string, reason?: string): Device {/public async revokeApiKey(deviceId: string, reason?: string): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async setDeviceMaintenanceMode(.*): Device {/public async setDeviceMaintenanceMode(deviceId: string, enabled: boolean, reason?: string, until?: string, requestingUser?: any): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async setDeviceMaintenanceMode(.*): Device {/public async setDeviceMaintenanceMode(deviceId: string, enabled: boolean, reason?: string, until?: string, requestingUser?: any): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async updateDeviceTags(.*): Device {/public async updateDeviceTags(deviceId: string, tags: string\[\], requestingUser?: any): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async updateDeviceTags(.*): Device {/public async updateDeviceTags(deviceId: string, tags: string\[\], requestingUser?: any): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async assignDeviceOwner(.*): Device | undefined {/public async assignDeviceOwner(deviceId: string, targetTenantId: string): Promise<Device | undefined> {/g' src/server/db.ts
sed -i 's/public async assignDeviceOwner(.*): Device | undefined {/public async assignDeviceOwner(deviceId: string, targetTenantId: string): Promise<Device | undefined> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async restoreApiKey(.*): Device {/public async restoreApiKey(deviceId: string): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async restoreApiKey(.*): Device {/public async restoreApiKey(deviceId: string): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async updateApiKeySettings(.*): Device {/public async updateApiKeySettings(deviceId: string, options: any): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async updateApiKeySettings(.*): Device {/public async updateApiKeySettings(deviceId: string, options: any): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async convertToPhysicalDevice(.*): Device {/public async convertToPhysicalDevice(deviceId: string): Promise<Device> {/g' src/server/db.ts
sed -i 's/public async convertToPhysicalDevice(.*): Device {/public async convertToPhysicalDevice(deviceId: string): Promise<Device> {/g' src/server/repositories/device.repository.ts

sed -i 's/public async replaceDeviceHardware(.*): { device: Device; record: DeviceReplacementRecord } {/public async replaceDeviceHardware(oldDeviceId: string, newMacAddress?: string, replacementReason?: string, replacedBy?: string): Promise<{ device: Device; record: DeviceReplacementRecord }> {/g' src/server/db.ts
sed -i 's/public async replaceDeviceHardware(.*): { device: Device; record: DeviceReplacementRecord } {/public async replaceDeviceHardware(oldDeviceId: string, newMacAddress?: string, replacementReason?: string, replacedBy?: string): Promise<{ device: Device; record: DeviceReplacementRecord }> {/g' src/server/repositories/device.repository.ts

