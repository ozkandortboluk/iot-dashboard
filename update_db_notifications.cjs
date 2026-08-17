const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/this\.alarmRepository\.getNotifications/g, 'this.notificationRepository.getNotifications');
code = code.replace(/this\.alarmRepository\.addNotification/g, 'this.notificationRepository.addNotification');
code = code.replace(/this\.alarmRepository\.markNotificationRead/g, 'this.notificationRepository.markNotificationRead');
code = code.replace(/this\.alarmRepository\.markAllNotificationsRead/g, 'this.notificationRepository.markAllNotificationsRead');
code = code.replace(/this\.alarmRepository\.getDashboard/g, 'this.notificationRepository.getDashboard');
code = code.replace(/this\.alarmRepository\.saveDashboardWidgets/g, 'this.notificationRepository.saveDashboardWidgets');
code = code.replace(/this\.alarmRepository\.resetDashboard/g, 'this.notificationRepository.resetDashboard');

fs.writeFileSync('src/server/db.ts', code);
