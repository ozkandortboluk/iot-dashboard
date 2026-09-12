sed -i 's/public createSession(/public async createSession(/g' src/server/repositories/user.repository.ts
sed -i 's/public createSession(/public async createSession(/g' src/server/db.ts
sed -i 's/return this.userRepository.createSession/return await this.userRepository.createSession/g' src/server/db.ts

sed -i 's/public markNotificationRead(/public async markNotificationRead(/g' src/server/repositories/notification.repository.ts
sed -i 's/public markNotificationRead(/public async markNotificationRead(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.markNotificationRead/return await this.notificationRepository.markNotificationRead/g' src/server/db.ts

sed -i 's/public markAllNotificationsRead(/public async markAllNotificationsRead(/g' src/server/repositories/notification.repository.ts
sed -i 's/public markAllNotificationsRead(/public async markAllNotificationsRead(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.markAllNotificationsRead/return await this.notificationRepository.markAllNotificationsRead/g' src/server/db.ts

sed -i 's/public saveDashboard(/public async saveDashboard(/g' src/server/repositories/notification.repository.ts
sed -i 's/public saveDashboard(/public async saveDashboard(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.saveDashboard/return await this.notificationRepository.saveDashboard/g' src/server/db.ts

sed -i 's/public logout(/public async logout(/g' src/server/repositories/user.repository.ts
sed -i 's/public logout(/public async logout(/g' src/server/db.ts
sed -i 's/return this.userRepository.logout/return await this.userRepository.logout/g' src/server/db.ts

sed -i 's/public clearUserSessions(/public async clearUserSessions(/g' src/server/repositories/user.repository.ts
sed -i 's/public clearUserSessions(/public async clearUserSessions(/g' src/server/db.ts
sed -i 's/return this.userRepository.clearUserSessions/return await this.userRepository.clearUserSessions/g' src/server/db.ts

