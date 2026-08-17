const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const replacement = `  // Notifications
  public getNotifications(requestingUserId = 'usr_admin', targetCustomerId?: string): NotificationItem[] { return this.alarmRepository.getNotifications(requestingUserId, targetCustomerId); }
  public addNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): NotificationItem { return this.alarmRepository.addNotification(notif); }
  public markNotificationRead(id: string) { return this.alarmRepository.markNotificationRead(id); }
  public markAllNotificationsRead(userId = 'usr_admin') { return this.alarmRepository.markAllNotificationsRead(userId); }
  public getDashboard(userId: string): DashboardLayout { return this.alarmRepository.getDashboard(userId); }
  public saveDashboardWidgets(userId: string, widgets: any[], title?: string): DashboardLayout { return this.alarmRepository.saveDashboardWidgets(userId, widgets, title); }
  public resetDashboard(userId: string): DashboardLayout { return this.alarmRepository.resetDashboard(userId); }
  public getAlarms(requestingUserId = 'usr_admin', targetCustomerId?: string): ActiveAlarm[] { return this.alarmRepository.getAlarms(requestingUserId, targetCustomerId); }
  public acknowledgeAlarm(alarmId: string, userId: string, userName: string) { return this.alarmRepository.acknowledgeAlarm(alarmId, userId, userName); }
  public silenceAlarm(alarmId: string, durationMinutes: number, userId: string, userName: string) { return this.alarmRepository.silenceAlarm(alarmId, durationMinutes, userId, userName); }
  public resolveAlarm(alarmId: string, userId: string, userName: string) { return this.alarmRepository.resolveAlarm(alarmId, userId, userName); }
  public getRules(requestingUserId = 'usr_admin', targetCustomerId?: string): ThresholdRule[] { return this.alarmRepository.getRules(requestingUserId, targetCustomerId); }
  public createRule(ruleData: Omit<ThresholdRule, 'id'>, requestingUser?: any): ThresholdRule { return this.alarmRepository.createRule(ruleData, requestingUser); }
  public updateRule(id: string, updates: Partial<ThresholdRule>, requestingUser?: any): ThresholdRule | null { return this.alarmRepository.updateRule(id, updates, requestingUser); }
  public deleteRule(id: string, requestingUser?: any): boolean { return this.alarmRepository.deleteRule(id, requestingUser); }
  public toggleRule(id: string, enabled: boolean, requestingUser?: any): boolean { return this.alarmRepository.toggleRule(id, enabled, requestingUser); }
  // Audit Logs`;

code = code.replace(/\/\/ Notifications.*?\/\/ Audit Logs/s, replacement);
fs.writeFileSync('src/server/db.ts', code);
