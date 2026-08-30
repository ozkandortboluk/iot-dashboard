const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(
  /public getNotifications\(requestingUserId = 'usr_admin', targetCustomerId\?: string\): NotificationItem\[\] \{ return this\.notificationRepository\.getNotifications\(requestingUserId, targetCustomerId\); \}/,
  `public async getNotifications(requestingUserId = 'usr_admin', targetCustomerId?: string): Promise<NotificationItem[]> {
    if (this.isPostgresProductionMode()) {
       return await this.postgresRepo.getNotifications(targetCustomerId || requestingUserId);
    }
    return this.notificationRepository.getNotifications(requestingUserId, targetCustomerId);
  }`
);

code = code.replace(
  /public getAlarms\(requestingUserId = 'usr_admin', targetCustomerId\?: string, options\?: any\): any \{ return this\.alarmRepository\.getAlarms\(requestingUserId, targetCustomerId, options\); \}/,
  `public async getAlarms(requestingUserId = 'usr_admin', targetCustomerId?: string, options?: any): Promise<any> {
    if (this.isPostgresProductionMode()) {
       let list = await this.postgresRepo.getAlarms(targetCustomerId || requestingUserId);
       if (options?.status && options.status !== 'all') {
         list = list.filter((a: any) => options.status === 'resolved' ? a.state === 'RESOLVED' : a.state !== 'RESOLVED');
       }
       if (options?.severity && options.severity !== 'all') {
         list = list.filter((a: any) => a.severity === options.severity);
       }
       return { data: list, total: list.length };
    }
    return this.alarmRepository.getAlarms(requestingUserId, targetCustomerId, options);
  }`
);

code = code.replace(
  /public getDispatchLogs\(requestingUserId = 'usr_admin', targetCustomerId\?: string, options\?: any\): any \{/,
  `public async getDispatchLogs(requestingUserId = 'usr_admin', targetCustomerId?: string, options?: any): Promise<any> {
    if (this.isPostgresProductionMode()) {
       let list = await this.postgresRepo.getDispatchLogs(targetCustomerId || requestingUserId);
       return { data: list, total: list.length };
    }`
);

// Add getAlarmEvents
const alarmEventsCode = `
  public async getAlarmEvents(requestingUserId = 'usr_admin', targetCustomerId?: string, incidentId?: string, alarmId?: string, deviceId?: string): Promise<any[]> {
    if (this.isPostgresProductionMode()) {
       return await this.postgresRepo.getAlarmEvents(targetCustomerId || requestingUserId, incidentId, alarmId, deviceId);
    }
    let events = this.data.alarmEvents || [];
    const effectiveTenant = targetCustomerId || requestingUserId;
    if (effectiveTenant && effectiveTenant !== 'usr_admin' && effectiveTenant !== 'all') {
      events = events.filter((e) => e.tenantId === effectiveTenant);
    }
    if (incidentId) events = events.filter((e) => e.incidentId === incidentId);
    if (alarmId) events = events.filter((e) => e.alarmId === alarmId);
    if (deviceId) events = events.filter((e) => e.deviceId === deviceId);
    return events.slice(-1000).reverse();
  }
`;

code = code.replace(/public toggleRule\(/, alarmEventsCode + '\n  public toggleRule(');

fs.writeFileSync('src/server/db.ts', code);
