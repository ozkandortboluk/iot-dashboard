import { db } from '../db.js';
import { broadcast } from './websocket.js';
import type { DeviceCommand } from '../../types.js';

function normalizeAckStatus(status?: string): 'acknowledged' | 'applied' | 'failed' | 'executed' {
  if (!status) return 'acknowledged';
  const s = String(status).toLowerCase().trim();
  if (s === 'applied') return 'applied';
  if (s === 'executed' || s === 'completed' || s === 'done' || s === 'success') return 'executed';
  if (s === 'failed' || s === 'error' || s === 'rejected') return 'failed';
  if (s === 'received' || s === 'acknowledged' || s === 'claimed' || s === 'ack') return 'acknowledged';
  return 'acknowledged';
}

export class CommandService {
  /**
   * Creates a new device command atomically in DB and broadcasts real-time events.
   */
  public async createCommand(
    options: { deviceId: string; commandPayload?: string; command?: string; payload?: any; source?: string; tenantId?: string },
    actor?: { id: string; name: string; role: string }
  ): Promise<DeviceCommand> {
    const cmd = await db.addCommand({
      deviceId: options.deviceId,
      command: options.command || 'CUSTOM',
      commandType: options.command || 'CUSTOM',
      payload: options.commandPayload !== undefined ? options.commandPayload : options.payload,
      value: options.commandPayload !== undefined ? options.commandPayload : options.payload,
      source: options.source || (actor?.name ? `user:${actor.name}` : 'automation'),
      userId: actor?.id,
      tenantId: options.tenantId,
    });
    broadcast('command:created', cmd);
    const allDeviceCommands = await db.getCommands(options.deviceId);
    broadcast('commands:updated', allDeviceCommands);
    return cmd;
  }

  /**
   * Retrieves pending commands for a device and atomically marks them as 'claimed'.
   * Ensures the PostgreSQL and RAM state transitions are completed and persisted
   * BEFORE returning the commands in the downlink response to avoid duplicate execution.
   */
  public async getAndDeliverPendingCommands(deviceId: string): Promise<Array<{
    id: string;
    commandId?: string;
    tenantId?: string;
    customerId?: string;
    deviceId: string;
    userId?: string;
    commandType: string;
    command: string;
    outputId?: string;
    value: any;
    payload: any;
    source: string;
    status: string;
    createdAt: string;
    created_at: string;
    sentAt?: string;
    sent_at?: string;
    claimed_at?: string;
    parameters?: any;
    params?: any;
  }>> {
    if (!deviceId) return [];

    try {
      // 1. Expire any stale commands before claiming to ensure offline devices don't execute outdated commands
      await this.checkExpiredCommands(300).catch(() => {});

      const claimedCommands: DeviceCommand[] = await db.claimPendingCommands(deviceId);
      
      if (claimedCommands.length > 0) {
        // Emit real-time command:sent event for each delivered command
        for (const cmd of claimedCommands) {
          broadcast('command:sent', cmd);
        }
        // Broadcast updated command state to UI panels
        const allDeviceCommands = await db.getCommands(deviceId);
        broadcast('commands:updated', allDeviceCommands);
      }

      return claimedCommands.map((c) => ({
        id: c.id,
        commandId: c.commandId || c.id,
        tenantId: c.tenantId,
        customerId: c.customerId,
        deviceId: c.deviceId,
        userId: c.userId,
        commandType: c.commandType || c.command,
        command: c.command || c.commandType,
        outputId: c.outputId,
        value: c.value !== undefined ? c.value : c.payload,
        payload: c.payload,
        source: c.source,
        status: c.status || 'sent',
        createdAt: c.createdAt || c.created_at,
        created_at: c.created_at || c.createdAt,
        sentAt: c.sentAt || c.sent_at,
        sent_at: c.sent_at || c.sentAt || c.claimed_at,
        claimed_at: c.claimed_at || c.delivered_at || c.sent_at,
        parameters: c.parameters,
        params: c.parameters,
      }));
    } catch (err: any) {
      console.error(`[CommandService] getAndDeliverPendingCommands error for device ${deviceId}:`, err.message || err);
      return [];
    }
  }

  /**
   * Handles command execution ACK from field devices (ESP32/ESP8266/Python).
   * Transitions command state from 'claimed'/'pending' -> 'acknowledged' (or 'executed' / 'failed').
   */
  public async handleCommandAck(
    deviceId: string,
    ackData: string | string[] | { id: string; status?: string; result?: any; error?: string } | any[],
    defaultStatus: 'acknowledged' | 'failed' | 'executed' | 'applied' = 'acknowledged',
    defaultResult?: any
  ): Promise<number> {
    if (!deviceId || !ackData) return 0;

    let updatedCount = 0;
    const allUpdatedCommands: DeviceCommand[] = [];

    try {
      if (Array.isArray(ackData)) {
        for (const item of ackData) {
          if (typeof item === 'string') {
            const { count, commands } = await db.acknowledgeCommands(deviceId, item, normalizeAckStatus(defaultStatus), defaultResult);
            updatedCount += count;
            allUpdatedCommands.push(...commands);
          } else if (typeof item === 'object' && item?.id) {
            const status = normalizeAckStatus(item.status || defaultStatus);
            const res = item.result !== undefined ? item.result : (item.error ? { error: item.error } : defaultResult);
            const { count, commands } = await db.acknowledgeCommands(deviceId, item.id, status, res);
            updatedCount += count;
            allUpdatedCommands.push(...commands);
          }
        }
      } else if (typeof ackData === 'string') {
        const ids = ackData.split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length > 0) {
          const { count, commands } = await db.acknowledgeCommands(deviceId, ids, normalizeAckStatus(defaultStatus), defaultResult);
          updatedCount += count;
          allUpdatedCommands.push(...commands);
        }
      } else if (typeof ackData === 'object' && ackData.id) {
        const status = normalizeAckStatus(ackData.status || defaultStatus);
        const res = ackData.result !== undefined ? ackData.result : (ackData.error ? { error: ackData.error } : defaultResult);
        const { count, commands } = await db.acknowledgeCommands(deviceId, ackData.id, status, res);
        updatedCount += count;
        allUpdatedCommands.push(...commands);
      }

      // Emit real-time WebSocket events corresponding to each updated command status
      for (const cmd of allUpdatedCommands) {
        if (cmd.status === 'applied') {
          broadcast('command:applied', cmd);
          broadcast('command:executed', cmd);
        } else if (cmd.status === 'executed') {
          broadcast('command:executed', cmd);
        } else if (cmd.status === 'failed') {
          broadcast('command:failed', cmd);
        } else if (cmd.status === 'acknowledged') {
          broadcast('command:acknowledged', cmd);
        } else if (cmd.status === 'timeout' || cmd.status === 'expired') {
          broadcast('command:timeout', cmd);
          broadcast('command:expired', cmd);
        }
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

  /**
   * Scans and expires stale pending/sent commands exceeding timeout threshold.
   * Emits 'command:expired' real-time WebSocket event for each expired command.
   */
  public async checkExpiredCommands(timeoutSeconds = 600): Promise<DeviceCommand[]> {
    try {
      const expiredCommands = await db.expireStaleCommands(timeoutSeconds);
      for (const cmd of expiredCommands) {
        broadcast('command:expired', cmd);
      }
      if (expiredCommands.length > 0) {
        const deviceIds = Array.from(new Set(expiredCommands.map((c) => c.deviceId)));
        for (const devId of deviceIds) {
          const allDeviceCommands = await db.getCommands(devId);
          broadcast('commands:updated', allDeviceCommands);
        }
      }
      return expiredCommands;
    } catch (err: any) {
      console.error('[CommandService] checkExpiredCommands error:', err.message || err);
      return [];
    }
  }
}

export const commandService = new CommandService();

let expiryWorkerTimer: NodeJS.Timeout | null = null;

export function startCommandExpiryWorker(intervalMs = 30000) {
  if (expiryWorkerTimer) return;
  expiryWorkerTimer = setInterval(() => {
    commandService.checkExpiredCommands(600).catch((err) => {
      console.error('[CommandExpiryWorker] Error checking expired commands:', err);
    });
  }, intervalMs);
}

export function stopCommandExpiryWorker() {
  if (expiryWorkerTimer) {
    clearInterval(expiryWorkerTimer);
    expiryWorkerTimer = null;
  }
}
