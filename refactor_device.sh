sed -i 's/public createDevice(/public async createDevice(/g' src/server/repositories/device.repository.ts
sed -i 's/this.db.postgresRepo?.saveDevice(newDevice).catch(() => {});/await this.db.postgresRepo?.saveDevice(newDevice);/g' src/server/repositories/device.repository.ts

sed -i 's/public updateDevice(/public async updateDevice(/g' src/server/repositories/device.repository.ts
sed -i 's/this.db.postgresRepo?.saveDevice(dev).catch(() => {});/await this.db.postgresRepo?.saveDevice(dev);/g' src/server/repositories/device.repository.ts

sed -i 's/public deleteDevice(/public async deleteDevice(/g' src/server/repositories/device.repository.ts
sed -i 's/this.db.postgresRepo?.deleteDevice(deviceId).catch(() => {});/await this.db.postgresRepo?.deleteDevice(deviceId);/g' src/server/repositories/device.repository.ts

