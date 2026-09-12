sed -i 's/public createDevice(/public async createDevice(/g' src/server/db.ts
sed -i 's/this.deviceRepository.createDevice/await this.deviceRepository.createDevice/g' src/server/db.ts

sed -i 's/public updateDevice(/public async updateDevice(/g' src/server/db.ts
sed -i 's/this.deviceRepository.updateDevice/await this.deviceRepository.updateDevice/g' src/server/db.ts

sed -i 's/public deleteDevice(/public async deleteDevice(/g' src/server/db.ts
sed -i 's/this.deviceRepository.deleteDevice/await this.deviceRepository.deleteDevice/g' src/server/db.ts

