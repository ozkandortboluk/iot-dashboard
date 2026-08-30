const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

const insertCode = `
  public async getCommands(deviceId: string, limit: number = 100): Promise<DeviceCommand[]> {
    if (!this.pool) return [];
    const res = await this.query(
      \`SELECT * FROM device_commands WHERE device_id = $1 ORDER BY created_at DESC LIMIT $2\`,
      [deviceId, limit]
    );
    return res.rows.map(r => ({
      id: r.id,
      deviceId: r.device_id,
      command: r.command_name,
      payload: r.parameters?.payload ?? '',
      status: r.status,
      created_at: r.created_at,
      executed_at: r.executed_at,
      source: r.sent_by
    }));
  }

  public async getPendingCommands(deviceId: string): Promise<DeviceCommand[]> {
    if (!this.pool) return [];
    const res = await this.query(
      \`SELECT * FROM device_commands WHERE device_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 20\`,
      [deviceId]
    );
    return res.rows.map(r => ({
      id: r.id,
      deviceId: r.device_id,
      command: r.command_name,
      payload: r.parameters?.payload ?? '',
      status: r.status,
      created_at: r.created_at,
      executed_at: r.executed_at,
      source: r.sent_by
    }));
  }
`;

code = code.replace(/public async markCommandsDelivered/, insertCode + '\n  public async markCommandsDelivered');

fs.writeFileSync('src/server/database/postgres.ts', code);
