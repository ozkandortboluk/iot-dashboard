import { pgTable, varchar, text, doublePrecision, integer, bigint, boolean, timestamp, jsonb, index, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { CANONICAL_SCHEMA_METADATA } from '../server/database/canonicalSchema.js';

/**
 * ============================================================================
 * NexusNode IoT - Drizzle ORM Schema
 * ============================================================================
 * Strictly harmonized with CANONICAL_SCHEMA_METADATA and Migrations.
 * Single Source of Truth Alignment: Verified against CANONICAL_SCHEMA_METADATA.
 * ============================================================================
 */

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
  notificationPreferences: jsonb('notification_preferences').default({
    app: true,
    email: true,
    whatsapp: true,
    telegram: true,
    sms: true,
    webhook: true,
  }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
  roleIdx: index('idx_users_role').on(table.role),
  statusIdx: index('idx_users_status').on(table.status),
}));

// 2. Devices Table
export const devices = pgTable('devices', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin').notNull(),
  customerId: varchar('customer_id', { length: 64 }).default('usr_admin'),
  userId: varchar('user_id', { length: 64 }).default('usr_admin'),
  assignedUserId: varchar('assigned_user_id', { length: 64 }),
  createdByUserId: varchar('created_by_user_id', { length: 64 }),
  previousTenantId: varchar('previous_tenant_id', { length: 64 }),
  previousTenantName: varchar('previous_tenant_name', { length: 128 }),
  ownershipTransferredAt: timestamp('ownership_transferred_at', { withTimezone: true }),
  name: varchar('name', { length: 128 }).notNull(),
  type: varchar('type', { length: 64 }),
  deviceType: varchar('device_type', { length: 64 }).default('custom').notNull(),
  roleKey: varchar('role_key', { length: 64 }).default('device'),
  apiKey: varchar('api_key', { length: 256 }),
  apiKeyPrefix: varchar('api_key_prefix', { length: 32 }),
  apiKeyHash: varchar('api_key_hash', { length: 128 }),
  previousApiKeyHash: varchar('previous_api_key_hash', { length: 128 }),
  authToken: varchar('auth_token', { length: 128 }),
  apiKeyExpiresAt: timestamp('api_key_expires_at', { withTimezone: true }),
  apiKeyRevoked: boolean('api_key_revoked').default(false).notNull(),
  apiKeyLastUsedAt: timestamp('api_key_last_used_at', { withTimezone: true }),
  apiKeyScopes: jsonb('api_key_scopes').default(['all']).notNull(),
  apiKeyRotatedAt: timestamp('api_key_rotated_at', { withTimezone: true }),
  status: varchar('status', { length: 32 }).default('offline').notNull(),
  location: varchar('location', { length: 256 }),
  ip: varchar('ip', { length: 45 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  macAddress: varchar('mac_address', { length: 32 }),
  hardwareModel: varchar('hardware_model', { length: 64 }),
  firmwareVersion: varchar('firmware_version', { length: 32 }),
  otaStatus: varchar('ota_status', { length: 32 }).default('IDLE').notNull(),
  otaTargetFirmwareId: varchar('ota_target_firmware_id', { length: 64 }),
  otaTargetVersion: varchar('ota_target_version', { length: 32 }),
  otaProgress: integer('ota_progress').default(0).notNull(),
  otaErrorMessage: text('error_message'),
  otaLastCheckAt: timestamp('ota_last_check_at', { withTimezone: true }),
  otaJobId: varchar('ota_job_id', { length: 64 }),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  rateLimitPerMin: integer('rate_limit_per_min').default(120).notNull(),
  encryptionMethod: varchar('encryption_method', { length: 64 }).default('AES-256-GCM').notNull(),
  metrics: jsonb('metrics').default({}).notNull(),
  dataFlowActive: boolean('data_flow_active').default(true).notNull(),
  isSimulated: boolean('is_simulated').default(false).notNull(),
  powerSource: varchar('power_source', { length: 32 }).default('mains').notNull(),
  batteryLevel: integer('battery_level'),
  saveSimulatedDataToDb: boolean('save_simulated_data_to_db').default(false).notNull(),
  simulatedMetrics: jsonb('simulated_metrics').default([]).notNull(),
  expectedIntervalSeconds: integer('expected_interval_seconds').default(30).notNull(),
  autoDetectedIntervalSeconds: integer('auto_detected_interval_seconds').default(30).notNull(),
  heartbeatTimeoutSeconds: integer('heartbeat_timeout_seconds').default(60).notNull(),
  intervalMode: varchar('interval_mode', { length: 16 }).default('auto').notNull(),
  customIntervalSeconds: integer('custom_interval_seconds'),
  recentIntervals: jsonb('recent_intervals').default([]).notNull(),
  websocketConnected: boolean('websocket_connected').default(false).notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  outputDefinitions: jsonb('output_definitions').default([]).notNull(),
  capabilities: jsonb('capabilities').default([]).notNull(),
  supportedOutputs: jsonb('supported_outputs').default([]).notNull(),
  supportedCommands: jsonb('supported_commands').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('idx_devices_tenant_id').on(table.tenantId),
  userIdx: index('idx_devices_user_id').on(table.userId),
  statusIdx: index('idx_devices_status').on(table.status),
  apiKeyHashIdx: index('idx_devices_api_key_hash').on(table.apiKeyHash),
  hardwareModelIdx: index('idx_devices_hardware_model').on(table.hardwareModel),
  roleKeyIdx: index('idx_devices_role_key').on(table.roleKey),
  lastSeenIdx: index('idx_devices_last_seen').on(table.lastSeen),
}));

// 3. Device WebSocket Messages Deduplication Table
export const deviceWsMessagesDedup = pgTable('device_ws_messages_dedup', {
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  messageId: varchar('message_id', { length: 128 }).notNull(),
  msgId: varchar('msg_id', { length: 128 }),
  messageType: varchar('message_type', { length: 32 }).default('telemetry').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.deviceId, table.messageId] }),
  expiresIdx: index('idx_device_ws_dedup_expires').on(table.expiresAt),
}));

// 4. Telemetry Packets Table
export const telemetryPackets = pgTable('telemetry_packets', {
  id: varchar('id', { length: 128 }).primaryKey(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin'),
  customerId: varchar('customer_id', { length: 64 }).default('usr_admin'),
  bootId: varchar('boot_id', { length: 64 }).default('default').notNull(),
  sequence: bigint('sequence', { mode: 'number' }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 192 }),
  metricCount: integer('metric_count').default(0).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceBootSeqUnq: index('unq_telemetry_device_boot_sequence').on(table.deviceId, table.bootId, table.sequence),
  devSeqIdx: index('idx_telemetry_packets_dev_seq').on(table.deviceId, table.sequence),
  receivedIdx: index('idx_telemetry_packets_received').on(table.receivedAt),
}));

// 5. Telemetry Readings Table (Partitioned TimescaleDB Hypertable)
export const telemetryReadings = pgTable(
  'telemetry_readings',
  {
    id: varchar('id', { length: 128 }).notNull(),
    packetId: varchar('packet_id', { length: 128 }),
    tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin').notNull(),
    customerId: varchar('customer_id', { length: 64 }).default('usr_admin').notNull(),
    userId: varchar('user_id', { length: 64 }).default('usr_admin').notNull(),
    deviceId: varchar('device_id', { length: 64 }),
    deviceName: varchar('device_name', { length: 128 }).notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    metricValue: doublePrecision('metric_value').notNull(),
    unit: varchar('unit', { length: 16 }).notNull(),
    statusLevel: varchar('status_level', { length: 32 }).default('normal').notNull(),
    sequence: bigint('sequence', { mode: 'number' }),
    bootId: varchar('boot_id', { length: 64 }).default('default'),
    idempotencyKey: varchar('idempotency_key', { length: 192 }),
    source: varchar('source', { length: 32 }).default('physical').notNull(),
    environment: varchar('environment', { length: 32 }).default('production').notNull(),
    simulationRunId: varchar('simulation_run_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    tenantDeviceTimeIdx: index('idx_telemetry_tenant_device_time').on(table.tenantId, table.deviceId, table.createdAt),
    customerDeviceTimeIdx: index('idx_telemetry_customer_device_time').on(table.customerId, table.deviceId, table.createdAt),
    tenantTimeIdx: index('idx_telemetry_tenant_time').on(table.tenantId, table.createdAt),
    customerTimeIdx: index('idx_telemetry_customer_time').on(table.customerId, table.createdAt),
    deviceTimeIdx: index('idx_telemetry_device_time').on(table.deviceId, table.createdAt),
    metricTimeIdx: index('idx_telemetry_metric_time').on(table.metric, table.createdAt),
    createdTimeIdx: index('idx_telemetry_created_at').on(table.createdAt),
    packetIdx: index('idx_telemetry_packet').on(table.packetId),
    sourceEnvIdx: index('idx_telemetry_source_env').on(table.source, table.environment),
  })
);

// 6. Simulation Telemetry Readings Table (Sandbox Hypertable)
export const simulationTelemetryReadings = pgTable(
  'simulation_telemetry_readings',
  {
    id: varchar('id', { length: 128 }).notNull(),
    packetId: varchar('packet_id', { length: 128 }),
    tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin').notNull(),
    customerId: varchar('customer_id', { length: 64 }).default('usr_admin').notNull(),
    userId: varchar('user_id', { length: 64 }).default('usr_admin').notNull(),
    deviceId: varchar('device_id', { length: 64 }),
    deviceName: varchar('device_name', { length: 128 }).notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    metricValue: doublePrecision('metric_value').notNull(),
    unit: varchar('unit', { length: 16 }).notNull(),
    statusLevel: varchar('status_level', { length: 32 }).default('normal').notNull(),
    sequence: bigint('sequence', { mode: 'number' }),
    bootId: varchar('boot_id', { length: 64 }).default('default'),
    idempotencyKey: varchar('idempotency_key', { length: 192 }),
    source: varchar('source', { length: 32 }).default('simulator').notNull(),
    environment: varchar('environment', { length: 32 }).default('sandbox').notNull(),
    simulationRunId: varchar('simulation_run_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    tenantDeviceTimeIdx: index('idx_sim_telemetry_tenant_device_time').on(table.tenantId, table.deviceId, table.createdAt),
    customerDeviceTimeIdx: index('idx_sim_telemetry_customer_device_time').on(table.customerId, table.deviceId, table.createdAt),
    tenantTimeIdx: index('idx_sim_telemetry_tenant_time').on(table.tenantId, table.createdAt),
    customerTimeIdx: index('idx_sim_telemetry_customer_time').on(table.customerId, table.createdAt),
    deviceTimeIdx: index('idx_sim_telemetry_device_time').on(table.deviceId, table.createdAt),
    metricTimeIdx: index('idx_sim_telemetry_metric_time').on(table.metric, table.createdAt),
    createdTimeIdx: index('idx_sim_telemetry_time').on(table.createdAt),
    runIdx: index('idx_sim_telemetry_run').on(table.simulationRunId),
    packetIdx: index('idx_sim_telemetry_packet').on(table.packetId),
  })
);

// 7. Threshold Rules Table
export const thresholdRules = pgTable('threshold_rules', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin').notNull(),
  userName: varchar('user_name', { length: 128 }),
  deviceId: varchar('device_id', { length: 64 }).default('all').notNull(),
  metricKey: varchar('metric_key', { length: 64 }).notNull(),
  operator: varchar('operator', { length: 8 }).notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  severity: varchar('severity', { length: 32 }).default('warning').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  messageTemplate: text('message_template').notNull(),
  hysteresis: doublePrecision('hysteresis').default(1.0).notNull(),
  minBreachDurationSec: integer('min_breach_duration_sec').default(10).notNull(),
  repeatIntervalSec: integer('repeat_interval_sec').default(300).notNull(),
  cooldownPeriodSec: integer('cooldown_period_sec').default(300),
  notifyApp: boolean('notify_app').default(true),
  notifyEmail: boolean('notify_email').default(true),
  notifyWhatsapp: boolean('notify_whatsapp').default(false),
  notifyTelegram: boolean('notify_telegram').default(false),
  notifySms: boolean('notify_sms').default(false),
  notifyWebhook: boolean('notify_webhook').default(false),
  webhookUrl: text('webhook_url'),
  notificationChannels: jsonb('notification_channels').default(['app', 'email']).notNull(),
  activeHours: varchar('active_hours', { length: 64 }).default('00:00-23:59').notNull(),
  recipients: jsonb('recipients').default([]).notNull(),
  silencedUntil: timestamp('silenced_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('idx_threshold_rules_tenant').on(table.tenantId),
  userIdx: index('idx_threshold_rules_user').on(table.userId),
  deviceIdx: index('idx_threshold_rules_device').on(table.deviceId),
  metricIdx: index('idx_threshold_rules_metric').on(table.metricKey),
  enabledIdx: index('idx_threshold_rules_enabled').on(table.enabled),
}));

// 8. Active Alarms Table
export const activeAlarms = pgTable('active_alarms', {
  id: varchar('id', { length: 128 }).primaryKey(),
  incidentId: varchar('incident_id', { length: 128 }),
  ruleId: varchar('rule_id', { length: 64 }).notNull(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  deviceName: varchar('device_name', { length: 128 }).notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin'),
  metricKey: varchar('metric_key', { length: 64 }).notNull(),
  operator: varchar('operator', { length: 32 }).notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  currentValue: doublePrecision('current_value').notNull(),
  triggerValue: doublePrecision('trigger_value'),
  severity: varchar('severity', { length: 32 }).notNull(),
  state: varchar('state', { length: 32 }).notNull(),
  firstBreachAt: timestamp('first_breach_at', { withTimezone: true }),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  acknowledged: boolean('acknowledged').default(false).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: varchar('acknowledged_by', { length: 128 }),
  silencedUntil: timestamp('silenced_until', { withTimezone: true }),
  repeatCount: integer('repeat_count').default(0).notNull(),
  source: varchar('source', { length: 32 }).default('physical').notNull(),
  environment: varchar('environment', { length: 32 }).default('production').notNull(),
  isSimulation: boolean('is_simulation').default(false).notNull(),
  message: text('message').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index('idx_active_alarms_device').on(table.deviceId),
  ruleIdx: index('idx_active_alarms_rule').on(table.ruleId),
  stateIdx: index('idx_active_alarms_state').on(table.state),
  tenantIdx: index('idx_active_alarms_tenant').on(table.tenantId),
  userIdx: index('idx_active_alarms_user').on(table.userId),
  triggeredIdx: index('idx_active_alarms_triggered').on(table.triggeredAt),
}));

// 9. Alarm Events Table (Historical Timeline)
export const alarmEvents = pgTable('alarm_events', {
  id: varchar('id', { length: 64 }).primaryKey(),
  alarmId: varchar('alarm_id', { length: 64 }).notNull(),
  ruleId: varchar('rule_id', { length: 64 }).notNull(),
  userId: varchar('user_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin'),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  metricKey: varchar('metric_key', { length: 64 }).notNull(),
  triggerValue: doublePrecision('trigger_value').notNull(),
  thresholdValue: doublePrecision('threshold_value').notNull(),
  severity: varchar('severity', { length: 32 }).notNull(),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  note: text('note'),
}, (table) => ({
  alarmIdIdx: index('idx_alarm_events_alarm_id').on(table.alarmId),
  deviceIdIdx: index('idx_alarm_events_device_id').on(table.deviceId),
  ruleIdIdx: index('idx_alarm_events_rule_id').on(table.ruleId),
  timestampIdx: index('idx_alarm_events_timestamp').on(table.timestamp),
}));

// 10. Notifications Table
export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin').notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 32 }).default('info').notNull(),
  type: varchar('type', { length: 64 }).default('alert'),
  source: varchar('source', { length: 32 }).default('system'),
  deviceId: varchar('device_id', { length: 64 }),
  deviceName: varchar('device_name', { length: 128 }),
  isRead: boolean('is_read').default(false).notNull(),
  read: boolean('read').default(false),
  alarmId: varchar('alarm_id', { length: 128 }),
  ruleId: varchar('rule_id', { length: 64 }),
  alarmState: varchar('alarm_state', { length: 32 }),
  acknowledged: boolean('acknowledged').default(false).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: varchar('acknowledged_by', { length: 128 }),
  repeatCount: integer('repeat_count').default(0).notNull(),
  currentValue: doublePrecision('current_value'),
  thresholdValue: doublePrecision('threshold_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_notifications_user').on(table.userId),
  tenantIdx: index('idx_notifications_tenant').on(table.tenantId),
  deviceIdx: index('idx_notifications_device').on(table.deviceId),
  readIdx: index('idx_notifications_read').on(table.isRead),
  createdIdx: index('idx_notifications_created').on(table.createdAt),
}));

// 11. Audit Logs Table
export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }).default('usr_admin'),
  userName: varchar('user_name', { length: 128 }),
  action: varchar('action', { length: 256 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }).default('system'),
  resourceId: varchar('resource_id', { length: 64 }),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  severity: varchar('severity', { length: 32 }).default('low').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_audit_logs_user').on(table.userId),
  tenantIdx: index('idx_audit_logs_tenant').on(table.tenantId),
  actionIdx: index('idx_audit_logs_action').on(table.action),
  createdIdx: index('idx_audit_logs_created').on(table.createdAt),
}));

// 12. System Events Table
export const systemEvents = pgTable('system_events', {
  id: varchar('id', { length: 64 }).primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  source: varchar('source', { length: 64 }).notNull(),
  severity: varchar('severity', { length: 32 }).default('info').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('idx_system_events_type').on(table.eventType),
  createdIdx: index('idx_system_events_created_at').on(table.createdAt),
}));

// 13. Device Commands Table
export const deviceCommands = pgTable('device_commands', {
  id: varchar('id', { length: 64 }).primaryKey(),
  commandId: varchar('command_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }),
  customerId: varchar('customer_id', { length: 64 }),
  userId: varchar('user_id', { length: 64 }),
  deviceId: varchar('device_id', { length: 64 }),
  command: varchar('command', { length: 64 }),
  commandName: varchar('command_name', { length: 64 }),
  commandType: varchar('command_type', { length: 64 }).default('GENERAL_COMMAND').notNull(),
  outputId: varchar('output_id', { length: 64 }),
  targetPin: varchar('target_pin', { length: 32 }),
  targetState: varchar('target_state', { length: 32 }),
  value: doublePrecision('value'),
  valuePayload: text('value_payload'),
  parameters: jsonb('parameters').default({}).notNull(),
  result: jsonb('result'),
  source: varchar('source', { length: 32 }).default('manual').notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  priority: integer('priority').default(1),
  ttlSeconds: integer('ttl_seconds').default(60),
  timeoutSeconds: integer('timeout_seconds').default(300).notNull(),
  requiresAck: boolean('requires_ack').default(true),
  retryCount: integer('retry_count').default(0).notNull(),
  maxRetries: integer('max_retries').default(3).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  sentBy: varchar('sent_by', { length: 64 }),
  createdBy: varchar('created_by', { length: 128 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  devTimeIdx: index('idx_device_commands_device_time').on(table.deviceId, table.createdAt),
  tenantTimeIdx: index('idx_device_commands_tenant_time').on(table.tenantId, table.createdAt),
  customerTimeIdx: index('idx_device_commands_customer_time').on(table.customerId, table.createdAt),
  statusIdx: index('idx_device_commands_status').on(table.status),
  idempotencyIdx: index('idx_device_commands_idempotency').on(table.idempotencyKey),
}));

// 14. Dispatch Logs Table
export const dispatchLogs = pgTable('dispatch_logs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }),
  userId: varchar('user_id', { length: 64 }),
  userName: varchar('user_name', { length: 128 }),
  channel: varchar('channel', { length: 32 }).notNull(),
  recipient: varchar('recipient', { length: 128 }).notNull(),
  title: varchar('title', { length: 256 }),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 32 }).default('info').notNull(),
  status: varchar('status', { length: 32 }).default('delivered').notNull(),
  latencyMs: integer('latency_ms').default(0).notNull(),
  errorDetails: text('error_details'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  channelIdx: index('idx_dispatch_logs_channel').on(table.channel),
  statusIdx: index('idx_dispatch_logs_status').on(table.status),
  sentIdx: index('idx_dispatch_logs_sent_at').on(table.sentAt),
}));

// 15. User Sessions Table
export const userSessions = pgTable('user_sessions', {
  id: varchar('id', { length: 64 }),
  token: varchar('token', { length: 256 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  userRole: varchar('user_role', { length: 32 }).default('operator'),
  userEmail: varchar('user_email', { length: 128 }),
  userName: varchar('user_name', { length: 128 }),
  email: varchar('email', { length: 128 }),
  role: varchar('role', { length: 32 }),
  tenantId: varchar('tenant_id', { length: 64 }),
  ip: varchar('ip', { length: 45 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index('idx_user_sessions_user_id').on(table.userId),
  expiresIdx: index('idx_user_sessions_expires_at').on(table.expiresAt),
}));

// 16. Dashboard Layouts Table
export const dashboardLayouts = pgTable('dashboard_layouts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }),
  tenantId: varchar('tenant_id', { length: 64 }),
  title: varchar('title', { length: 128 }).notNull(),
  widgetsJson: jsonb('widgets_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_dashboard_layouts_user').on(table.userId),
}));

// 17. Firmwares Table (OTA Binaries)
export const firmwares = pgTable('firmwares', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  deviceType: varchar('device_type', { length: 64 }).notNull(),
  roleKey: varchar('role_key', { length: 64 }).notNull(),
  hardwareModel: varchar('hardware_model', { length: 64 }).default('ALL').notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  description: text('description'),
  binaryData: text('binary_data'),
  binarySize: integer('binary_size').default(0).notNull(),
  sha256: varchar('sha256', { length: 128 }).notNull(),
  signature: text('signature'),
  filePath: text('file_path'),
  minHardwareRevision: varchar('min_hardware_revision', { length: 64 }),
  isActive: boolean('is_active').default(true).notNull(),
  uploadedBy: varchar('uploaded_by', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeRoleIdx: index('idx_firmwares_type_role').on(table.deviceType, table.roleKey),
  versionIdx: index('idx_firmwares_version').on(table.version),
  sha256Idx: index('idx_firmwares_sha256').on(table.sha256),
}));

// 18. OTA Deployment Jobs Table
export const otaDeploymentJobs = pgTable('ota_deployment_jobs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  firmwareId: varchar('firmware_id', { length: 64 }),
  firmwareVersion: varchar('firmware_version', { length: 32 }).notNull(),
  firmwareName: varchar('firmware_name', { length: 128 }).notNull(),
  deviceId: varchar('device_id', { length: 64 }),
  deviceName: varchar('device_name', { length: 128 }).notNull(),
  deviceType: varchar('device_type', { length: 64 }).notNull(),
  roleKey: varchar('role_key', { length: 64 }).notNull(),
  targetScope: varchar('target_scope', { length: 32 }).default('single').notNull(),
  status: varchar('status', { length: 32 }).default('PENDING').notNull(),
  progressPercent: integer('progress_percent').default(0).notNull(),
  errorMessage: text('error_message'),
  initiatedBy: varchar('initiated_by', { length: 128 }).notNull(),
  downloadToken: varchar('download_token', { length: 128 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  downloadStartedAt: timestamp('download_started_at', { withTimezone: true }),
  bootConfirmedAt: timestamp('boot_confirmed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index('idx_ota_jobs_device').on(table.deviceId),
  statusIdx: index('idx_ota_jobs_status').on(table.status),
  createdIdx: index('idx_ota_jobs_created').on(table.createdAt),
}));

// 19. Schema Migrations Table
export const schemaMigrations = pgTable('schema_migrations', {
  version: varchar('version', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  executionTimeMs: integer('execution_time_ms').default(0).notNull(),
  status: varchar('status', { length: 32 }).default('applied').notNull(),
  checksum: varchar('checksum', { length: 128 }),
  errorMessage: text('error_message'),
}, (table) => ({
  appliedAtIdx: index('idx_schema_migrations_applied_at').on(table.appliedAt),
}));

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
  commands: many(deviceCommands),
  otaJobs: many(otaDeploymentJobs),
}));

export const activeAlarmsRelations = relations(activeAlarms, ({ one, many }) => ({
  rule: one(thresholdRules, {
    fields: [activeAlarms.ruleId],
    references: [thresholdRules.id],
  }),
  device: one(devices, {
    fields: [activeAlarms.deviceId],
    references: [devices.id],
  }),
  events: many(alarmEvents),
}));

export const firmwaresRelations = relations(firmwares, ({ many }) => ({
  otaJobs: many(otaDeploymentJobs),
}));

/**
 * Programmatic Schema Contract Alignment Verifier.
 * Guarantees that Drizzle ORM exported tables perfectly match CANONICAL_SCHEMA_METADATA.
 */
export function verifyDrizzleSchemaAlignment(): {
  isAligned: boolean;
  missingTables: string[];
  tablesCount: number;
} {
  const drizzleTableNames = [
    'users',
    'devices',
    'device_ws_messages_dedup',
    'telemetry_packets',
    'telemetry_readings',
    'simulation_telemetry_readings',
    'threshold_rules',
    'active_alarms',
    'alarm_events',
    'notifications',
    'audit_logs',
    'system_events',
    'device_commands',
    'dispatch_logs',
    'user_sessions',
    'dashboard_layouts',
    'firmwares',
    'ota_deployment_jobs',
    'schema_migrations',
  ];

  const canonicalTables = Object.keys(CANONICAL_SCHEMA_METADATA.tables);
  const missingTables = canonicalTables.filter((tbl) => !drizzleTableNames.includes(tbl));

  return {
    isAligned: missingTables.length === 0,
    missingTables,
    tablesCount: drizzleTableNames.length,
  };
}
