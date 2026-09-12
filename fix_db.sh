sed -i 's/public async createDeviceGroup(/public createDeviceGroup(/g' src/server/db.ts
sed -i 's/await this.deviceRepository.createDeviceGroup/this.deviceRepository.createDeviceGroup/g' src/server/db.ts

sed -i 's/public async deleteDeviceGroup(/public deleteDeviceGroup(/g' src/server/db.ts
sed -i 's/await this.deviceRepository.deleteDeviceGroup/this.deviceRepository.deleteDeviceGroup/g' src/server/db.ts

