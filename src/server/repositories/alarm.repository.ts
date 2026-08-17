import crypto from 'crypto';
import type { NotificationItem, ActiveAlarm, ThresholdRule, DispatchLogItem } from '../../types.js';

export class AlarmRepository {
  constructor(private db: any) {}

  public getAlarms(requestingUserId = 'usr_admin', targetCustomerId?: string): ActiveAlarm[] {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const list: ActiveAlarm[] = this.db.data.activeAlarms;

    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    if (reqUser && reqUser.role === 'customer') {
      // Customer can ONLY see alarms that belong strictly to their account
      return list.filter((a) => a.userId === requestingUserId);
    }

    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return list.filter((a) => a.userId === targetCustomerId);
    }

    return list;
  }

  public acknowledgeAlarm(alarmId: string, userId: string, userName: string) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return;

    const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (reqUser && reqUser.role === 'customer' && alarm.userId !== userId) {
      // Forbidden: Customer cannot manipulate other users' alarms
      return;
    }

    alarm.acknowledged = true;
    alarm.acknowledgedAt = new Date().toISOString();
    alarm.acknowledgedBy = userName || userId;
    alarm.updatedAt = alarm.acknowledgedAt;
    alarm.version = (alarm.version || 1) + 1;
    this.db.telemetryRepository.upsertActiveAlarm(alarm);

    this.db.telemetryRepository.emitAlarmNotification(
      alarm,
      'ACKNOWLEDGED',
      `ℹ️ [ALARM ONAYLANDI] ${alarm.deviceName} - ${alarm.metricKey.toUpperCase()}`,
      `Alarm ${userName || userId} tarafından onaylandı. Tekrar bildirimleri durduruldu.`
    );
    this.db.addAuditLog(userId, userName, `Alarm onaylandı (${alarm.deviceName})`, 'low');
    this.db.saveData(this.db.data);
  }

  public silenceAlarm(alarmId: string, durationMinutes: number, userId: string, userName: string) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return;

    const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (reqUser && reqUser.role === 'customer' && alarm.userId !== userId) {
      // Forbidden: Customer cannot manipulate other users' alarms
      return;
    }

    const silenceEnd = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    alarm.silencedUntil = silenceEnd;
    alarm.state = 'SILENCED';
    alarm.updatedAt = new Date().toISOString();
    alarm.version = (alarm.version || 1) + 1;
    this.db.telemetryRepository.upsertActiveAlarm(alarm);

    this.db.addAuditLog(userId, userName, `Alarm ${durationMinutes} dakika boyunca susturuldu (${alarm.deviceName})`, 'medium');
    this.db.saveData(this.db.data);
  }

  public resolveAlarm(alarmId: string, userId: string, userName: string) {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return;

    const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (reqUser && reqUser.role === 'customer' && alarm.userId !== userId) {
      // Forbidden: Customer cannot manipulate other users' alarms
      return;
    }

    alarm.state = 'RESOLVED';
    alarm.resolvedAt = new Date().toISOString();
    alarm.updatedAt = alarm.resolvedAt;
    alarm.version = (alarm.version || 1) + 1;
    this.db.telemetryRepository.upsertActiveAlarm(alarm);

    this.db.telemetryRepository.emitAlarmNotification(
      alarm,
      'RESOLVED',
      `✅ [ALARM MANÜEL KAPATILDI] ${alarm.deviceName}`,
      `Alarm ${userName || userId} tarafından manuel olarak kapatıldı.`
    );
    this.db.addAuditLog(userId, userName, `Alarm kapatıldı (${alarm.deviceName})`, 'medium');
    this.db.saveData(this.db.data);
  }

  // Threshold Rules
  public getRules(requestingUserId = 'usr_admin', targetCustomerId?: string): ThresholdRule[] {
    if (!this.db.data.rules) this.db.data.rules = [];
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    
    if (reqUser && reqUser.role === 'customer') {
      // Customer sees ONLY their own created rules (never other customers, never admin rules)
      return this.db.data.rules.filter((r: ThresholdRule) => r.userId === requestingUserId);
    }

    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return this.db.data.rules.filter((r: ThresholdRule) => r.userId === targetCustomerId);
    }

    return this.db.data.rules;
  }

  public createRule(ruleData: Omit<ThresholdRule, 'id'>, requestingUser?: { id: string; name: string; role: string }): ThresholdRule {
    if (!this.db.data.rules) this.db.data.rules = [];
    let ownerId = ruleData.userId || 'usr_admin';
    let ownerName = ruleData.userName || 'Sistem Yöneticisi';

    if (requestingUser) {
      if (requestingUser.role === 'customer') {
        // Force ownership to customer
        ownerId = requestingUser.id;
        ownerName = requestingUser.name;
        // Verify customer owns the target device if deviceId is specific
        if (ruleData.deviceId && ruleData.deviceId !== 'all') {
          const userDevices = (this.db.data.devices || []).filter((d: any) => d.userId === requestingUser.id);
          const ownsDev = userDevices.some((d: any) => d.id === ruleData.deviceId);
          if (!ownsDev) {
            ruleData.deviceId = 'all';
          }
        }
      } else if (requestingUser.role === 'admin' && ruleData.userId) {
        const foundUser = (this.db.data.users || []).find((u: any) => u.id === ruleData.userId);
        if (foundUser) ownerName = foundUser.name;
      }
    }

    const newRule: ThresholdRule = {
      ...ruleData,
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      userId: ownerId,
      userName: ownerName,
      notificationChannels: ruleData.notificationChannels || ['app'],
      activeHours: ruleData.activeHours || '00:00-23:59',
      recipients: ruleData.recipients || [],
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    this.db.data.rules.push(newRule);
    this.db.addAuditLog(ownerId, ownerName, `Yeni eşik kuralı oluşturuldu: ${newRule.metricKey.toUpperCase()} ${newRule.operator} ${newRule.thresholdValue}`, 'medium');
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveRule(newRule).catch(() => {});
    return newRule;
  }

  public updateRule(id: string, updates: Partial<ThresholdRule>, requestingUser?: { id: string; role: string }): ThresholdRule | null {
    if (!this.db.data.rules) this.db.data.rules = [];
    const r = this.db.data.rules.find((item: ThresholdRule) => item.id === id);
    if (!r) return null;

    if (requestingUser && requestingUser.role !== 'admin' && r.userId !== requestingUser.id) {
      return null; // Forbidden: Müşteri başkasının kuralını değiştiremez
    }

    // If customer, do not allow changing ownership
    if (requestingUser && requestingUser.role === 'customer') {
      delete (updates as any).userId;
      delete (updates as any).userName;
    }

    Object.assign(r, updates);
    r.updatedAt = new Date().toISOString();
    r.version = (r.version || 1) + 1;
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveRule(r).catch(() => {});
    return r;
  }

  public deleteRule(id: string, requestingUser?: { id: string; role: string }): boolean {
    if (!this.db.data.rules) this.db.data.rules = [];
    const idx = this.db.data.rules.findIndex((r: ThresholdRule) => r.id === id);
    if (idx < 0) return false;

    const r = this.db.data.rules[idx];
    if (requestingUser && requestingUser.role !== 'admin' && r.userId !== requestingUser.id) {
      return false; // Forbidden: Müşteri başkasının kuralını silemez
    }

    this.db.data.rules.splice(idx, 1);
    this.db.saveData(this.db.data);
    this.db.postgresRepo.deleteRule(id).catch(() => {});
    return true;
  }

  public toggleRule(id: string, enabled: boolean, requestingUser?: { id: string; role: string }): boolean {
    if (!this.db.data.rules) this.db.data.rules = [];
    const r = this.db.data.rules.find((item: ThresholdRule) => item.id === id);
    if (!r) return false;

    if (requestingUser && requestingUser.role !== 'admin' && r.userId !== requestingUser.id) {
      return false; // Forbidden: Müşteri başkasının kuralını değiştiremez
    }

    r.enabled = enabled;
    r.updatedAt = new Date().toISOString();
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveRule(r).catch(() => {});
    return true;
  }
}
