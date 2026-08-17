import { db } from '../db.js';
import { broadcast } from './websocket.js';
import type { ActiveAlarm, ThresholdRule, TelemetryReading, User } from '../../types.js';

export class AlarmEngine {
  public getAlarms(requestingUserId?: string, targetCustomerId?: string): ActiveAlarm[] {
    return db.getAlarms(requestingUserId, targetCustomerId);
  }

  public getRules(requestingUserId?: string, targetCustomerId?: string): ThresholdRule[] {
    return db.getRules(requestingUserId, targetCustomerId);
  }

  public acknowledge(alarmId: string, user: User) {
    db.acknowledgeAlarm(alarmId, user.id, user.name);
    broadcast('alarms:updated', db.getAlarms());
    broadcast('notifications:updated', db.getNotifications());
  }

  public silence(alarmId: string, durationMinutes: number, user: User) {
    db.silenceAlarm(alarmId, durationMinutes, user.id, user.name);
    broadcast('alarms:updated', db.getAlarms());
    broadcast('notifications:updated', db.getNotifications());
  }

  public resolve(alarmId: string, user: User) {
    db.resolveAlarm(alarmId, user.id, user.name);
    broadcast('alarms:updated', db.getAlarms());
    broadcast('notifications:updated', db.getNotifications());
  }
}

export const alarmEngine = new AlarmEngine();
