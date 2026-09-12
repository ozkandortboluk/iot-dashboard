sed -i 's/return this.deviceRepository.regenerateApiKey/return await this.deviceRepository.regenerateApiKey/g' src/server/db.ts
sed -i 's/return this.deviceRepository.rotateApiKey/return await this.deviceRepository.rotateApiKey/g' src/server/db.ts
sed -i 's/return this.deviceRepository.revokeApiKey/return await this.deviceRepository.revokeApiKey/g' src/server/db.ts
sed -i 's/return this.deviceRepository.setDeviceMaintenanceMode/return await this.deviceRepository.setDeviceMaintenanceMode/g' src/server/db.ts
sed -i 's/return this.deviceRepository.updateDeviceTags/return await this.deviceRepository.updateDeviceTags/g' src/server/db.ts
sed -i 's/return this.deviceRepository.assignDeviceOwner/return await this.deviceRepository.assignDeviceOwner/g' src/server/db.ts
sed -i 's/return this.deviceRepository.restoreApiKey/return await this.deviceRepository.restoreApiKey/g' src/server/db.ts
sed -i 's/return this.deviceRepository.updateApiKeySettings/return await this.deviceRepository.updateApiKeySettings/g' src/server/db.ts
sed -i 's/return this.deviceRepository.convertToPhysicalDevice/return await this.deviceRepository.convertToPhysicalDevice/g' src/server/db.ts
sed -i 's/return this.deviceRepository.replaceDeviceHardware/return await this.deviceRepository.replaceDeviceHardware/g' src/server/db.ts

