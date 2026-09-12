sed -i 's/public deleteSession(/public async deleteSession(/g' src/server/repositories/user.repository.ts
sed -i 's/public deleteSession(/public async deleteSession(/g' src/server/db.ts
sed -i 's/return this.userRepository.deleteSession/return await this.userRepository.deleteSession/g' src/server/db.ts

sed -i 's/public getDashboard(/public async getDashboard(/g' src/server/repositories/notification.repository.ts
sed -i 's/public getDashboard(/public async getDashboard(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.getDashboard/return await this.notificationRepository.getDashboard/g' src/server/db.ts

sed -i "s/router.get('\/layout', authenticateUser, (req/router.get('\/layout', authenticateUser, async (req/g" src/server/routes/alarms.ts
sed -i "s/const layout = db.getDashboard(/const layout = await db.getDashboard(/g" src/server/routes/alarms.ts

