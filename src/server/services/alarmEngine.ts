import { db } from '../db.js';
import { broadcast, broadcastToTenant } from './websocket.js';
import type { ActiveAlarm, ThresholdRule, TelemetryReading, User } from '../../types.js';

export class AlarmEngine {
  private enabled: boolean = true;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public async getAlarms(requestingUserId?: string, targetCustomerId?: string): Promise<ActiveAlarm[]> {
    return await db.getAlarms(requestingUserId, targetCustomerId);
  }

  public getRules(requestingUserId?: string, targetCustomerId?: string): ThresholdRule[] {
    return db.getRules(requestingUserId, targetCustomerId);
  }

  public async acknowledge(alarmId: string, user: User): Promise<boolean> {
    const alarmsBefore = await db.getAlarms('usr_admin');
    const alarmsArray = Array.isArray(alarmsBefore) ? alarmsBefore : (alarmsBefore.data || []);
    const alarm = alarmsArray.find(a => a.id === alarmId);
    
    const success = db.acknowledgeAlarm(alarmId, user);
    if (success && alarm) {
      const tenantAlarms = await db.getAlarms(alarm.tenantId, alarm.tenantId);
      const allAlarms = await db.getAlarms('usr_admin');
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, allAlarms);
      
      const tenantNotifications = await db.getNotifications(alarm.tenantId, alarm.tenantId);
      const allNotifs = await db.getNotifications('usr_admin');
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, allNotifs);
    }
    return success;
  }

  public async silence(alarmId: string, durationMinutes: number, user: User): Promise<boolean> {
    const alarmsBefore = await db.getAlarms('usr_admin');
    const alarmsArray = Array.isArray(alarmsBefore) ? alarmsBefore : (alarmsBefore.data || []);
    const alarm = alarmsArray.find(a => a.id === alarmId);
    
    const success = db.silenceAlarm(alarmId, durationMinutes, user);
    if (success && alarm) {
      const tenantAlarms = await db.getAlarms(alarm.tenantId, alarm.tenantId);
      const allAlarms = await db.getAlarms('usr_admin');
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, allAlarms);
      
      const tenantNotifications = await db.getNotifications(alarm.tenantId, alarm.tenantId);
      const allNotifs = await db.getNotifications('usr_admin');
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, allNotifs);
    }
    return success;
  }

  public async resolve(alarmId: string, user: User): Promise<boolean> {
    const alarmsBefore = await db.getAlarms('usr_admin');
    const alarmsArray = Array.isArray(alarmsBefore) ? alarmsBefore : (alarmsBefore.data || []);
    const alarm = alarmsArray.find(a => a.id === alarmId);
    
    const success = db.resolveAlarm(alarmId, user);
    if (success && alarm) {
      const tenantAlarms = await db.getAlarms(alarm.tenantId, alarm.tenantId);
      const allAlarms = await db.getAlarms('usr_admin');
      broadcastToTenant(alarm.tenantId, 'alarms:updated', tenantAlarms, allAlarms);
      
      const tenantNotifications = await db.getNotifications(alarm.tenantId, alarm.tenantId);
      const allNotifs = await db.getNotifications('usr_admin');
      broadcastToTenant(alarm.tenantId, 'notifications:updated', tenantNotifications, allNotifs);
    }
    return success;
  }
}

export const alarmEngine = new AlarmEngine();
