export type Role = 'admin' | 'customer' | 'analyst' | 'operator';
export type TenantRole = 'admin' | 'maintenance' | 'operator' | 'viewer';

export interface Subscription {
  id: string;
  plan: 'basic' | 'professional' | 'enterprise';
  maxDevices: number;
  maxUsers: number;
  status: 'active' | 'suspended' | 'cancelled';
}

export interface Tenant {
  id: string;
  name: string;
  contactEmail: string;
  subscription: Subscription;
  createdAt: string;
  updatedAt?: string;
}

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
  createdAt: string;
}

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface Zone {
  id: string;
  tenantId: string;
  siteId?: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface DeviceGroup {
  id: string;
  tenantId: string;
  zoneId?: string;
  siteId?: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export interface DeviceReplacementRecord {
  id: string;
  tenantId: string;
  oldDeviceId: string;
  oldDeviceName: string;
  newDeviceId: string;
  newDeviceName: string;
  replacedAt: string;
  replacedBy: string;
  reason?: string;
  notes?: string;
}

export interface DeviceHealthSummary {
  deviceId: string;
  deviceName: string;
  status: DeviceStatus;
  healthScore: number; // 0 - 100
  firmwareVersion?: string;
  hardwareModel?: string;
  lastTelemetryAt?: string;
  lastCommandStatus?: string;
  lastCommandAt?: string;
  activeAlarmsCount: number;
  totalAlarms24h: number;
  dataFreshness: 'live' | 'fresh' | 'stale' | 'dead';
  latencyMs?: number;
  maintenanceMode?: boolean;
}

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
  status?: "active" | "suspended";
  deletedAt?: string; // System level role
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

export type Customer = User;

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

export type OutputType = 'relay' | 'digital' | 'analog' | 'pwm';

export interface DeviceOutputDefinition {
  id: string; // e.g. "relay_1", "relay_2", "digital_1", "analog_1", "pwm_1"
  name: string; // e.g. "Ana Röle", "Durum LED'i", "Analog Çıkış (DAC)", "PWM Fan Hızı"
  type: OutputType; // 'relay' | 'digital' | 'analog' | 'pwm'
  pin?: number; // GPIO pin (e.g. 26, 27, 25, 18)
  initialState?: string | number; // Safe state on reboot (e.g. 0, "LOW")
  activeLow?: boolean; // True for active-low relays/modules
  minValue?: number; // e.g. 0
  maxValue?: number; // e.g. 100 or 255
  pwmChannel?: number; // For ESP32 ledc channel (0-15)
  pwmFreq?: number; // e.g. 5000 Hz
  pwmResolution?: number; // e.g. 8 bits
  unit?: string; // "%", "V", "RPM"
  currentValue?: string | number;
  description?: string;
}

export interface DeviceCapabilities {
  outputs?: DeviceOutputDefinition[];
  sensors?: string[];
  features?: string[];
  maxPwmChannels?: number;
  [key: string]: any;
}

export interface Device {
  id: string;
  tenantId: string; // Canonical Tenant (Customer/Company) ID
  userId?: string; // Backwards compatibility alias for tenantId
  previousTenantId?: string; // Prior owner tenant ID before deletion or reassignment
  previousTenantName?: string; // Prior owner name before deletion
  ownershipTransferredAt?: string; // Timestamp of ownership reassignment
  siteId?: string; // Facility/Location ID
  zoneId?: string; // Facility Zone/Area ID
  groupId?: string; // Logical Device Group ID
  tags?: string[]; // Flexible search and filter tags
  maintenanceMode?: boolean; // If true, alarms are silenced and marked for service
  maintenanceReason?: string; // Reason for maintenance
  maintenanceUntil?: string; // Scheduled completion ISO timestamp
  replacementHistory?: DeviceReplacementRecord[]; // Hardware migration records
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
  apiKeyExpiresAt?: string;
  apiKeyRevoked?: boolean;
  apiKeyLastUsedAt?: string;
  apiKeyScopes?: string[];
  apiKeyRotatedAt?: string;
  previousApiKeyHash?: string;
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
  intervalMode?: 'auto' | 'manual'; // 'auto' (sistem dinamik belirler) veya 'manual' (kullanıcı sabitler)
  customIntervalSeconds?: number; // Kullanıcının belirlediği özel sıklık
  autoDetectedIntervalSeconds?: number; // Sistemin peş peşe gelen paketlerden ölçtüğü sıklık
  recentIntervals?: number[]; // Son N ardışık paket aralıkları (aykırı değer ve burst filtrelemesi için)
  isSimulated?: boolean;
  saveSimulatedDataToDb?: boolean;
  simulatedMetrics?: string[];
  supportedOutputs?: string[];
  supportedCommands?: string[];
  outputDefinitions?: DeviceOutputDefinition[];
  capabilities?: DeviceCapabilities;
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

  // Real-time Unified WebSocket State
  websocketConnected?: boolean;
  lastMessageAt?: string;

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
  keyId?: string; // Ed25519 Signing Key Identifier (e.g. "root_ed25519_v1")
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
  keyId?: string;
  progressPercent?: number;
  errorMessage?: string;
  initiatedBy: string;
  downloadToken?: string;
  downloadTokenHash?: string;
  downloadTokenUsedAt?: string;
  bootNonce?: string;
  bootNonceHash?: string;
  bootNonceUsedAt?: string;
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
  tenantId?: string;
  customerId?: string;
  userId?: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  metric: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  rawPayload?: string;
  sequence?: number;
  bootId?: string;
  idempotencyKey?: string;
  source: TelemetrySource;
  environment: 'production' | 'sandbox';
  simulationRunId?: string;
}

export type DeviceCommandStatus = 
  | 'queued'
  | 'pending'
  | 'sent'
  | 'claimed'
  | 'delivered'
  | 'acknowledged'
  | 'applied'
  | 'executed'
  | 'failed'
  | 'timeout'
  | 'expired'
  | 'cancelled';

export type DeviceCommandSource = 
  | 'manual'
  | 'automation'
  | 'alarm'
  | 'schedule'
  | 'api'
  | 'user_ui'
  | 'user_control'
  | string;

export interface DeviceCommandInputOptions {
  id?: string;
  commandId?: string;
  tenantId?: string;
  customerId?: string;
  deviceId: string;
  deviceName?: string;
  userId?: string;
  commandType?: string;
  command?: string;
  outputId?: string;
  value?: string | number | any;
  payload?: string | number | any;
  source?: DeviceCommandSource;
  status?: DeviceCommandStatus;
  idempotencyKey?: string;
  idempotency_key?: string;
  timeoutSeconds?: number;
  retryCount?: number;
  maxRetries?: number;
  createdAt?: string;
  created_at?: string;
  sentAt?: string;
  sent_at?: string;
  acknowledgedAt?: string;
  acknowledged_at?: string;
  appliedAt?: string;
  applied_at?: string;
  executedAt?: string;
  executed_at?: string;
  errorMessage?: string;
  error_message?: string;
  parameters?: any;
  result?: any;
}

export interface DeviceCommand {
  id: string;
  commandId: string;
  tenantId?: string;
  customerId?: string;
  deviceId: string;
  deviceName?: string;
  userId?: string;
  commandType: string;
  command: string;
  outputId?: string;
  value?: string | number | any;
  payload: string | number | any;
  source: DeviceCommandSource;
  status: DeviceCommandStatus;
  idempotencyKey?: string;
  idempotency_key?: string;
  timeoutSeconds?: number;
  retryCount?: number;
  maxRetries?: number;
  createdAt: string;
  created_at: string;
  sentAt?: string;
  sent_at?: string;
  claimed_at?: string;
  delivered_at?: string;
  acknowledgedAt?: string;
  acknowledged_at?: string;
  appliedAt?: string;
  applied_at?: string;
  executedAt?: string;
  executed_at?: string;
  errorMessage?: string;
  error_message?: string;
  parameters?: any;
  result?: any;
}

// ==========================================
// UNIFIED IOT DEVICE WEBSOCKET PROTOCOL
// ==========================================

export type UnifiedMessageType =
  | 'hello'
  | 'telemetry'
  | 'command'
  | 'ack'
  | 'event'
  | 'ping'
  | 'pong';

export interface UnifiedWsMessage<T = any> {
  type: UnifiedMessageType;
  deviceId: string;
  messageId: string;
  timestamp: number; // Unix timestamp in seconds
  data: T;
}

export interface DeviceHelloData {
  firmwareVersion?: string;
  hardware?: string; // 'ESP8266' | 'ESP32' | 'PYTHON' | string
  ip?: string;
  mac?: string;
  uptimeSeconds?: number;
  freeHeap?: number;
  apiKey?: string;
  [key: string]: any;
}

export interface DeviceTelemetryMetricValue {
  value: number;
  unit?: string;
}

export type DeviceTelemetryData = {
  [metricKey: string]: number | DeviceTelemetryMetricValue | any;
};

export interface DeviceCommandData {
  command: string; // e.g. 'relay', 'digital', 'analog', 'pwm', 'ota', 'reboot'
  output?: number | string; // e.g. 1 or 'relay_1'
  outputId?: string; // e.g. 'relay_1'
  value?: boolean | number | string | any;
  commandId?: string;
  parameters?: Record<string, any>;
  version?: string; // For OTA
  url?: string; // For OTA
  checksum?: string; // For OTA
  [key: string]: any;
}

export type DeviceAckStatus = 'received' | 'executed' | 'failed';

export interface DeviceAckData {
  forMessageId: string;
  status: DeviceAckStatus;
  error?: string;
  result?: any;
  output?: number | string;
  value?: any;
}

export type DeviceEventType =
  | 'boot'
  | 'relay_changed'
  | 'output_changed'
  | 'sensor_error'
  | 'wifi_connected'
  | 'wifi_disconnected'
  | 'ota_started'
  | 'ota_completed'
  | 'ota_failed'
  | 'alarm'
  | string;

export interface DeviceEventData {
  event: DeviceEventType;
  output?: number | string;
  outputId?: string;
  value?: any;
  error?: string;
  details?: any;
  [key: string]: any;
}

export interface DevicePingData {
  [key: string]: any;
}

export interface DevicePongData {
  [key: string]: any;
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
  | 'data_table'
  | 'custom_panel'
  | 'quick_access';

export type WidgetSpan = 1 | 2 | 3 | 4;
export type WidgetHeight = 'H1' | 'H2' | 'H3';

export interface MatrixSlotConfig {
  id: string;
  label?: string;
  deviceId: string;
  metricKey: string;
  thresholdWarning?: number;
  thresholdCritical?: number;
}


export type CustomPanelItemType = 'button' | 'slider' | 'label' | 'switch' | 'indicator' | 'color_picker';
export type CustomPanelColSpan = 1 | 2 | 3 | 4; // 1 (1x1 = 25%), 2 (1x2 = 50%), 3 (1x3 = 75%), 4 (1x4 = 100%)

export interface CustomPanelItem {
  id: string;
  type: CustomPanelItemType;
  deviceId: string;
  metricKey: string; // The metric/pin it controls or reads
  label: string;
  colSpan?: CustomPanelColSpan; // 1x1, 1x2, 1x3, 1x4
  color?: string;
  // Slider / Number specific
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // Button & Switch specific
  valueOn?: string | number;
  valueOff?: string | number;
  buttonMode?: 'toggle' | 'pulse' | 'instant';
  command?: string;
  // Indicator / Lamba specific
  activeMatchValue?: string | number;
  inactiveColor?: string;
  // Label / Display specific
  prefix?: string;
  suffix?: string;
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
  height?: WidgetHeight;
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
  customPanelItems?: CustomPanelItem[];
  thresholdRi?: number;
  thresholdRc?: number;
  lastRiIndex?: number;
  lastRcIndex?: number;
  lastTpIndex?: number;
}

export interface DashboardLayout {
  id: string;
  tenantId: string;
  title: string;
  widgets: WidgetConfig[];
  updatedAt: string;
  version?: number;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type AlarmState = 'NORMAL' | 'BREACH_PENDING' | 'ACTIVE' | 'SILENCED' | 'RESOLVED';

export interface AutomationTrigger {
  deviceId: string;
  metric: string;
  condition: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'NOT_EQUALS';
  value: string | number;
}

export interface AutomationAction {
  deviceId: string;
  commandPayload: Record<string, any>; // e.g., { "role1": 1 } or similar
}

export interface Automation {
  id: string;
  name: string;
  tenantId: string; // To ensure isolation
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  lastTriggered?: string;
  createdAt: string;
}

export interface ActiveAlarm {
  id: string; // ruleId_deviceId_metric
  incidentId?: string; // Unique ID per alarm lifecycle
  lastEvaluatedAt?: string; // Telemetry reading timestamp used for evaluation
  ruleId: string;
  deviceId: string;
  deviceName: string;
  tenantId: string;
  metricKey: string;
  operator: '>' | '>=' | '<' | '<=' | 'OUTSIDE_RANGE' | 'INSIDE_RANGE' | 'UNCHANGED' | 'NO_DATA' | '==';
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

export interface AlarmEvent {
  id: string;
  incidentId: string;
  alarmId: string;
  ruleId: string;
  deviceId: string;
  tenantId: string;
  eventType: 'OPENED' | 'REPEATED' | 'ACKNOWLEDGED' | 'SILENCED' | 'RESOLVED';
  message: string;
  createdAt: string;
  triggeredBy?: string; // User ID or System
}

export interface NotificationItem {
  id: string;
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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
  tenantId?: string;                   // Kullanıcı / Müşteri Sahipliği ('usr_admin' veya müşteri ID'si)
  userName?: string;                 // Sahip Kullanıcı Adı
  deviceId: string;                  // 'all' veya belirli cihaz ID'si
  metricKey: string;                 // Metrik ('cpu', 'temperature', 'power', vb.)
  operator: '>' | '>=' | '<' | '<=' | 'OUTSIDE_RANGE' | 'INSIDE_RANGE' | 'UNCHANGED' | 'NO_DATA'; // Koşul
  thresholdValue: number;            // Eşik değeri (alt sınır veya limit veya süre)
  thresholdMax?: number;             // Aralık üst sınır değeri (OUTSIDE_RANGE/INSIDE_RANGE için)
  severity: NotificationSeverity;    // Uyarı şiddeti
  enabled: boolean;                  // Aktif/Pasif
  messageTemplate: string;           // Şablon
  hysteresis?: number;               // Histerezis bandı (ör. 2°C veya %5)
  minBreachDurationSeconds?: number; // Minimum ihlal süresi (ör. 10 sn)
  repeatIntervalSeconds?: number;    // Tekrar bildirim aralığı (ör. 300 sn)
  notificationChannels?: NotificationChannel[]; // Bildirim kanalları (örn: ['app', 'email', 'sms'])
  activeHours?: { start: string; end: string } | string; // Aktif saatler (ör. "08:00-18:00" veya "24s")
  timezone?: string;                 // Saat dilimi (ör. "Europe/Istanbul")
  recipients?: string[];             // Alıcı listesi (e-posta/telefon listesi)
  disabledUntil?: string;            // Kuralın geçici olarak devre dışı kalacağı zaman (eski silencedUntil)
  updatedAt?: string;
  version?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  tenantId: string;
  userName: string;
  action: string;
  ip: string;
  severity: 'low' | 'medium' | 'high';
}

export type DiscoveredDeviceLifecycleState = 'discovered' | 'pending' | 'assigned' | 'active';

export type PairingMethod = 'qr_scan' | 'pairing_code' | 'network_scan' | 'manual';

export interface DiscoveredNetworkDevice {
  tenantId?: string;
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  openPorts: number[];
  status: 'active' | 'transmitting' | 'idle' | 'unregistered';
  lifecycleState?: DiscoveredDeviceLifecycleState;
  pingMs?: number;
  rssi?: number;
  lastPacket?: string;
  hasAuthToken?: boolean;
  pairingCode?: string;
  serialNumber?: string;
  hardwareModel?: string;
  roleKey?: string;
  firmwareVersion?: string;
  lastSeen?: string;
  registeredDeviceId?: string;
  userId?: string;
}

export interface PairingAuditRecord {
  id: string;
  deviceId?: string;
  deviceName: string;
  tenantId: string;
  tenantName?: string;
  actorId: string;
  actorName: string;
  method: PairingMethod;
  pairingCode?: string;
  macAddress?: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'DUPLICATE_RESOLVED' | 'REJECTED' | 'FAILED';
  resolutionAction?: 'replaced_hardware' | 'updated_existing' | 'created_unique' | 'rejected';
  details: string;
  timestamp: string;
}

export interface CollisionCheckResult {
  hasCollision: boolean;
  collisionType: 'none' | 'mac' | 'ip' | 'name' | 'multiple';
  conflictingDevices: {
    id: string;
    name: string;
    ipAddress?: string;
    macAddress?: string;
    tenantId: string;
    status: string;
  }[];
  suggestedAction: 'proceed' | 'update_existing' | 'replace_hardware' | 'rename_unique';
  message: string;
}

export interface PairDeviceRequest {
  name: string;
  type?: string;
  location?: string;
  ipAddress?: string;
  macAddress?: string;
  pairingCode?: string;
  method: PairingMethod;
  tenantId?: string;
  siteId?: string;
  zoneId?: string;
  groupId?: string;
  tags?: string[];
  apiKey?: string;
  collisionStrategy?: 'reject' | 'update_existing' | 'replace_hardware' | 'force_unique';
  targetDeviceIdToReplace?: string;
}

export interface NetworkScanJob {
  id: string;
  tenantId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subnet: string;
  progress: number;
  discoveredDevices: DiscoveredNetworkDevice[];
  agentId?: string; // Which field agent is performing the scan
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface NetworkAgent {
  id: string;
  tenantId: string;
  hostname: string;
  ip: string;
  status: 'online' | 'offline';
  lastSeen: string;
  version: string;
}

export interface NetworkPingResult {
  ip: string;
  success: boolean;
  timeMs?: number;
  output?: string;
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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}



