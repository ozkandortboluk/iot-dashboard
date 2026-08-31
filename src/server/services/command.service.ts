import { db } from '../db.js';
import { broadcast } from './websocket.js';
import type { DeviceCommand } from '../../types.js';

export class CommandService {
  /**
   * Retrieves pending commands for a device and atomically marks them as 'claimed'.
   * Ensures the PostgreSQL and RAM state transitions are completed and persisted
   * BEFORE returning the commands in the downlink response to avoid duplicate execution.
   */
  public async getAndDeliverPendingCommands(deviceId: string): Promise<Array<{
    id: string;
    command: string;
    payload: string | number;
    status: string;
    created_at: string;
    claimed_at?: string;
  }>> {
    if (!deviceId) return [];

    try {
      const claimedCommands: DeviceCommand[] = await db.claimPendingCommands(deviceId);
      
      if (claimedCommands.length > 0) {
        // Broadcast updated command state to UI panels
        const allDeviceCommands = await db.getCommands(deviceId);
        broadcast('commands:updated', allDeviceCommands);
      }

      return claimedCommands.map((c) => ({
        id: c.id,
        command: c.command,
        payload: c.payload,
        status: c.status || 'claimed',
        created_at: c.created_at,
        claimed_at: c.claimed_at || c.delivered_at,
      }));
    } catch (err: any) {
      console.error(`[CommandService] getAndDeliverPendingCommands error for device ${deviceId}:`, err.message || err);
      return [];
    }
  }

  /**
   * Handles command execution ACK from field devices (ESP32/ESP8266/Python).
   * Transitions command state from 'claimed'/'pending' -> 'acknowledged' (or 'failed').
   */
  public async handleCommandAck(
    deviceId: string,
    ackData: string | string[] | { id: string; status?: 'acknowledged' | 'failed' | 'executed'; result?: any } | any[],
    defaultStatus: 'acknowledged' | 'failed' | 'executed' = 'acknowledged',
    defaultResult?: any
  ): Promise<number> {
    if (!deviceId || !ackData) return 0;

    let updatedCount = 0;

    try {
      if (Array.isArray(ackData)) {
        for (const item of ackData) {
          if (typeof item === 'string') {
            const count = await db.acknowledgeCommands(deviceId, item, defaultStatus, defaultResult);
            updatedCount += count;
          } else if (typeof item === 'object' && item?.id) {
            const status = item.status || defaultStatus;
            const res = item.result !== undefined ? item.result : defaultResult;
            const count = await db.acknowledgeCommands(deviceId, item.id, status, res);
            updatedCount += count;
          }
        }
      } else if (typeof ackData === 'string') {
        const ids = ackData.split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length > 0) {
          updatedCount = await db.acknowledgeCommands(deviceId, ids, defaultStatus, defaultResult);
        }
      } else if (typeof ackData === 'object' && ackData.id) {
        const status = ackData.status || defaultStatus;
        const res = ackData.result !== undefined ? ackData.result : defaultResult;
        updatedCount = await db.acknowledgeCommands(deviceId, ackData.id, status, res);
      }

      if (updatedCount > 0) {
        const allDeviceCommands = await db.getCommands(deviceId);
        broadcast('commands:updated', allDeviceCommands);
      }
    } catch (err: any) {
      console.error(`[CommandService] handleCommandAck error for device ${deviceId}:`, err.message || err);
    }

    return updatedCount;
  }
}

export const commandService = new CommandService();
