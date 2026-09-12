import crypto from 'crypto';
import type { NotificationItem, ActiveAlarm, ThresholdRule, DispatchLogItem, PaginatedResponse } from '../../types.js';

export interface AlarmQueryOptions {
  limit?: number;
  cursor?: string;
  status?: string;
  severity?: string;
  deviceId?: string;
  search?: string;
}

export interface RuleQueryOptions {
  limit?: number;
  cursor?: string;
  severity?: string;
  enabled?: boolean | string;
  deviceId?: string;
  search?: string;
}

export interface UpdateRuleResult {
  success: boolean;
  rule?: ThresholdRule;
  conflict?: boolean;
  currentVersion?: number;
  forbidden?: boolean;
  notFound?: boolean;
}

export class AlarmRepository {
  constructor(private db: any) {}

  public getAlarms(requestingUserId = 'usr_admin', targetCustomerId?: string, options?: AlarmQueryOptions): any {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    let list: ActiveAlarm[] = this.db.data.activeAlarms;

    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    if (reqUser && reqUser.role === 'customer') {
      // Customer can ONLY see alarms that belong strictly to their account
      list = list.filter((a) => a.tenantId === requestingUserId);
    } else if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      list = list.filter((a) => a.tenantId === targetCustomerId);
    }

    if (!options) {
      return list;
    }

    // Apply filtering
    if (options.status && options.status !== 'all') {
      const st = options.status.toLowerCase();
      if (st === 'active') {
        list = list.filter((a) => a.state === 'ACTIVE' || a.state === 'BREACH_PENDING' || a.state === 'SILENCED');
      } else if (st === 'acknowledged') {
        list = list.filter((a) => a.acknowledged);
      } else if (st === 'unacknowledged') {
        list = list.filter((a) => !a.acknowledged && (a.state === 'ACTIVE' || a.state === 'BREACH_PENDING'));
      } else if (st === 'silenced') {
        list = list.filter((a) => a.state === 'SILENCED');
      } else if (st === 'resolved') {
        list = list.filter((a) => a.state === 'RESOLVED');
      } else {
        list = list.filter((a) => a.state.toLowerCase() === st);
      }
    }

    if (options.severity && options.severity !== 'all') {
      list = list.filter((a) => a.severity.toLowerCase() === options.severity?.toLowerCase());
    }

    if (options.deviceId && options.deviceId !== 'all') {
      list = list.filter((a) => a.deviceId === options.deviceId);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.deviceName?.toLowerCase().includes(q) ||
          a.metricKey?.toLowerCase().includes(q) ||
          a.message?.toLowerCase().includes(q) ||
          a.id?.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));

    let startIndex = 0;
    if (options.cursor) {
      const foundIdx = list.findIndex((a) => a.id === options.cursor);
      if (foundIdx >= 0) {
        startIndex = foundIdx + 1;
      }
    }

    const paged = list.slice(startIndex, startIndex + limit);
    const nextCursor = paged.length === limit && startIndex + limit < total ? paged[paged.length - 1].id : null;
    const hasMore = nextCursor !== null;

    return {
      data: paged,
      total,
      limit,
      nextCursor,
      hasMore,
    };
  }

  public acknowledgeAlarm(alarmId: string, currentUser: any): boolean {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return false;

    if (currentUser.role !== 'admin' && alarm.tenantId !== currentUser.id) {
      throw new Error('Bu alarma erişim yetkiniz yok.');
    }

    alarm.acknowledged = true;
    alarm.acknowledgedAt = new Date().toISOString();
    alarm.acknowledgedBy = currentUser.name || currentUser.id;
    alarm.updatedAt = alarm.acknowledgedAt;
    alarm.version = (alarm.version || 1) + 1;
    this.db.telemetryRepository.upsertActiveAlarm(alarm);

    this.db.telemetryRepository.emitAlarmNotification(
      alarm,
      'ACKNOWLEDGED',
      `ℹ️ [ALARM ONAYLANDI] ${alarm.deviceName} - ${alarm.metricKey.toUpperCase()}`,
      `Alarm ${currentUser.name || currentUser.id} tarafından onaylandı. Tekrar bildirimleri durduruldu.`,
      currentUser.id
    );
    this.db.addAuditLog(currentUser.id, currentUser.name, `Alarm onaylandı (${alarm.deviceName})`, 'low');
    this.db.saveData(this.db.data);
    this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    return true;
  }

  public silenceAlarm(alarmId: string, durationMinutes: number, currentUser: any): boolean {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return false;

    if (currentUser.role !== 'admin' && alarm.tenantId !== currentUser.id) {
      throw new Error('Bu alarma erişim yetkiniz yok.');
    }

    const silenceEnd = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    alarm.silencedUntil = silenceEnd;
    alarm.state = 'SILENCED';
    alarm.updatedAt = new Date().toISOString();
    alarm.version = (alarm.version || 1) + 1;
    this.db.telemetryRepository.upsertActiveAlarm(alarm);

    this.db.telemetryRepository.emitAlarmNotification(
      alarm,
      'SILENCED',
      `🔇 [ALARM SUSTURULDU] ${alarm.deviceName} - ${alarm.metricKey.toUpperCase()}`,
      `Alarm ${currentUser.name || currentUser.id} tarafından ${durationMinutes} dakika süreyle susturuldu.`,
      currentUser.id
    );

    this.db.addAuditLog(currentUser.id, currentUser.name, `Alarm ${durationMinutes} dakika boyunca susturuldu (${alarm.deviceName})`, 'medium');
    this.db.saveData(this.db.data);
    this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    return true;
  }

  public resolveAlarm(alarmId: string, currentUser: any): boolean {
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const alarm = this.db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmId);
    if (!alarm) return false;

    if (currentUser.role !== 'admin' && alarm.tenantId !== currentUser.id) {
      throw new Error('Bu alarma erişim yetkiniz yok.');
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
      `Alarm ${currentUser.name || currentUser.id} tarafından manuel olarak kapatıldı.`,
      currentUser.id
    );
    this.db.addAuditLog(currentUser.id, currentUser.name, `Alarm kapatıldı (${alarm.deviceName})`, 'medium');
    this.db.saveData(this.db.data);
    this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    return true;
  }

  // Threshold Rules
  public getRules(requestingUserId = 'usr_admin', targetCustomerId?: string, options?: RuleQueryOptions): any {
    if (!this.db.data.rules) this.db.data.rules = [];
    let list: ThresholdRule[] = this.db.data.rules;
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    
    if (reqUser && reqUser.role === 'customer') {
      // Customer sees ONLY their own created rules (never other customers, never admin rules)
      list = list.filter((r: ThresholdRule) => r.tenantId === requestingUserId);
    } else if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      list = list.filter((r: ThresholdRule) => r.tenantId === targetCustomerId);
    }

    if (!options) {
      return list;
    }

    if (options.severity && options.severity !== 'all') {
      list = list.filter((r) => r.severity === options.severity);
    }

    if (options.enabled !== undefined && options.enabled !== 'all') {
      const isEn = options.enabled === true || options.enabled === 'true';
      list = list.filter((r) => r.enabled === isEn);
    }

    if (options.deviceId && options.deviceId !== 'all') {
      list = list.filter((r) => r.deviceId === options.deviceId || r.deviceId === 'all');
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.metricKey.toLowerCase().includes(q) ||
          r.messageTemplate?.toLowerCase().includes(q) ||
          r.userName?.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));

    let startIndex = 0;
    if (options.cursor) {
      const foundIdx = list.findIndex((r) => r.id === options.cursor);
      if (foundIdx >= 0) {
        startIndex = foundIdx + 1;
      }
    }

    const paged = list.slice(startIndex, startIndex + limit);
    const nextCursor = paged.length === limit && startIndex + limit < total ? paged[paged.length - 1].id : null;
    const hasMore = nextCursor !== null;

    return {
      data: paged,
      total,
      limit,
      nextCursor,
      hasMore,
    };
  }

  public async createRule(ruleData: Omit<ThresholdRule, 'id'>, requestingUser?: { id: string; name: string; role: string }): Promise<ThresholdRule> {
    if (!this.db.data.rules) this.db.data.rules = [];
    let ownerId = ruleData.tenantId || 'usr_admin';
    let ownerName = ruleData.userName || 'Sistem Yöneticisi';

    if (requestingUser) {
      if (requestingUser.role === 'customer') {
        // Force ownership to customer
        ownerId = requestingUser.id;
        ownerName = requestingUser.name;
        // Verify customer owns the target device if deviceId is specific
        if (ruleData.deviceId && ruleData.deviceId !== 'all') {
          const userDevices = (this.db.data.devices || []).filter((d: any) => d.tenantId === requestingUser.id);
          const ownsDev = userDevices.some((d: any) => d.id === ruleData.deviceId);
          if (!ownsDev) {
            ruleData.deviceId = 'all';
          }
        }
      } else if (requestingUser.role === 'admin' && ruleData.tenantId) {
        const foundUser = (this.db.data.users || []).find((u: any) => u.id === ruleData.tenantId);
        if (foundUser) ownerName = foundUser.name;
      }
    }

    const newRule: ThresholdRule = {
      ...ruleData,
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      tenantId: ownerId,
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
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveRule(newRule).catch((e) => console.warn('[PG Error]', e.message)); }
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    return newRule;
  }

  public async updateRule(
    id: string,
    updates: Partial<ThresholdRule>,
    requestingUser?: { id: string; role: string },
    incomingVersion?: number
  ): Promise<UpdateRuleResult> {
    if (!this.db.data.rules) this.db.data.rules = [];
    const r = this.db.data.rules.find((item: ThresholdRule) => item.id === id);
    if (!r) return { success: false, notFound: true };

    if (requestingUser && requestingUser.role !== 'admin' && r.tenantId !== requestingUser.id) {
      return { success: false, forbidden: true }; // Forbidden: Müşteri başkasının kuralını değiştiremez
    }

    // Optimistic Concurrency Control
    if (incomingVersion !== undefined && r.version !== undefined && Number(incomingVersion) !== Number(r.version)) {
      return {
        success: false,
        conflict: true,
        currentVersion: r.version,
        rule: r,
      };
    }

    // If customer, do not allow changing ownership
    if (requestingUser && requestingUser.role === 'customer') {
      delete (updates as any).tenantId;
      delete (updates as any).userName;
    }

    Object.assign(r, updates);
    r.updatedAt = new Date().toISOString();
    r.version = (r.version || 1) + 1;
    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveRule(r).catch((e) => console.warn('[PG Error]', e.message)); }
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    return { success: true, rule: r };
  }

  public async deleteRule(id: string, requestingUser?: { id: string; role: string }): Promise<boolean> {
    if (!this.db.data.rules) this.db.data.rules = [];
    const idx = this.db.data.rules.findIndex((r: ThresholdRule) => r.id === id);
    if (idx < 0) return false;

    const r = this.db.data.rules[idx];
    if (requestingUser && requestingUser.role !== 'admin' && r.tenantId !== requestingUser.id) {
      return false; // Forbidden: Müşteri başkasının kuralını silemez
    }

    this.db.data.rules.splice(idx, 1);
    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.deleteRule(id).catch((e) => console.warn('[PG Error]', e.message)); }
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    return true;
  }

  public async toggleRule(id: string, enabled: boolean, requestingUser?: { id: string; role: string }): Promise<boolean> {
    if (!this.db.data.rules) this.db.data.rules = [];
    const r = this.db.data.rules.find((item: ThresholdRule) => item.id === id);
    if (!r) return false;

    if (requestingUser && requestingUser.role !== 'admin' && r.tenantId !== requestingUser.id) {
      return false; // Forbidden: Müşteri başkasının kuralını değiştiremez
    }

    r.enabled = enabled;
    r.updatedAt = new Date().toISOString();
    r.version = (r.version || 1) + 1;
    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveRule(r).catch((e) => console.warn('[PG Error]', e.message)); }
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    return true;
  }
}
