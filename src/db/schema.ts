import { pgTable, varchar, text, doublePrecision, integer, boolean, timestamp, jsonb, index, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users Table
export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  email: varchar('email', { length: 128 }).notNull().unique(),
  phone: varchar('phone', { length: 32 }),
  notificationEmail: varchar('notification_email', { length: 128 }),
  whatsappNumber: varchar('whatsapp_number', { length: 32 }),
  telegramChatId: varchar('telegram_chat_id', { length: 64 }),
  passwordHash: varchar('password_hash', { length: 256 }).notNull(),
  role: varchar('role', { length: 32 }).default('operator').notNull(),
  companyName: varchar('company_name', { length: 128 }),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  notificationPreferences: jsonb('notification_preferences').default({
    app: true,
    email: true,
    whatsapp: true,
    telegram: true,
    sms: true,
    webhook: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 2. Devices Table
export const devices = pgTable('devices', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  deviceType: varchar('device_type', { length: 32 }).notNull(),
  apiKey: varchar('api_key', { length: 128 }).notNull().unique(),
  status: varchar('status', { length: 32 }).default('online'),
  location: varchar('location', { length: 256 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  macAddress: varchar('mac_address', { length: 32 }),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  rateLimitPerMin: integer('rate_limit_per_min').default(120),
  encryptionMethod: varchar('encryption_method', { length: 64 }).default('AES-256-GCM'),
  metrics: jsonb('metrics').default({}),
  dataFlowActive: boolean('data_flow_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3. Telemetry Readings Table (Designed for TimescaleDB Hypertable & Compression)
export const telemetryReadings = pgTable(
  'telemetry_readings',
  {
    id: varchar('id', { length: 128 }).notNull(),
    packetId: varchar('packet_id', { length: 128 }),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    deviceId: varchar('device_id', { length: 64 }).notNull(),
    deviceName: varchar('device_name', { length: 128 }).notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    metricValue: doublePrecision('metric_value').notNull(),
    unit: varchar('unit', { length: 16 }).notNull(),
    statusLevel: varchar('status_level', { length: 32 }).default('normal'),
    sequence: integer('sequence'),
    source: varchar('source', { length: 32 }).default('physical'),
    environment: varchar('environment', { length: 32 }).default('production'),
    simulationRunId: varchar('simulation_run_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    tenantDeviceTimeIdx: index('idx_telemetry_tenant_device_time').on(table.tenantId, table.deviceId, table.createdAt),
    tenantTimeIdx: index('idx_telemetry_tenant_time').on(table.tenantId, table.createdAt),
    deviceTimeIdx: index('idx_telemetry_device_time').on(table.deviceId, table.createdAt),
    metricTimeIdx: index('idx_telemetry_metric_time').on(table.metric, table.createdAt),
    createdTimeIdx: index('idx_telemetry_created_at').on(table.createdAt),
  })
);

// 4. Threshold Rules Table
export const thresholdRules = pgTable('threshold_rules', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).references(() => users.id, { onDelete: 'cascade' }),
  userName: varchar('user_name', { length: 128 }),
  deviceId: varchar('device_id', { length: 64 }).default('all'),
  metricKey: varchar('metric_key', { length: 64 }).notNull(),
  operator: varchar('operator', { length: 8 }).notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  severity: varchar('severity', { length: 32 }).default('warning'),
  enabled: boolean('enabled').default(true),
  messageTemplate: text('message_template').notNull(),
  hysteresis: doublePrecision('hysteresis').default(1.0),
  minBreachDurationSec: integer('min_breach_duration_sec').default(10),
  repeatIntervalSec: integer('repeat_interval_sec').default(300),
  notificationChannels: jsonb('notification_channels').default(['app', 'email']),
  activeHours: varchar('active_hours', { length: 64 }).default('00:00-23:59'),
  recipients: jsonb('recipients').default([]),
  silencedUntil: timestamp('silenced_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 5. Active Alarms Table
export const activeAlarms = pgTable('active_alarms', {
  id: varchar('id', { length: 128 }).primaryKey(),
  ruleId: varchar('rule_id', { length: 64 }).notNull(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  deviceName: varchar('device_name', { length: 128 }).notNull(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  metricKey: varchar('metric_key', { length: 64 }).notNull(),
  operator: varchar('operator', { length: 8 }).notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  currentValue: doublePrecision('current_value').notNull(),
  severity: varchar('severity', { length: 32 }).notNull(),
  state: varchar('state', { length: 32 }).notNull(),
  firstBreachAt: timestamp('first_breach_at', { withTimezone: true }),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: varchar('acknowledged_by', { length: 128 }),
  silencedUntil: timestamp('silenced_until', { withTimezone: true }),
  repeatCount: integer('repeat_count').default(0),
  message: text('message').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 6. Notifications Table
export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 256 }).notNull(),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 32 }).default('info'),
  deviceId: varchar('device_id', { length: 64 }),
  deviceName: varchar('device_name', { length: 128 }),
  isRead: boolean('is_read').default(false),
  alarmId: varchar('alarm_id', { length: 128 }),
  ruleId: varchar('rule_id', { length: 64 }),
  alarmState: varchar('alarm_state', { length: 32 }),
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: varchar('acknowledged_by', { length: 128 }),
  repeatCount: integer('repeat_count').default(0),
  currentValue: doublePrecision('current_value'),
  thresholdValue: doublePrecision('threshold_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 7. Dashboard Layouts Table
export const dashboardLayouts = pgTable('dashboard_layouts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 128 }).notNull(),
  widgetsJson: jsonb('widgets_json').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 8. Audit Logs Table
export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }),
  userId: varchar('user_id', { length: 64 }),
  userName: varchar('user_name', { length: 128 }),
  action: varchar('action', { length: 256 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }).default('system'),
  resourceId: varchar('resource_id', { length: 64 }),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  severity: varchar('severity', { length: 32 }).default('low'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 9. Dispatch Logs Table
export const dispatchLogs = pgTable('dispatch_logs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }),
  userName: varchar('user_name', { length: 128 }),
  channel: varchar('channel', { length: 32 }).notNull(),
  recipient: varchar('recipient', { length: 128 }).notNull(),
  title: varchar('title', { length: 256 }),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 32 }).default('info'),
  status: varchar('status', { length: 32 }).default('delivered'),
  latencyMs: integer('latency_ms').default(0),
  errorDetails: text('error_details'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
});

// 10. Firmwares Table
export const firmwares = pgTable('firmwares', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  deviceType: varchar('device_type', { length: 64 }).notNull(),
  roleKey: varchar('role_key', { length: 64 }).notNull(),
  hardwareModel: varchar('hardware_model', { length: 64 }).default('ALL'),
  version: varchar('version', { length: 32 }).notNull(),
  description: text('description'),
  binaryData: text('binary_data'),
  binarySize: integer('binary_size').default(0),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  signature: text('signature'),
  filePath: text('file_path'),
  minHardwareRevision: varchar('min_hardware_revision', { length: 32 }),
  isActive: boolean('is_active').default(true),
  uploadedBy: varchar('uploaded_by', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 11. OTA Deployment Jobs Table
export const otaDeploymentJobs = pgTable('ota_deployment_jobs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  firmwareId: varchar('firmware_id', { length: 64 }),
  firmwareVersion: varchar('firmware_version', { length: 32 }).notNull(),
  firmwareName: varchar('firmware_name', { length: 128 }).notNull(),
  deviceId: varchar('device_id', { length: 64 }),
  deviceName: varchar('device_name', { length: 128 }).notNull(),
  deviceType: varchar('device_type', { length: 64 }).notNull(),
  roleKey: varchar('role_key', { length: 64 }).notNull(),
  targetScope: varchar('target_scope', { length: 32 }).default('single'),
  status: varchar('status', { length: 32 }).default('PENDING'),
  progressPercent: integer('progress_percent').default(0),
  errorMessage: text('error_message'),
  initiatedBy: varchar('initiated_by', { length: 128 }).notNull(),
  downloadToken: varchar('download_token', { length: 128 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').default(0),
  maxAttempts: integer('max_attempts').default(3),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  downloadStartedAt: timestamp('download_started_at', { withTimezone: true }),
  bootConfirmedAt: timestamp('boot_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// 12. Device Commands Queue Table
export const deviceCommands = pgTable('device_commands', {
  id: varchar('id', { length: 64 }).primaryKey(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  targetPin: varchar('target_pin', { length: 32 }).notNull(),
  value: doublePrecision('value').notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).default('PENDING').notNull(),
  priority: integer('priority').default(1),
  ttlSeconds: integer('ttl_seconds').default(60),
  requiresAck: boolean('requires_ack').default(true),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdBy: varchar('created_by', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  thresholdRules: many(thresholdRules),
  notifications: many(notifications),
  dashboardLayouts: many(dashboardLayouts),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  owner: one(users, {
    fields: [devices.tenantId],
    references: [users.id],
  }),
  telemetry: many(telemetryReadings),
}));
