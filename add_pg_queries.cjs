const fs = require('fs');
let code = fs.readFileSync('src/server/database/postgres.ts', 'utf8');

const queries = `
  public async getAlarms(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = \`SELECT * FROM active_alarms\`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += \` WHERE tenant_id = $1\`;
      params.push(tenantId);
    }
    sql += \` ORDER BY updated_at DESC LIMIT 200\`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      lastEvaluatedAt: r.last_evaluated_at,
      ruleId: r.rule_id,
      deviceId: r.device_id,
      deviceName: r.device_name,
      tenantId: r.tenant_id,
      metricKey: r.metric_key,
      operator: r.operator,
      thresholdValue: r.threshold_value,
      currentValue: r.current_value,
      severity: r.severity,
      state: r.state,
      firstBreachAt: r.first_breach_at,
      triggeredAt: r.triggered_at,
      lastNotifiedAt: r.last_notified_at,
      resolvedAt: r.resolved_at,
      acknowledged: r.acknowledged,
      acknowledgedAt: r.acknowledged_at,
      acknowledgedBy: r.acknowledged_by,
      silencedUntil: r.silenced_until,
      repeatCount: r.repeat_count,
      message: r.message,
      updatedAt: r.updated_at,
      userId: r.user_id,
      source: r.source,
      environment: r.environment,
      isSimulation: r.is_simulation
    }));
  }

  public async getAlarmEvents(tenantId?: string, incidentId?: string, alarmId?: string, deviceId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = \`SELECT * FROM alarm_events WHERE 1=1\`;
    const params: any[] = [];
    let idx = 1;

    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += \` AND tenant_id = $\${idx++}\`;
      params.push(tenantId);
    }
    if (incidentId) {
      sql += \` AND incident_id = $\${idx++}\`;
      params.push(incidentId);
    }
    if (alarmId) {
      sql += \` AND alarm_id = $\${idx++}\`;
      params.push(alarmId);
    }
    if (deviceId) {
      sql += \` AND device_id = $\${idx++}\`;
      params.push(deviceId);
    }
    sql += \` ORDER BY created_at DESC LIMIT 200\`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      alarmId: r.alarm_id,
      deviceId: r.device_id,
      deviceName: r.device_name,
      tenantId: r.tenant_id,
      eventType: r.event_type,
      alarmState: r.alarm_state,
      metricKey: r.metric_key,
      value: r.value,
      message: r.message,
      createdAt: r.created_at,
      metadata: r.metadata,
      source: r.source,
      isSimulation: r.is_simulation,
      environment: r.environment
    }));
  }

  public async getNotifications(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = \`SELECT * FROM notifications\`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += \` WHERE tenant_id = $1\`;
      params.push(tenantId);
    }
    sql += \` ORDER BY created_at DESC LIMIT 100\`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      read: r.is_read,
      createdAt: r.created_at,
      alarmId: r.alarm_id,
      ruleId: r.rule_id,
      alarmState: r.alarm_state
    }));
  }

  public async getDispatchLogs(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = \`SELECT * FROM dispatch_logs\`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += \` WHERE tenant_id = $1\`;
      params.push(tenantId);
    }
    sql += \` ORDER BY sent_at DESC LIMIT 100\`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      ruleId: r.rule_id,
      alarmId: r.alarm_id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      userName: r.user_name,
      channel: r.channel,
      recipient: r.recipient,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at
    }));
  }
`;

code = code.replace(/public async queryWithTenant/, queries + '\n  public async queryWithTenant');
fs.writeFileSync('src/server/database/postgres.ts', code);
