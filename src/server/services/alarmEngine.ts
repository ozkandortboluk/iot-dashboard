import { db } from '../db.js';
import { broadcast, broadcastToTenant } from './websocket.js';
import type { ActiveAlarm, ThresholdRule, TelemetryReading, User } from '../../types.js';

export class AlarmEngine {
  public getAlarms(requestingUserId?: string, targetCustomerId?: string): ActiveAlarm[] {
    return db.getAlarms(requestingUserId, targetCustomerId);
  }

  public getRules(requestingUserId?: string, targetCustomerId?: string): ThresholdRule[] {
    return db.getRules(requestingUserId, targetCustomerId);
  }

  public acknowledge(alarmId: string, user: User): boolean {
    const alarmsBefore = db.getAlarms('usr_admin');
    const alarm = alarmsBefore.find(a => a.id === alarmId);
    const success = db.acknowledgeAlarm(alarmId, user);
    if (success && alarm) {
      const tenantAlarms = db.getAlarms(alarm.tenantId, alarm.tenantId);
      const tenantNotifications = db.getNotifications(alarm.tenantId, alarm.tenantId);
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, db.getAlarms());
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, db.getNotifications());
    }
    return success;
  }

  public silence(alarmId: string, durationMinutes: number, user: User): boolean {
    const alarmsBefore = db.getAlarms('usr_admin');
    const alarm = alarmsBefore.find(a => a.id === alarmId);
    const success = db.silenceAlarm(alarmId, durationMinutes, user);
    if (success && alarm) {
      const tenantAlarms = db.getAlarms(alarm.tenantId, alarm.tenantId);
      const tenantNotifications = db.getNotifications(alarm.tenantId, alarm.tenantId);
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, db.getAlarms());
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, db.getNotifications());
    }
    return success;
  }

  public resolve(alarmId: string, user: User): boolean {
    const alarmsBefore = db.getAlarms('usr_admin');
    const alarm = alarmsBefore.find(a => a.id === alarmId);
    const success = db.resolveAlarm(alarmId, user);
    if (success && alarm) {
      const tenantAlarms = db.getAlarms(alarm.tenantId, alarm.tenantId);
      const tenantNotifications = db.getNotifications(alarm.tenantId, alarm.tenantId);
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, db.getAlarms());
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, db.getNotifications());
    }
    return success;
  }
}

export const alarmEngine = new AlarmEngine();
