# Make device repository methods async
sed -i 's/public regenerateApiKey(/public async regenerateApiKey(/g' src/server/repositories/device.repository.ts
sed -i 's/public regenerateApiKey(/public async regenerateApiKey(/g' src/server/db.ts

sed -i 's/public rotateApiKey(/public async rotateApiKey(/g' src/server/repositories/device.repository.ts
sed -i 's/public rotateApiKey(/public async rotateApiKey(/g' src/server/db.ts

sed -i 's/public revokeApiKey(/public async revokeApiKey(/g' src/server/repositories/device.repository.ts
sed -i 's/public revokeApiKey(/public async revokeApiKey(/g' src/server/db.ts

sed -i 's/public setDeviceMaintenanceMode(/public async setDeviceMaintenanceMode(/g' src/server/repositories/device.repository.ts
sed -i 's/public setDeviceMaintenanceMode(/public async setDeviceMaintenanceMode(/g' src/server/db.ts

sed -i 's/public updateDeviceTags(/public async updateDeviceTags(/g' src/server/repositories/device.repository.ts
sed -i 's/public updateDeviceTags(/public async updateDeviceTags(/g' src/server/db.ts

sed -i 's/public assignDeviceOwner(/public async assignDeviceOwner(/g' src/server/repositories/device.repository.ts
sed -i 's/public assignDeviceOwner(/public async assignDeviceOwner(/g' src/server/db.ts

sed -i 's/public restoreApiKey(/public async restoreApiKey(/g' src/server/repositories/device.repository.ts
sed -i 's/public restoreApiKey(/public async restoreApiKey(/g' src/server/db.ts

sed -i 's/public updateApiKeySettings(/public async updateApiKeySettings(/g' src/server/repositories/device.repository.ts
sed -i 's/public updateApiKeySettings(/public async updateApiKeySettings(/g' src/server/db.ts

sed -i 's/public convertToPhysicalDevice(/public async convertToPhysicalDevice(/g' src/server/repositories/device.repository.ts
sed -i 's/public convertToPhysicalDevice(/public async convertToPhysicalDevice(/g' src/server/db.ts

sed -i 's/public replaceDeviceHardware(/public async replaceDeviceHardware(/g' src/server/repositories/device.repository.ts
sed -i 's/public replaceDeviceHardware(/public async replaceDeviceHardware(/g' src/server/db.ts

