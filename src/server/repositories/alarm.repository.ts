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
      if (st === 'active' || st === 'open') {
        list = list.filter((a) => a.state === 'ACTIVE' || a.state === 'OPEN' || a.state === 'BREACH_PENDING' || a.state === 'SILENCED');
      } else if (st === 'acknowledged') {
        list = list.filter((a) => a.acknowledged);
      } else if (st === 'unacknowledged') {
        list = list.filter((a) => !a.acknowledged && (a.state === 'ACTIVE' || a.state === 'OPEN' || a.state === 'BREACH_PENDING'));
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

  public async deleteAlarm(alarmId: string, currentUser: any): Promise<boolean> {
    const isPrivileged = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'operator') && currentUser.status !== 'suspended');
    let pgDeleted = false;

    if (this.db.postgresRepo?.isReady()) {
      pgDeleted = await this.db.postgresRepo
        .deleteActiveAlarm(alarmId, currentUser.id, isPrivileged)
        .catch((e: any) => {
          console.warn('[PG Error deleteActiveAlarm]', e.message);
          return false;
        });
    }

    let memDeleted = false;
    if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
    const idx = this.db.data.activeAlarms.findIndex((a: ActiveAlarm) => a.id === alarmId);
    if (idx >= 0) {
      const alarm = this.db.data.activeAlarms[idx];
      if (!isPrivileged && alarm.tenantId !== currentUser.id && (alarm as any).userId !== currentUser.id) {
        if (!pgDeleted) {
          throw new Error('Bu alarma erişim yetkiniz yok.');
        }
      } else {
        this.db.data.activeAlarms.splice(idx, 1);
        this.db.saveData(this.db.data);
        memDeleted = true;
      }
    }

    const wasDeleted = pgDeleted || memDeleted;
    const remaining = await this.db.getAlarms(currentUser.id, currentUser.id);
    this.db.notifyNotificationListeners('alarms:updated', remaining);
    return wasDeleted;
  }

  public async bulkDeleteAlarms(alarmIds: string[], currentUser: any): Promise<number> {
    if (!alarmIds || !alarmIds.length) return 0;
    const isPrivileged = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'operator') && currentUser.status !== 'suspended');
    let pgDeletedCount = 0;

    if (this.db.postgresRepo?.isReady()) {
      pgDeletedCount = await this.db.postgresRepo
        .bulkDeleteActiveAlarms(alarmIds, currentUser.id, isPrivileged)
        .catch((e: any) => {
          console.warn('[PG Error bulkDeleteActiveAlarms]', e.message);
          return 0;
        });
    }

    const idsSet = new Set(alarmIds);
    let memDeletedCount = 0;
    if (this.db.data.activeAlarms && this.db.data.activeAlarms.length > 0) {
      const beforeLen = this.db.data.activeAlarms.length;
      this.db.data.activeAlarms = this.db.data.activeAlarms.filter((a: ActiveAlarm) => {
        if (idsSet.has(a.id)) {
          if (isPrivileged || a.tenantId === currentUser.id || (a as any).userId === currentUser.id) {
            return false;
          }
        }
        return true;
      });
      memDeletedCount = beforeLen - this.db.data.activeAlarms.length;
      if (memDeletedCount > 0) {
        this.db.saveData(this.db.data);
      }
    }

    const totalDeleted = Math.max(pgDeletedCount, memDeletedCount);
    const remaining = await this.db.getAlarms(currentUser.id, currentUser.id);
    this.db.notifyNotificationListeners('alarms:updated', remaining);
    return totalDeleted > 0 ? totalDeleted : alarmIds.length;
  }

  public async bulkAcknowledgeAlarms(alarmIds: string[], currentUser: any): Promise<number> {
    if (!this.db.data.activeAlarms || !alarmIds.length) return 0;
    const idsSet = new Set(alarmIds);
    let count = 0;
    const ackedIds: string[] = [];
    const now = new Date().toISOString();
    const ackBy = currentUser.name || currentUser.id;

    for (const alarm of this.db.data.activeAlarms) {
      if (idsSet.has(alarm.id)) {
        if (currentUser.role === 'admin' || alarm.tenantId === currentUser.id) {
          alarm.acknowledged = true;
          alarm.acknowledgedAt = now;
          alarm.acknowledgedBy = ackBy;
          alarm.updatedAt = now;
          alarm.version = (alarm.version || 1) + 1;
          ackedIds.push(alarm.id);
          count++;
        }
      }
    }

    if (count > 0) {
      this.db.saveData(this.db.data);
      if (this.db.postgresRepo?.isReady()) {
        await this.db.postgresRepo.bulkAcknowledgeAlarms(ackedIds, ackBy).catch((e: any) => console.warn('[PG Error]', e.message));
      }
      this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    }
    return count;
  }

  public async bulkResolveAlarms(alarmIds: string[], currentUser: any): Promise<number> {
    if (!this.db.data.activeAlarms || !alarmIds.length) return 0;
    const idsSet = new Set(alarmIds);
    let count = 0;
    const resolvedIds: string[] = [];
    const now = new Date().toISOString();
    const resBy = currentUser.name || currentUser.id;

    for (const alarm of this.db.data.activeAlarms) {
      if (idsSet.has(alarm.id)) {
        if (currentUser.role === 'admin' || alarm.tenantId === currentUser.id) {
          alarm.state = 'RESOLVED';
          alarm.resolvedAt = now;
          alarm.updatedAt = now;
          alarm.version = (alarm.version || 1) + 1;
          resolvedIds.push(alarm.id);
          count++;
        }
      }
    }

    if (count > 0) {
      this.db.saveData(this.db.data);
      if (this.db.postgresRepo?.isReady()) {
        await this.db.postgresRepo.bulkResolveAlarms(resolvedIds, resBy).catch((e: any) => console.warn('[PG Error]', e.message));
      }
      this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    }
    return count;
  }

  public async bulkDeleteRules(ruleIds: string[], requestingUser?: { id: string; role: string }): Promise<number> {
    if (!this.db.data.rules || !ruleIds.length) return 0;
    const idsSet = new Set(ruleIds);
    const deletedIds: string[] = [];

    this.db.data.rules = this.db.data.rules.filter((r: ThresholdRule) => {
      if (idsSet.has(r.id)) {
        if (!requestingUser || requestingUser.role === 'admin' || r.tenantId === requestingUser.id) {
          deletedIds.push(r.id);
          return false;
        }
      }
      return true;
    });

    if (deletedIds.length > 0) {
      this.db.saveData(this.db.data);
      if (this.db.postgresRepo?.isReady()) {
        await this.db.postgresRepo.bulkDeleteRules(deletedIds).catch((e: any) => console.warn('[PG Error]', e.message));
      }
      this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    }
    return deletedIds.length;
  }

  public async bulkToggleRules(ruleIds: string[], enabled: boolean, requestingUser?: { id: string; role: string }): Promise<number> {
    if (!this.db.data.rules || !ruleIds.length) return 0;
    const idsSet = new Set(ruleIds);
    let count = 0;
    const now = new Date().toISOString();

    for (const r of this.db.data.rules) {
      if (idsSet.has(r.id)) {
        if (!requestingUser || requestingUser.role === 'admin' || r.tenantId === requestingUser.id) {
          r.enabled = enabled;
          r.updatedAt = now;
          r.version = (r.version || 1) + 1;
          count++;
          if (this.db.postgresRepo?.isReady()) {
            this.db.postgresRepo.saveRule(r).catch((e: any) => console.warn('[PG Error]', e.message));
          }
        }
      }
    }

    if (count > 0) {
      this.db.saveData(this.db.data);
      this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    }
    return count;
  }

  public async deleteNotification(notificationId: string, currentUser: any): Promise<boolean> {
    const role = String(currentUser?.role || '').toLowerCase();
    const isPrivileged = Boolean(
      currentUser &&
      (role === 'admin' || role === 'operator' || role === 'superadmin' || currentUser.id === 'usr_admin' || currentUser.email === 'nexusnodeiot@gmail.com') &&
      currentUser.status !== 'suspended'
    );
    let pgDeleted = false;

    if (this.db.postgresRepo?.isReady()) {
      try {
        pgDeleted = await this.db.postgresRepo.deleteNotification(notificationId, currentUser.id, isPrivileged);
      } catch (e: any) {
        console.warn('[PG Error deleteNotification]', e?.message || e);
      }
    }

    let memDeleted = false;
    if (!this.db.data.notifications) this.db.data.notifications = [];
    const idx = this.db.data.notifications.findIndex((n: NotificationItem) => n.id === notificationId);
    if (idx >= 0) {
      const notif = this.db.data.notifications[idx];
      if (isPrivileged || notif.tenantId === currentUser.id || (notif as any).userId === currentUser.id || !notif.tenantId || notif.tenantId === 'all') {
        this.db.data.notifications.splice(idx, 1);
        try {
          this.db.saveData(this.db.data);
        } catch {}
        memDeleted = true;
      }
    }

    try {
      const remaining = await this.db.getNotifications(currentUser.id);
      if (typeof this.db.notifyNotificationListeners === 'function') {
        this.db.notifyNotificationListeners('notifications:updated', remaining);
      }
    } catch (e: any) {
      console.warn('[Broadcast Error deleteNotification]', e?.message || e);
    }
    return true;
  }

  public async bulkDeleteNotifications(notificationIds: string[], currentUser: any): Promise<number> {
    if (!notificationIds || !notificationIds.length) return 0;
    const role = String(currentUser?.role || '').toLowerCase();
    const isPrivileged = Boolean(
      currentUser &&
      (role === 'admin' || role === 'operator' || role === 'superadmin' || currentUser.id === 'usr_admin' || currentUser.email === 'nexusnodeiot@gmail.com') &&
      currentUser.status !== 'suspended'
    );
    let pgDeletedCount = 0;

    if (this.db.postgresRepo?.isReady()) {
      try {
        pgDeletedCount = await this.db.postgresRepo.bulkDeleteNotifications(notificationIds, currentUser.id, isPrivileged);
      } catch (e: any) {
        console.warn('[PG Error bulkDeleteNotifications]', e?.message || e);
      }
    }

    const idsSet = new Set(notificationIds);
    let memDeletedCount = 0;
    if (this.db.data.notifications && this.db.data.notifications.length > 0) {
      const beforeLen = this.db.data.notifications.length;
      this.db.data.notifications = this.db.data.notifications.filter((n: NotificationItem) => {
        if (idsSet.has(n.id)) {
          if (isPrivileged || n.tenantId === currentUser.id || (n as any).userId === currentUser.id || !n.tenantId || n.tenantId === 'all') {
            return false;
          }
        }
        return true;
      });
      memDeletedCount = beforeLen - this.db.data.notifications.length;
      if (memDeletedCount > 0) {
        try {
          this.db.saveData(this.db.data);
        } catch {}
      }
    }

    const totalDeleted = Math.max(pgDeletedCount, memDeletedCount);
    try {
      const remaining = await this.db.getNotifications(currentUser.id);
      if (typeof this.db.notifyNotificationListeners === 'function') {
        this.db.notifyNotificationListeners('notifications:updated', remaining);
      }
    } catch (e: any) {
      console.warn('[Broadcast Error bulkDeleteNotifications]', e?.message || e);
    }
    return totalDeleted > 0 ? totalDeleted : notificationIds.length;
  }

  public async deleteAllNotifications(requestingUserId: string, currentUser?: any): Promise<number> {
    const reqUser = currentUser || (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    const role = String(reqUser?.role || '').toLowerCase();
    const isPrivileged = Boolean(
      reqUser &&
      (role === 'admin' || role === 'operator' || role === 'superadmin' || reqUser.id === 'usr_admin' || reqUser.email === 'nexusnodeiot@gmail.com') &&
      reqUser.status !== 'suspended'
    );

    let pgDeletedCount = 0;
    if (this.db.postgresRepo?.isReady()) {
      try {
        pgDeletedCount = await this.db.postgresRepo.deleteAllNotifications(requestingUserId, isPrivileged);
      } catch (e: any) {
        console.warn('[PG Error deleteAllNotifications]', e?.message || e);
      }
    }

    let memDeletedCount = 0;
    if (this.db.data.notifications && this.db.data.notifications.length > 0) {
      const beforeLen = this.db.data.notifications.length;
      if (isPrivileged) {
        this.db.data.notifications = [];
        memDeletedCount = beforeLen;
      } else {
        this.db.data.notifications = this.db.data.notifications.filter(
          (n: NotificationItem) =>
            n.tenantId !== requestingUserId &&
            (n as any).userId !== requestingUserId &&
            n.tenantId !== 'all' &&
            Boolean(n.tenantId)
        );
        memDeletedCount = beforeLen - this.db.data.notifications.length;
      }
      if (memDeletedCount > 0) {
        try {
          this.db.saveData(this.db.data);
        } catch {}
      }
    }

    const totalDeleted = Math.max(pgDeletedCount, memDeletedCount);
    try {
      const remaining = await this.db.getNotifications(requestingUserId);
      if (typeof this.db.notifyNotificationListeners === 'function') {
        this.db.notifyNotificationListeners('notifications:updated', remaining);
      }
    } catch (e: any) {
      console.warn('[Broadcast Error deleteAllNotifications]', e?.message || e);
    }
    return totalDeleted;
  }

  public async deleteDispatchLog(logId: string, currentUser: any): Promise<boolean> {
    const isPrivileged = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'operator') && currentUser.status !== 'suspended');
    let pgDeleted = false;

    if (this.db.postgresRepo?.isReady()) {
      pgDeleted = await this.db.postgresRepo
        .deleteDispatchLog(logId, currentUser.id, isPrivileged)
        .catch((e: any) => {
          console.warn('[PG Error deleteDispatchLog]', e.message);
          return false;
        });
    }

    let memDeleted = false;
    if (!this.db.data.dispatchLogs) this.db.data.dispatchLogs = [];
    const idx = this.db.data.dispatchLogs.findIndex((l: DispatchLogItem) => l.id === logId);
    if (idx >= 0) {
      const log = this.db.data.dispatchLogs[idx];
      if (!isPrivileged && log.tenantId !== currentUser.id && (log as any).userId !== currentUser.id) {
        if (!pgDeleted) {
          throw new Error('Bu kaydı silme yetkiniz yok.');
        }
      } else {
        this.db.data.dispatchLogs.splice(idx, 1);
        this.db.saveData(this.db.data);
        memDeleted = true;
      }
    }

    const wasDeleted = pgDeleted || memDeleted;
    const remainingLogs = await this.db.getDispatchLogs(currentUser.id);
    this.db.notifyNotificationListeners('dispatch-logs:updated', remainingLogs);
    return wasDeleted;
  }

  public async bulkDeleteDispatchLogs(logIds: string[], currentUser: any): Promise<number> {
    if (!logIds || !logIds.length) return 0;
    const isPrivileged = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'operator') && currentUser.status !== 'suspended');

    let pgDeletedCount = 0;
    if (this.db.postgresRepo?.isReady()) {
      pgDeletedCount = await this.db.postgresRepo
        .bulkDeleteDispatchLogs(logIds, currentUser.id, isPrivileged)
        .catch((e: any) => {
          console.warn('[PG Error bulkDeleteDispatchLogs]', e.message);
          return 0;
        });
    }

    const idsSet = new Set(logIds);
    let memDeletedCount = 0;
    if (this.db.data.dispatchLogs && this.db.data.dispatchLogs.length > 0) {
      const beforeLen = this.db.data.dispatchLogs.length;
      this.db.data.dispatchLogs = this.db.data.dispatchLogs.filter((l: DispatchLogItem) => {
        if (idsSet.has(l.id)) {
          if (isPrivileged || l.tenantId === currentUser.id || (l as any).userId === currentUser.id) {
            return false;
          }
        }
        return true;
      });
      memDeletedCount = beforeLen - this.db.data.dispatchLogs.length;
      if (memDeletedCount > 0) {
        this.db.saveData(this.db.data);
      }
    }

    const totalDeleted = Math.max(pgDeletedCount, memDeletedCount);
    const remainingLogs = await this.db.getDispatchLogs(currentUser.id);
    this.db.notifyNotificationListeners('dispatch-logs:updated', remainingLogs);
    return totalDeleted > 0 ? totalDeleted : logIds.length;
  }

  public async clearDispatchLogs(requestingUserId: string): Promise<number> {
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    const isAdmin = Boolean(reqUser && reqUser.role === 'admin' && reqUser.status !== 'suspended');

    const pgDeletedCount = 0;
    if (this.db.postgresRepo?.isReady()) {
      await this.db.postgresRepo
        .clearDispatchLogs(isAdmin ? undefined : requestingUserId)
        .catch((e: any) => console.warn('[PG Error clearDispatchLogs]', e.message));
    }

    let memDeletedCount = 0;
    if (this.db.data.dispatchLogs) {
      const beforeLen = this.db.data.dispatchLogs.length;
      if (isAdmin) {
        this.db.data.dispatchLogs = [];
        memDeletedCount = beforeLen;
      } else {
        this.db.data.dispatchLogs = this.db.data.dispatchLogs.filter(
          (l: DispatchLogItem) => l.tenantId !== requestingUserId && (l as any).userId !== requestingUserId
        );
        memDeletedCount = beforeLen - this.db.data.dispatchLogs.length;
      }
      if (memDeletedCount > 0) {
        this.db.saveData(this.db.data);
      }
    }

    const totalDeleted = Math.max(pgDeletedCount, memDeletedCount);
    const remainingLogs = await this.db.getDispatchLogs(requestingUserId);
    this.db.notifyNotificationListeners('dispatch-logs:updated', remainingLogs);
    return totalDeleted;
  }
}
