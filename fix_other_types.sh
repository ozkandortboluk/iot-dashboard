sed -i 's/public createRule(/public async createRule(/g' src/server/repositories/alarm.repository.ts
sed -i 's/public createRule(/public async createRule(/g' src/server/db.ts
sed -i 's/return this.alarmRepository.createRule/return await this.alarmRepository.createRule/g' src/server/db.ts

sed -i 's/public updateRule(/public async updateRule(/g' src/server/repositories/alarm.repository.ts
sed -i 's/public updateRule(/public async updateRule(/g' src/server/db.ts
sed -i 's/return this.alarmRepository.updateRule/return await this.alarmRepository.updateRule/g' src/server/db.ts

sed -i 's/public deleteRule(/public async deleteRule(/g' src/server/repositories/alarm.repository.ts
sed -i 's/public deleteRule(/public async deleteRule(/g' src/server/db.ts
sed -i 's/return this.alarmRepository.deleteRule/return await this.alarmRepository.deleteRule/g' src/server/db.ts

sed -i 's/public toggleRule(/public async toggleRule(/g' src/server/repositories/alarm.repository.ts
sed -i 's/public toggleRule(/public async toggleRule(/g' src/server/db.ts
sed -i 's/return this.alarmRepository.toggleRule/return await this.alarmRepository.toggleRule/g' src/server/db.ts

sed -i 's/public addNotification(/public async addNotification(/g' src/server/repositories/notification.repository.ts
sed -i 's/public addNotification(/public async addNotification(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.addNotification/return await this.notificationRepository.addNotification/g' src/server/db.ts

sed -i 's/public markNotificationAsRead(/public async markNotificationAsRead(/g' src/server/repositories/notification.repository.ts
sed -i 's/public markNotificationAsRead(/public async markNotificationAsRead(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.markNotificationAsRead/return await this.notificationRepository.markNotificationAsRead/g' src/server/db.ts

sed -i 's/public markAllNotificationsAsRead(/public async markAllNotificationsAsRead(/g' src/server/repositories/notification.repository.ts
sed -i 's/public markAllNotificationsAsRead(/public async markAllNotificationsAsRead(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.markAllNotificationsAsRead/return await this.notificationRepository.markAllNotificationsAsRead/g' src/server/db.ts

sed -i 's/public updateDashboardLayout(/public async updateDashboardLayout(/g' src/server/repositories/notification.repository.ts
sed -i 's/public updateDashboardLayout(/public async updateDashboardLayout(/g' src/server/db.ts
sed -i 's/return this.notificationRepository.updateDashboardLayout/return await this.notificationRepository.updateDashboardLayout/g' src/server/db.ts

sed -i 's/public addSession(/public async addSession(/g' src/server/repositories/user.repository.ts
sed -i 's/public addSession(/public async addSession(/g' src/server/db.ts
sed -i 's/return this.userRepository.addSession/return await this.userRepository.addSession/g' src/server/db.ts

sed -i 's/public removeSession(/public async removeSession(/g' src/server/repositories/user.repository.ts
sed -i 's/public removeSession(/public async removeSession(/g' src/server/db.ts
sed -i 's/return this.userRepository.removeSession/return await this.userRepository.removeSession/g' src/server/db.ts

sed -i 's/public addAuditLog(/public async addAuditLog(/g' src/server/repositories/user.repository.ts
sed -i 's/public addAuditLog(/public async addAuditLog(/g' src/server/db.ts
sed -i 's/return this.userRepository.addAuditLog/return await this.userRepository.addAuditLog/g' src/server/db.ts

