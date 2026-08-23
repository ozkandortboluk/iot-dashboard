export type Role = 'admin' | 'customer' | 'analyst' | 'operator';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  notificationEmail?: string;
  whatsappNumber?: string;
  telegramChatId?: string;
  role: Role;
  companyName?: string;
  avatarUrl?: string;
  notificationPreferences?: {
    app?: boolean;
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
    telegram?: boolean;
    webhook?: boolean;
  };
  created_at: string;
  updatedAt?: string;
  version?: number;
}

export interface UserSession {
  token: string;
  userId: string;
  userRole: Role;
  userEmail: string;
  userName: string;
  createdAt: string;
  expiresAt: string;
}

export type DeviceStatus = 'online' | 'offline' | 'warning' | 'maintenance';
export type OtaStatus = 'IDLE' | 'PENDING' | 'DOWNLOADING' | 'FLASHING' | 'VERIFYING' | 'REBOOTING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ROLLED_BACK';

export interface Device {
  id: string;
  userId: string;
  name: string;
  type: 'sensor' | 'server' | 'meter' | 'inverter' | 'gateway' | string;
  roleKey?: string; // Görev Kimliği (Örn: "PUMP_CTRL", "VALVE_CTRL", "METER_MAIN")
  deviceType?: string; // Cihaz Tipi kopyası/detayı (Örn: "pump_controller", "energy_meter")
  hardwareModel?: string; // Donanım Modeli (Örn: "ESP32_WROOM_32", "ESP8266_NODEMCU")
  hardwareRevision?: string; // Donanım Revizyonu (Örn: "v1.0")
  firmwareVersion?: string; // Mevcut Sürüm (Örn: "v1.0.0")
  apiKey: string;
  apiKeyPrefix?: string;
  apiKeyHash?: string;
  status: DeviceStatus;
  location: string;
  ipAddress: string;
  macAddress?: string;
  pingMs?: number;
  rssi?: number;
  lastSeen: string;
  rateLimitPerMin: number;
  encryptionMethod: string;
  dataFlowActive?: boolean;
  heartbeatTimeoutSeconds?: number;
  expectedIntervalSeconds?: number;
  isSimulated?: boolean;
  saveSimulatedDataToDb?: boolean;
  simulatedMetrics?: string[];
  metrics: {
    cpu?: number;
    memory?: number;
    temperature?: number;
    humidity?: number;
    power?: number;
    pressure?: number;
    bandwidth?: number;
    voltage?: number;
  };

  // OTA Updates State & Progress
  otaStatus?: OtaStatus;
  otaTargetFirmwareId?: string;
  otaProgress?: number; // 0 - 100
  otaErrorMessage?: string;
  otaLastCheckAt?: string;
  otaUpdatedAt?: string;
  otaDownloadToken?: string;

  updatedAt?: string;
  version?: number;
}

export interface Firmware {
  id: string;
  name: string; // Örn: "Saha Pompa Kontrolörü Sürüm 1.2.0"
  deviceType: string; // Örn: "pump_controller"
  roleKey: string; // Örn: "PUMP_CTRL"
  hardwareModel: string; // Örn: "ESP32_WROOM_32", "ESP8266_NODEMCU" veya "ALL"
  version: string; // Örn: "v1.2.0"
  description?: string;
  binaryData?: string; // Base64 encoded binary file data (legacy)
  binarySize: number; // Bytes
  sha256: string; // Hash
  signature?: string; // Ed25519 signature
  filePath?: string; // Disk path (uploads/firmware/:id.bin)
  minHardwareRevision?: string;
  isActive: boolean;
  uploadedBy: string; // User ID veya Adı
  created_at: string;
  updatedAt?: string;
}

export interface OtaDeploymentJob {
  id: string;
  firmwareId: string;
  firmwareVersion: string;
  firmwareName: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  roleKey: string;
  targetScope: 'single' | 'selected' | 'role_key' | 'device_type' | 'auto';
  status: OtaStatus;
  progressPercent?: number;
  errorMessage?: string;
  initiatedBy: string;
  downloadToken?: string;
  expiresAt?: string;
  attemptCount?: number;
  maxAttempts?: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  downloadStartedAt?: string;
  bootConfirmedAt?: string;
  created_at: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface HistoryBucket {
  time: string;
  value: number;
  count: number;
}

export interface MetricHistory {
  hourly: HistoryBucket[];
  daily: HistoryBucket[];
  monthly: HistoryBucket[];
}

export type TelemetrySource = 'physical' | 'simulator' | 'manual_test';

export interface TelemetryReading {
  id: string;
  packetId?: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  metric: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  rawPayload?: string;
  sequence?: number;
  source: TelemetrySource;
  environment: 'production' | 'sandbox';
  simulationRunId?: string;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  deviceName?: string;
  command: string;
  payload: string | number;
  status: 'pending' | 'delivered' | 'executed' | 'failed';
  created_at: string;
  delivered_at?: string;
  executed_at?: string;
  source?: string;
}

export type WidgetType = 
  | 'line_chart'
  | 'area_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'radar_chart'
  | 'metric'
  | 'multi_metric'
  | 'metric_matrix'
  | 'gauge'
  | 'power_analyzer'
  | 'devices_status'
  | 'log_stream'
  | 'notifications'
  | 'geo_map'
  | 'device_control'
  | 'button_control'
  | 'slider_control'
  | 'switch_control'
  | 'progress_bar'
  | 'data_table';

export type WidgetSpan = 1 | 2 | 3 | 4;

export interface MatrixSlotConfig {
  id: string;
  label?: string;
  deviceId: string;
  metricKey: string;
  thresholdWarning?: number;
  thresholdCritical?: number;
}

export interface WidgetButtonConfig {
  id: string;
  label: string;
  command: string;
  value: string | number;
  color: string;
  mode?: 'toggle' | 'pulse';
  outputPin?: string;
}

export interface WidgetConfig {
  id: string;
  title: string;
  type: WidgetType;
  deviceId?: string; // 'all' or specific device ID
  metricKey?: string; // 'cpu', 'temperature', 'power', etc.
  unit?: string; // Custom metric unit
  span: WidgetSpan;
  colorScheme: string; // hex or tailwind class
  thresholdWarning?: number;
  thresholdCritical?: number;
  refreshIntervalSeconds?: number;
  timeRange?: 'live' | '1h' | '24h' | '7d';
  showLegend?: boolean;
  showGrid?: boolean;
  displayStyle?: 'card' | 'glass' | 'neon' | 'flat';
  // Control Widget Specific Properties
  buttonCount?: 1 | 2 | 3 | 4;
  buttons?: WidgetButtonConfig[];
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  outputPin?: string;
  metricMappings?: Record<string, string>;
  multiMetricCount?: 2 | 4;
  matrixSlots?: MatrixSlotConfig[];
  thresholdRi?: number;
  thresholdRc?: number;
  lastRiIndex?: number;
  lastRcIndex?: number;
  lastTpIndex?: number;
}

export interface DashboardLayout {
  id: string;
  userId: string;
  title: string;
  widgets: WidgetConfig[];
  updatedAt: string;
  version?: number;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type AlarmState = 'NORMAL' | 'BREACH_PENDING' | 'ACTIVE' | 'SILENCED' | 'RESOLVED';

export interface ActiveAlarm {
  id: string; // ruleId_deviceId_metric
  ruleId: string;
  deviceId: string;
  deviceName: string;
  userId: string;
  metricKey: string;
  operator: '>' | '<' | '==';
  thresholdValue: number;
  currentValue: number;
  severity: NotificationSeverity;
  state: AlarmState;

  source?: 'physical' | 'simulator';
  isSimulation?: boolean;
  environment?: 'production' | 'sandbox';
  
  firstBreachAt?: string;
  triggeredAt?: string;
  lastNotifiedAt?: string;
  resolvedAt?: string;

  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;

  silencedUntil?: string;
  repeatCount: number;
  message: string;
  updatedAt: string;
  version?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  deviceId?: string;
  deviceName?: string;
  timestamp: string;
  read: boolean;
  updatedAt?: string;
  version?: number;
  
  source?: 'physical' | 'simulator';
  isSimulation?: boolean;
  environment?: 'production' | 'sandbox';

  alarmId?: string;
  ruleId?: string;
  alarmState?: 'OPEN' | 'RESOLVED' | 'REPEAT' | 'ACKNOWLEDGED';
  acknowledged?: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  repeatCount?: number;
  currentValue?: number;
  thresholdValue?: number;
  silencedUntil?: string;
}

export type NotificationChannel = 'app' | 'email' | 'sms' | 'webhook' | 'whatsapp' | 'telegram';

export type NotificationQueueStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'retrying';

export interface NotificationQueueItem {
  id: string;
  notificationId?: string;
  ruleId?: string;
  userId: string;
  userName?: string;
  channel: NotificationChannel;
  recipient: string; // email, whatsapp number, phone, telegram chatId, webhook url
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: NotificationQueueStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  errorDetails?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchLogItem {
  id: string;
  queueItemId?: string;
  notificationId?: string;
  userId: string;
  userName?: string;
  channel: NotificationChannel;
  recipient: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: 'delivered' | 'failed';
  attemptCount: number;
  providerResponse?: string;
  errorDetails?: string;
  latencyMs: number;
  sentAt: string;
}

export interface NotificationServiceConfig {
  email: {
    enabled: boolean;
    provider: 'smtp' | 'resend' | 'sendgrid' | 'simulated';
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    fromEmail: string;
    fromName: string;
  };
  whatsapp: {
    enabled: boolean;
    provider: 'cloud_api' | 'twilio' | 'simulated';
    phoneNumberId?: string;
    apiToken?: string;
    businessAccountId?: string;
  };
  telegram: {
    enabled: boolean;
    botToken?: string;
    botUsername?: string;
  };
  sms: {
    enabled: boolean;
    provider: 'twilio' | 'netgsm' | 'simulated';
    apiHeader?: string;
    senderTitle?: string;
  };
  webhook: {
    enabled: boolean;
    defaultEndpoint?: string;
    secretHeader?: string;
  };
}

export interface ThresholdRule {
  id: string;
  userId?: string;                   // Kullanıcı / Müşteri Sahipliği ('usr_admin' veya müşteri ID'si)
  userName?: string;                 // Sahip Kullanıcı Adı
  deviceId: string;                  // 'all' veya belirli cihaz ID'si
  metricKey: string;                 // Metrik ('cpu', 'temperature', 'power', vb.)
  operator: '>' | '<' | '==';        // Koşul
  thresholdValue: number;            // Eşik değeri
  severity: NotificationSeverity;    // Uyarı şiddeti
  enabled: boolean;                  // Aktif/Pasif
  messageTemplate: string;           // Şablon
  hysteresis?: number;               // Histerezis bandı (ör. 2°C veya %5)
  minBreachDurationSeconds?: number; // Minimum ihlal süresi (ör. 10 sn)
  repeatIntervalSeconds?: number;    // Tekrar bildirim aralığı (ör. 300 sn)
  notificationChannels?: NotificationChannel[]; // Bildirim kanalları (örn: ['app', 'email', 'sms'])
  activeHours?: { start: string; end: string } | string; // Aktif saatler (ör. "08:00-18:00" veya "24s")
  recipients?: string[];             // Alıcı listesi (e-posta/telefon listesi)
  silencedUntil?: string;            // Susturma bitiş tarihi
  updatedAt?: string;
  version?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  ip: string;
  severity: 'low' | 'medium' | 'high';
}

export interface DiscoveredNetworkDevice {
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  openPorts: number[];
  status: 'active' | 'transmitting' | 'idle' | 'unregistered';
  pingMs: number;
  rssi: number;
  lastPacket?: string;
  tokenProvided?: string;
  lastSeen?: string;
  registeredDeviceId?: string;
  userId?: string;
}

export interface ServerStats {
  activeConnections: number;
  requestsPerSec: number;
  telemetryIngestedTotal: number;
  dbPoolConnections: number;
  dbType: 'SQLite (Development/Local)' | 'PostgreSQL (Production Ready)';
  uptimeSeconds: number;
}

export type DatabaseEngineType = 'postgres' | 'timescaledb' | 'local';

export interface DatabaseEngineConfig {
  activeEngine: DatabaseEngineType;
  postgresUrl?: string;
  isPostgresConnected: boolean;
  postgresVersion?: string;
  timescaleVersion?: string;
  isTimescaleActive?: boolean;
  lastTestedAt?: string;
  latencyMs?: number;
  tablesStatus?: Record<string, boolean>;
  timescaleStats?: TimescaleDBStats;
}

export interface TimescaleChunkInfo {
  chunkName: string;
  rangeStart: string;
  rangeEnd: string;
  isCompressed: boolean;
  totalBytes: number;
  compressedBytes?: number;
  compressionRatioPercent?: number;
  readingCount: number;
}

export interface ContinuousAggregateInfo {
  viewName: string;
  bucketSize: string;
  refreshSchedule: string;
  rowCount: number;
  lastRefresh: string;
  description: string;
}

export interface TimescaleDBStats {
  isHypertable: boolean;
  hypertableName: string;
  totalChunks: number;
  compressedChunks: number;
  uncompressedBytes: number;
  compressedBytes: number;
  compressionRatioPercent: number;
  spaceSavedMB: number;
  totalReadingsCount: number;
  compressionPolicy: {
    enabled: boolean;
    compressOlderThanDays: number;
    segmentBy: string[];
    orderBy: string;
  };
  retentionPolicy: {
    enabled: boolean;
    dropOlderThanDays: number;
  };
  continuousAggregates: ContinuousAggregateInfo[];
  recentChunks: TimescaleChunkInfo[];
  estimatedDailyStorageMB: number;
  estimatedCompressedDailyMB: number;
}

export interface TimeBucketDataPoint {
  timeBucket: string;
  deviceId: string;
  metric: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  readingCount: number;
}

export interface PostgresSetupGuide {
  dockerCompose: string;
  envExample: string;
  sqlSchema: string;
  timescaleSql: string;
  quickStartCommands: string[];
}

export interface DataRetentionPolicies {
  enabled: boolean;
  autoCleanupIntervalHours: number;
  lastCleanupAt?: string;
  lastCleanedCounts?: {
    telemetry?: number;
    alarms?: number;
    notifications?: number;
    auditLogs?: number;
    dispatchLogs?: number;
    deviceCommands?: number;
    total?: number;
  };
  telemetryDays: number;         // e.g. 90 (0 = keep forever)
  resolvedAlarmsDays: number;    // e.g. 30 (0 = keep forever)
  readNotificationsDays: number; // e.g. 30 (0 = keep forever)
  auditLogsDays: number;         // e.g. 90 (0 = keep forever)
  dispatchLogsDays: number;      // e.g. 30 (0 = keep forever)
  deviceCommandsDays: number;    // e.g. 15 (0 = keep forever)
}

export interface RetentionCleanupResult {
  success: boolean;
  cleanedCounts: {
    telemetry: number;
    alarms: number;
    notifications: number;
    auditLogs: number;
    dispatchLogs: number;
    deviceCommands: number;
    total: number;
  };
  cleanedAt: string;
  message: string;
}



