sed -i 's/this.db.postgresRepo.saveRule(newRule).catch(() => {});/await this.db.postgresRepo.saveRule(newRule);/g' src/server/repositories/alarm.repository.ts
sed -i 's/this.db.postgresRepo.saveRule(r).catch(() => {});/await this.db.postgresRepo.saveRule(r);/g' src/server/repositories/alarm.repository.ts
sed -i 's/this.db.postgresRepo.deleteRule(id).catch(() => {});/await this.db.postgresRepo.deleteRule(id);/g' src/server/repositories/alarm.repository.ts

sed -i 's/this.db.postgresRepo.saveNotification(fullNotif).catch(() => {});/await this.db.postgresRepo.saveNotification(fullNotif);/g' src/server/repositories/notification.repository.ts
sed -i 's/this.db.postgresRepo.markNotificationRead(id).catch(() => {});/await this.db.postgresRepo.markNotificationRead(id);/g' src/server/repositories/notification.repository.ts
sed -i 's/this.db.postgresRepo.markAllNotificationsRead(.*).catch(() => {});/await this.db.postgresRepo.markAllNotificationsRead(userId === '"'usr_admin'"' ? undefined : userId);/g' src/server/repositories/notification.repository.ts
sed -i 's/this.db.postgresRepo.saveDashboard(newDash).catch(() => {});/await this.db.postgresRepo.saveDashboard(newDash);/g' src/server/repositories/notification.repository.ts
sed -i 's/this.db.postgresRepo.saveDashboard(userDash).catch(() => {});/await this.db.postgresRepo.saveDashboard(userDash);/g' src/server/repositories/notification.repository.ts

sed -i 's/this.db.postgresRepo.saveSession(session).catch(() => {});/await this.db.postgresRepo.saveSession(session);/g' src/server/repositories/user.repository.ts
sed -i 's/this.db.postgresRepo.deleteSession(cleanToken).catch(() => {});/await this.db.postgresRepo.deleteSession(cleanToken);/g' src/server/repositories/user.repository.ts
sed -i 's/await this.db.postgresRepo.deleteUserSessions(userId).catch(() => {});/await this.db.postgresRepo.deleteUserSessions(userId);/g' src/server/repositories/user.repository.ts
sed -i 's/this.db.postgresRepo.saveAuditLog(logItem).catch(() => {});/await this.db.postgresRepo.saveAuditLog(logItem);/g' src/server/repositories/user.repository.ts

