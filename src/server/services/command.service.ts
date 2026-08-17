import { db } from '../db.js';
import { broadcast } from './websocket.js';

export class CommandService {
  public getAndDeliverPendingCommands(deviceId: string) {
    const pendingCommands = db.getPendingCommands(deviceId);
    if (pendingCommands.length > 0) {
      db.markCommandsDelivered(pendingCommands.map((c) => c.id));
      broadcast('commands:updated', db.getCommands(deviceId));
    }

    return pendingCommands.map((c) => ({
      id: c.id,
      command: c.command,
      payload: c.payload,
      created_at: c.created_at,
    }));
  }
}

export const commandService = new CommandService();
