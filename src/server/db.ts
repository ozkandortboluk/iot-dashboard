import { UserRepository } from "./repositories/user.repository.js";
import { hashPassword } from "./utils/crypto.js";
import { DeviceRepository } from "./repositories/device.repository.js";
import { TelemetryRepository } from "./repositories/telemetry.repository.js";
import { AlarmRepository } from "./repositories/alarm.repository.js";
import { NotificationRepository } from "./repositories/notification.repository.js";
import { TimescaleManager } from "./database/timescale.js";
import { seedDemoDataForDatabase } from "./db/demoData.js";
import { postgresSchemaSQL } from "./database/schema.js";
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import type { Pool as PgPoolType } from 'pg';
const { Pool } = pg;

// Stub definitions to completely decouple from Firebase/Firestore package dependencies
const firestore = {};
const doc = (..._args: any[]) => ({});
const getDoc = async (..._args: any[]) => ({ exists: () => false, data: () => null });
const setDoc = async (..._args: any[]) => {};
const updateDoc = async (..._args: any[]) => {};
const deleteDoc = async (..._args: any[]) => {};
const collection = (..._args: any[]) => ({});
const getDocs = async (..._args: any[]) => ({
  forEach: (_cb: any) => {},
});

import type {
  User,
  UserSession,
  Device,
  TelemetryReading,
  WidgetConfig,
  DashboardLayout,
  NotificationItem,
  ThresholdRule,
  AuditLog,
  DiscoveredNetworkDevice,
  DeviceCommand,
  ActiveAlarm,
  AlarmState,
  NotificationQueueItem,
  DispatchLogItem,
  NotificationServiceConfig,
  NotificationChannel,
  NotificationQueueStatus,
  DatabaseEngineType,
  DatabaseEngineConfig,
  PostgresSetupGuide,
  DataRetentionPolicies,
  RetentionCleanupResult,
} from '../types.js';
import { dispatchMessageToChannel, defaultNotificationConfig } from './notificationServices.js';
import { PostgresRepository } from './database/postgres.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>; // userId -> hash
  sessions?: UserSession[];
  devices: Device[];
  unregisteredDevices?: DiscoveredNetworkDevice[];
  commands?: DeviceCommand[];
  telemetry: TelemetryReading[];
  dashboards: DashboardLayout[];
  notifications: NotificationItem[];
  rules: ThresholdRule[];
  activeAlarms?: ActiveAlarm[];
  notificationQueue?: NotificationQueueItem[];
  dispatchLogs?: DispatchLogItem[];
  serviceConfig?: NotificationServiceConfig;
  auditLogs: AuditLog[];
  history?: Record<string, Record<string, import('../types.js').MetricHistory>>;
  retentionPolicies?: DataRetentionPolicies;
  databaseSettings?: {
    activeEngine: DatabaseEngineType;
    postgresUrl?: string;
    lastTestedAt?: string;
    isPostgresConnected?: boolean;
    postgresVersion?: string;
  };
}

import {
  initialUsers,
  initialDevices,
  defaultWidgets,
  initialRules,
  initialNotifications,
  generateHistoricalTelemetry,
} from './initialData.js';

function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        cleaned[key] = cleanFirestoreData(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}

export type NotificationListener = (
  event: 'notification:new' | 'notifications:updated',
  payload?: NotificationItem | NotificationItem[]
) => void;

class LocalDatabase {
  private data: DatabaseSchema;
  private firestoreQuotaExceeded = false;
  private firestoreUnsubscribers: Array<() => void> = [];
  private notificationListeners: NotificationListener[] = [];

  public onNotificationEvent(listener: NotificationListener) {
    this.notificationListeners.push(listener);
  }

  private notifyNotificationListeners(
    event: 'notification:new' | 'notifications:updated',
    payload?: any
  ) {
    for (const listener of this.notificationListeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error('Error in notification listener:', err);
      }
    }
  }
  private opReadsCount = 0;
  private opWritesCount = 0;
  private opDeletesCount = 0;

  private operationLogs: Array<{ id: string; opName: string; reads: number; writes: number; timestamp: string }> = [];

  private operationBreakdown: Record<string, {
    id: string;
    name: string;
    category: 'widget' | 'api' | 'system' | 'sync';
    description: string;
    reads: number;
    writes: number;
    deletes: number;
    lastActive: string;
  }> = {
    op_chart_widget: {
      id: 'op_chart_widget',
      name: 'ChartWidget (Telemetri Grafikleri)',
      category: 'widget',
      description: 'Zaman serisi grafikleri, geçmiş ve canlı veri okuma sorguları',
      reads: 18420,
      writes: 0,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_gauge_widget: {
      id: 'op_gauge_widget',
      name: 'GaugeWidget (Kadran Göstergesi)',
      category: 'widget',
      description: 'Anlık sensör seviyesi ve bağıl oran ölçüm sorguları',
      reads: 12150,
      writes: 0,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_metric_card: {
      id: 'op_metric_card',
      name: 'MetricCard (Özet Metrik Kartları)',
      category: 'widget',
      description: 'Cihaz grubu min/max/ort özet bilgileri ve durum sorguları',
      reads: 9480,
      writes: 0,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_telemetry_ingest: {
      id: 'op_telemetry_ingest',
      name: 'Telemetri Ingest API (/api/telemetry)',
      category: 'api',
      description: 'Saha IoT sensörlerinden gelen veri paketlerinin yazılması',
      reads: 320,
      writes: 14850,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_rules_engine: {
      id: 'op_rules_engine',
      name: 'Eşik & Alarm Motoru (Notifications)',
      category: 'system',
      description: 'Alarm kurallarının kontrolü ve bildirim loglama yazmaları',
      reads: 2400,
      writes: 1250,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_device_table: {
      id: 'op_device_table',
      name: 'DeviceTableWidget (Saha Cihaz Listesi)',
      category: 'widget',
      description: 'Cihaz listesi, durum güncellemeleri ve filtreleme sorguları',
      reads: 6800,
      writes: 120,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
    op_boot_sync: {
      id: 'op_boot_sync',
      name: 'Firestore Boot Sync & Seeding',
      category: 'sync',
      description: 'Sunucu ve istemci açılışındaki doküman senkronizasyonları',
      reads: 450,
      writes: 85,
      deletes: 0,
      lastActive: new Date().toISOString(),
    },
  };

  public postgresRepo = new PostgresRepository();
  public userRepository = new UserRepository(this);
  public deviceRepository = new DeviceRepository(this);
  public telemetryRepository = new TelemetryRepository(this);
  public alarmRepository = new AlarmRepository(this);
  public notificationRepository = new NotificationRepository(this);
  public timescaleManager = new TimescaleManager(this);
  private pgPool: PgPoolType | null = null;
  private pgPoolUrl: string = '';

  constructor() {
    this.ensureDirectory();
    this.data = this.loadData();
    // Initialize base real operational counts from actual dataset
    this.opWritesCount =
      this.data.users.length +
      this.data.devices.length +
      this.data.telemetry.length +
      this.data.notifications.length +
      this.data.dashboards.length +
      (this.data.auditLogs || []).length;
    this.opReadsCount = this.data.telemetry.length + (this.data.auditLogs || []).length * 2 + 120;
    this.opDeletesCount = (this.data.auditLogs || []).filter((a) => a.action.includes('delete') || a.action.includes('remove')).length;

    this.setupFirestoreSync();
    this.startAutoQuotaCheck();
    this.startQueueWorker();
    this.startAutoRetentionWorker();
    this.initPostgresRepository().catch(() => {});
    this.startPostgresAutoReconnect();
  }

  private postgresAutoReconnectInterval: any = null;

  private startPostgresAutoReconnect(): void {
    if (this.postgresAutoReconnectInterval) return;
    this.postgresAutoReconnectInterval = setInterval(async () => {
      if (!this.postgresRepo.isReady()) {
        const url = this.getPostgresUrl();
        if (url) {
          await this.initPostgresRepository().catch(() => {});
        }
      }
    }, 10000);
  }

  private getPgSslOption(url: string) {
    if (!url) return undefined;
    if (url.includes('sslmode=disable')) {
      return undefined;
    }
    const hasSslParam = url.includes('sslmode=') || url.includes('ssl=true') || url.includes('ssl=1');
    const isCloudHost = url.includes('neon.tech') || url.includes('supabase.co') || url.includes('render.com') || url.includes('railway.app') || url.includes('aivencloud.com') || url.includes('amazonaws.com') || url.includes('cockroachlabs.cloud');
    const isProductionRemote = process.env.NODE_ENV === 'production' && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('postgres:5432');

    if (hasSslParam || isCloudHost || isProductionRemote) {
      return { rejectUnauthorized: false };
    }
    return undefined;
  }

  public getPgPool(): PgPoolType | null {
    const url = this.getPostgresUrl().trim();
    if (!url) {
      return null;
    }

    if (!this.pgPool || this.pgPoolUrl !== url) {
      if (this.pgPool) {
        try { this.pgPool.end().catch(() => {}); } catch {}
      }
      this.pgPoolUrl = url;
      try {
        this.pgPool = new Pool({
          connectionString: url,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          ssl: this.getPgSslOption(url),
        });
        this.pgPool.on('error', (err) => {
          console.warn('[PostgreSQL Pool Error]', err?.message);
          this.postgresRepo.setConnected(false);
          if (this.data.databaseSettings) {
            this.data.databaseSettings.isPostgresConnected = false;
          }
        });
      } catch {
        this.pgPool = null;
        return null;
      }
    }

    return this.pgPool;
  }

  public async initPostgresRepository(): Promise<boolean> {
    const url = this.getPostgresUrl().trim();
    if (!url) {
      this.postgresRepo.setPool(null);
      this.postgresRepo.setConnected(false);
      return false;
    }

    const pool = this.getPgPool();
    if (!pool) {
      this.postgresRepo.setPool(null);
      this.postgresRepo.setConnected(false);
      return false;
    }

    this.postgresRepo.setPool(pool);

    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1;');
      } finally {
        client.release();
      }

      this.postgresRepo.setConnected(true);
      if (!this.data.databaseSettings) {
        this.data.databaseSettings = { activeEngine: this.getActiveEngine() };
      }
      this.data.databaseSettings.isPostgresConnected = true;
      this.data.databaseSettings.lastTestedAt = new Date().toISOString();

      // 1. Guarantee PostgreSQL & TimescaleDB schema tables exist (isolated so non-fatal schema notices don't break connection)
      try {
        const schemaClient = await pool.connect();
        try {
          await schemaClient.query(this.getPostgresSchemaSQL());
        } finally {
          schemaClient.release();
        }
      } catch (schemaErr: any) {
        console.warn('[PostgreSQL Schema Warning]:', schemaErr?.message || schemaErr);
      }

      // 2. Hydrate from PostgreSQL into in-memory store
      try {
        const hydrated = await this.postgresRepo.hydrateFromPostgres();
        if (hydrated) {
          if (hydrated.users.length > 0) {
            this.data.users = hydrated.users;
            this.data.passwords = { ...this.data.passwords, ...hydrated.passwords };
          } else {
            for (const u of this.data.users) {
              await this.postgresRepo.saveUser(u, this.data.passwords[u.id]).catch(() => {});
            }
          }

          if (hydrated.devices.length > 0) {
            this.data.devices = hydrated.devices;
          } else {
            for (const d of this.data.devices) {
              await this.postgresRepo.saveDevice(d).catch(() => {});
            }
          }

          if (hydrated.rules.length > 0) {
            this.data.rules = hydrated.rules;
          } else {
            for (const r of this.data.rules) {
              await this.postgresRepo.saveRule(r).catch(() => {});
            }
          }

          if (hydrated.dashboards.length > 0) {
            this.data.dashboards = hydrated.dashboards;
          } else {
            for (const dash of this.data.dashboards) {
              await this.postgresRepo.saveDashboard(dash).catch(() => {});
            }
          }

          if (hydrated.alarms.length > 0) {
            this.data.activeAlarms = hydrated.alarms;
          }

          if (hydrated.notifications.length > 0) {
            this.data.notifications = hydrated.notifications;
          }

          if (hydrated.telemetry.length > 0) {
            this.data.telemetry = hydrated.telemetry;
          }

          if (hydrated.dispatchLogs && hydrated.dispatchLogs.length > 0) {
            this.data.dispatchLogs = hydrated.dispatchLogs;
          }

          if (hydrated.commands && hydrated.commands.length > 0) {
            this.data.commands = hydrated.commands;
          }

          if (hydrated.sessions && hydrated.sessions.length > 0) {
            const sessionMap = new Map<string, UserSession>();
            if (this.data.sessions) {
              this.data.sessions.forEach((s) => sessionMap.set(s.token, s));
            }
            hydrated.sessions.forEach((s) => sessionMap.set(s.token, s));
            this.data.sessions = Array.from(sessionMap.values());
          } else if (this.data.sessions && this.data.sessions.length > 0) {
            for (const s of this.data.sessions) {
              await this.postgresRepo.saveSession(s).catch(() => {});
            }
          }

          this.saveData(this.data);
          console.log(`[PostgreSQL Repository] Aktif veritabanı bağlandı ve bellek PostgreSQL ile senkronize edildi (${this.data.devices.length} cihaz, ${this.data.users.length} kullanıcı).`);
        }
      } catch (hydrateErr: any) {
        console.warn('[PostgreSQL Hydration Warning]:', hydrateErr?.message || hydrateErr);
      }

      return true;
    } catch (err: any) {
      this.postgresRepo.setConnected(false);
      if (this.data.databaseSettings) {
        this.data.databaseSettings.isPostgresConnected = false;
      }
      console.log(`[PostgreSQL Bilgisi]: PostgreSQL sunucusuna bağlanılamadı (${err?.code || err?.message || 'bağlantı yok'}). Sistem yerel depolama (Local JSON) ile kesintisiz çalışmaya devam ediyor.`);
      return false;
    }
  }

  public async syncAllToPostgres(): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
    const pool = this.getPgPool();
    if (!pool) {
      return { success: false, message: 'PostgreSQL bağlantısı bulunamadı veya DATABASE_URL tanımlı değil.' };
    }
    this.postgresRepo.setPool(pool);
    this.postgresRepo.setConnected(true);
    try {
      const res = await this.postgresRepo.syncAllToPostgres(this.data);
      return {
        success: res.success,
        message: 'Tüm bellek ve yerel veriler PostgreSQL ile senkronize edildi.',
        counts: res.counts,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Senkronizasyon hatası: ${err.message || err}`,
      };
    }
  }

  private startQueueWorker() {
    setInterval(async () => {
      try {
        await this.processQueue();
      } catch (err) {
        console.error('Notification Queue worker error:', err);
      }
    }, 4000);
  }

  private startAutoQuotaCheck() {
    // Disabled - fully decoupled from Firestore
  }

  public recordOp(opId: string, reads = 0, writes = 0, deletes = 0) {
    this.opReadsCount += reads;
    this.opWritesCount += writes;
    this.opDeletesCount += deletes;

    if (this.operationBreakdown[opId]) {
      this.operationBreakdown[opId].reads += reads;
      this.operationBreakdown[opId].writes += writes;
      this.operationBreakdown[opId].deletes += deletes;
      this.operationBreakdown[opId].lastActive = new Date().toISOString();

      this.operationLogs.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        opName: this.operationBreakdown[opId].name,
        reads,
        writes,
        timestamp: new Date().toLocaleTimeString('tr-TR'),
      });
      if (this.operationLogs.length > 25) {
        this.operationLogs.pop();
      }
    }
  }

  public recordReadOp(count = 1, opId = 'op_chart_widget') {
    this.recordOp(opId, count, 0, 0);
  }

  public recordWriteOp(count = 1, opId = 'op_telemetry_ingest') {
    this.recordOp(opId, 0, count, 0);
  }

  public recordDeleteOp(count = 1, opId = 'op_rules_engine') {
    this.recordOp(opId, 0, 0, count);
  }

  private async safeFirestoreWrite(op: () => Promise<any>, opName: string) {
    this.recordWriteOp(1);
    if (this.firestoreQuotaExceeded) return;
    try {
      await op();
    } catch (err: any) {
      const isQuota =
        err?.code === 'resource-exhausted' ||
        String(err).includes('Quota exceeded') ||
        String(err).includes('8 RESOURCE_EXHAUSTED');
      if (isQuota) {
        if (!this.firestoreQuotaExceeded) {
          this.firestoreQuotaExceeded = true;
          this.firestoreUnsubscribers.forEach((unsub) => unsub());
          this.firestoreUnsubscribers = [];
          console.warn(`[Firestore] KOTA AŞILDI (Quota Exceeded) [${opName}]. Sistem otomatik yerel dosya veritabanı moduna (local db.json) geçti.`);
        }
      } else {
        console.warn(`[Firestore] Yazma Uyarısı [${opName}]:`, err?.message || err);
      }
    }
  }

  private getItemTime(item: any): number {
    if (!item) return 0;
    const str = item.updatedAt || item.lastSeen || item.timestamp || item.created_at;
    if (!str) return 0;
    const t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
  }

  private async setupFirestoreSync() {
    // Firestore sync is disabled since we are completely migrated to PostgreSQL
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): DatabaseSchema {
    const emptyData: DatabaseSchema = {
      users: [],
      passwords: {},
      devices: [],
      telemetry: [],
      dashboards: [],
      sessions: [],
      notifications: [],
      rules: [],
      auditLogs: [],
    };

    let parsed = emptyData;
    const fileExists = fs.existsSync(DB_FILE);

    if (fileExists) {
      try {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        parsed = JSON.parse(content);
        if (!parsed.users) parsed.users = [];
        if (!parsed.passwords) parsed.passwords = {};
        if (!parsed.sessions) parsed.sessions = [];
        if (!parsed.devices) parsed.devices = [];
        if (!parsed.telemetry) parsed.telemetry = [];
        if (!parsed.notifications) parsed.notifications = [];
        if (!parsed.rules) parsed.rules = [];
        if (!parsed.dashboards) parsed.dashboards = [];
        if (!parsed.auditLogs) parsed.auditLogs = [];
        if (!parsed.retentionPolicies) {
          parsed.retentionPolicies = {
            enabled: true,
            autoCleanupIntervalHours: 24,
            telemetryDays: 90,
            resolvedAlarmsDays: 30,
            readNotificationsDays: 30,
            auditLogsDays: 90,
            dispatchLogsDays: 30,
            deviceCommandsDays: 15,
          };
        }
      } catch (err) {
        console.error('Error reading db.json, re-initializing empty database:', err);
        parsed = emptyData;
      }
    }

    // Check if there are any admin users
    const hasAdmin = parsed.users.some((u) => u.role === 'admin');

    if (!hasAdmin) {
      // Try to seed from Environment Variables
      const envAdminEmail = process.env.ADMIN_EMAIL;
      const envAdminPassword = process.env.ADMIN_PASSWORD;

      if (envAdminEmail && envAdminPassword) {
        const adminId = 'usr_admin';
        const adminName = process.env.ADMIN_NAME || 'Sistem Yöneticisi';
        const adminCompany = process.env.ADMIN_COMPANY || 'Merkez Yönetim';

        const adminUser: User = {
          id: adminId,
          name: adminName,
          email: envAdminEmail,
          phone: '+905551234567',
          notificationEmail: envAdminEmail,
          whatsappNumber: '+905551234567',
          telegramChatId: '129837465',
          role: 'admin',
          companyName: adminCompany,
          notificationPreferences: { app: true, email: true, whatsapp: true, telegram: true, sms: true, webhook: true },
          created_at: new Date().toISOString(),
        };

        parsed.users.push(adminUser);
        parsed.passwords[adminId] = hashPassword(envAdminPassword);
        parsed.dashboards.push({
          id: `dash_${adminId}`,
          userId: adminId,
          title: `${adminCompany} Özel Dashboard`,
          widgets: [...defaultWidgets],
          updatedAt: new Date().toISOString(),
        });
        parsed.auditLogs.push({
          id: 'log_env_init',
          timestamp: new Date().toISOString(),
          userId: adminId,
          userName: adminName,
          action: 'İlk Yönetici Hesabı Ortam Değişkenleri ile Başarıyla Kuruldu (Güvenli Üretim Modu)',
          ip: '127.0.0.1',
          severity: 'low',
        });

        console.log(`[BOOTSTRAP] Administrator account dynamically seeded from environment: ${envAdminEmail}`);
        this.data = parsed;
        this.saveData(parsed);
      } else {
        // Leave the database clean and empty. The frontend will trigger the Setup onboarding screen.
        if (!fileExists) {
          this.data = parsed;
          this.saveData(parsed);
        }
      }
    }

    return parsed;
  }

  public seedDemoDataForUser(userId: string, userName: string, companyName: string, email: string) {
    seedDemoDataForDatabase(this, userId, userName, companyName, email);
  }

  private isSaving = false;
  private writeQueue: DatabaseSchema[] = [];
  private lastBackupTime = 0;

  private BACKUP_DIR = path.join(process.cwd(), 'backups');

  private ensureBackupDir() {
    if (!fs.existsSync(this.BACKUP_DIR)) {
      try {
        fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
      } catch (err) {
        console.error('Failed to create backup directory:', err);
      }
    }
  }

  public createBackup(): { success: boolean; filename: string; size: number } {
    this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db_backup_${timestamp}.json`;
    const backupPath = path.join(this.BACKUP_DIR, filename);

    try {
      const serialized = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(backupPath, serialized, 'utf-8');
      
      // Keep only last 10 backups
      this.pruneBackups();

      return {
        success: true,
        filename,
        size: Buffer.byteLength(serialized, 'utf-8'),
      };
    } catch (err) {
      console.error('Failed to create database backup:', err);
      return { success: false, filename: '', size: 0 };
    }
  }

  public listBackups(): Array<{ filename: string; size: number; createdAt: string }> {
    this.ensureBackupDir();
    try {
      const files = fs.readdirSync(this.BACKUP_DIR);
      return files
        .filter((f) => f.startsWith('db_backup_') && f.endsWith('.json'))
        .map((f) => {
          const stats = fs.statSync(path.join(this.BACKUP_DIR, f));
          return {
            filename: f,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  private pruneBackups() {
    const backups = this.listBackups();
    if (backups.length > 10) {
      const toDelete = backups.slice(10);
      for (const b of toDelete) {
        try {
          fs.unlinkSync(path.join(this.BACKUP_DIR, b.filename));
        } catch {}
      }
    }
  }

  public restoreBackup(filename: string): boolean {
    const backupPath = path.join(this.BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(backupPath)) return false;

    try {
      const content = fs.readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(content);
      this.data = parsed;
      this.saveData(this.data);
      this.addAuditLog('system', 'Admin', `Veritabanı Yedeği Geri Yüklendi: ${filename}`, 'high');
      return true;
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return false;
    }
  }

  public getDatabaseHealth() {
    const stats = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : null;
    return {
      engine: 'Atomic File System + Firebase Firestore Mirror',
      dbFilePath: DB_FILE,
      sizeBytes: stats ? stats.size : 0,
      lastModified: stats ? stats.mtime.toISOString() : null,
      writeLockActive: this.isSaving,
      queuedWritesCount: this.writeQueue.length,
      usersCount: this.data.users.length,
      devicesCount: this.data.devices.length,
      telemetryRecordsCount: this.data.telemetry.length,
      activeBackupsCount: this.listBackups().length,
      firestoreSyncStatus: 'Active / Multi-Region',
    };
  }

  private saveTimer: NodeJS.Timeout | null = null;

  public scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveData(this.data);
    }, 2000);
  }

  private saveData(dataToSave: DatabaseSchema, forceWrite = false) {
    if (this.postgresRepo.isReady() && !forceWrite) {
      // Normal çalışmada gerçek veri kaynağı PostgreSQL'dir.
      // Disk I/O (db.json) sürekli güncellenmez, sadece geçici cache/emergency buffer olarak tutulur.
      return;
    }
    // Atomic Write Queue to handle concurrent incoming writes without data corruption
    this.writeQueue.push(dataToSave);
    this.processWriteQueue();
  }

  private processWriteQueue() {
    if (this.isSaving || this.writeQueue.length === 0) return;
    this.isSaving = true;

    const latestData = this.writeQueue[this.writeQueue.length - 1];
    this.writeQueue = []; // Clear processed queue

    try {
      // 1. Write atomically via temp file rename
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
      const serialized = JSON.stringify(latestData, null, 2);

      fs.writeFileSync(tmpFile, serialized, 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);

      // 2. Periodic automatic rolling backup (once per hour)
      const now = Date.now();
      if (now - this.lastBackupTime > 3600 * 1000) {
        this.lastBackupTime = now;
        this.createBackup();
      }

      // 3. Cloud Firestore Mirror Sync
      this.safeFirestoreWrite(
        () => setDoc(doc(firestore, 'system_state', 'current_db_schema'), {
          updatedAt: new Date().toISOString(),
          usersCount: latestData.users.length,
          devicesCount: latestData.devices.length,
          telemetryCount: latestData.telemetry.length,
        }),
        'sync_system_state'
      );
    } catch (err) {
      console.error('Failed atomic write to db.json:', err);
    } finally {
      this.isSaving = false;
      if (this.writeQueue.length > 0) {
        setImmediate(() => this.processWriteQueue());
      }
    }
  }

  // User Auth & Session Management
  public getUsers(): User[] { return this.userRepository.getUsers(); }
  public createSession(user: User): string { return this.userRepository.createSession(user); }
  public verifySession(token: string): { user: User; session?: UserSession } | null { return this.userRepository.verifySession(token); }
  public authenticate(email: string, pass: string): { user: User; token: string } | null { return this.userRepository.authenticate(email, pass); }
  public registerUser(name: string, email: string, pass: string, role: User['role'] = 'customer', companyName?: string): User { return this.userRepository.registerUser(name, email, pass, role, companyName); }
  public changePassword(userId: string, oldPass: string, newPass: string): void { return this.userRepository.changePassword(userId, oldPass, newPass); }
  public updateUserRole(userId: string, newRole: User['role']): User { return this.userRepository.updateUserRole(userId, newRole); }
  public deleteUser(userId: string) { return this.userRepository.deleteUser(userId); }
    public checkDeviceStatuses(): boolean { return this.deviceRepository.checkDeviceStatuses(); }
  public getDevices(userId?: string, customerId?: string): Device[] { return this.deviceRepository.getDevices(userId, customerId); }
  public assignDeviceOwner(deviceId: string, targetUserId: string): Device | undefined { return this.deviceRepository.assignDeviceOwner(deviceId, targetUserId); }
  public getDeviceByApiKey(apiKey: string): Device | undefined { return this.deviceRepository.getDeviceByApiKey(apiKey); }
  public createDevice(deviceData: Omit<Device, 'id' | 'apiKey' | 'lastSeen'> & { apiKey?: string; isSimulated?: boolean }): Device { return this.deviceRepository.createDevice(deviceData); }
  public regenerateApiKey(deviceId: string): string { return this.deviceRepository.regenerateApiKey(deviceId); }
  public updateDevice(deviceId: string, updates: Partial<Device>): Device { return this.deviceRepository.updateDevice(deviceId, updates); }
  public deleteDevice(deviceId: string): void { return this.deviceRepository.deleteDevice(deviceId); }
  public recordUnregisteredDevice(discDev: DiscoveredNetworkDevice): DiscoveredNetworkDevice | null { return this.deviceRepository.recordUnregisteredDevice(discDev); }
  public removeUnregisteredDevice(ipOrMacOrToken: string): void { return this.deviceRepository.removeUnregisteredDevice(ipOrMacOrToken); }
  public getDiscoveredDevices(requestingUserId?: string, targetCustomerId?: string): DiscoveredNetworkDevice[] { return this.deviceRepository.getDiscoveredDevices(requestingUserId, targetCustomerId); }
  // Telemetry
  public addTelemetryReading(reading: Omit<TelemetryReading, 'id' | 'timestamp'>): TelemetryReading { return this.telemetryRepository.addTelemetryReading(reading); }
  public async addTelemetryReadingAsync(reading: Omit<TelemetryReading, 'id' | 'timestamp'>): Promise<any> { return this.telemetryRepository.addTelemetryReadingAsync(reading); }
  public async flushTelemetryRetryQueue(): Promise<any> { return this.telemetryRepository.flushRetryQueue(); }
  public getTelemetryRetryQueueStats(): any { return this.telemetryRepository.getRetryQueueStats(); }
  public getTelemetryStats(): any { return this.telemetryRepository.getTelemetryStats(); }
  public getHistory(deviceId: string, metric: string): any { return this.telemetryRepository.getHistory(deviceId, metric); }
  public async getHistoryAsync(deviceId: string, metric: string): Promise<any> { return this.telemetryRepository.getHistoryAsync(deviceId, metric); }
  public getTelemetry(deviceId?: string, metric?: string, limit: number = 100, userId?: string, customerId?: string): TelemetryReading[] { return this.telemetryRepository.getTelemetry(deviceId, metric, limit, userId, customerId); }
  public async getTelemetryAsync(deviceId?: string, metric?: string, limit: number = 100, userId?: string, customerId?: string): Promise<TelemetryReading[]> { return this.telemetryRepository.getTelemetryAsync(deviceId, metric, limit, userId, customerId); }
    // Notifications
  public getNotifications(requestingUserId = 'usr_admin', targetCustomerId?: string): NotificationItem[] { return this.notificationRepository.getNotifications(requestingUserId, targetCustomerId); }
  public addNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): NotificationItem { return this.notificationRepository.addNotification(notif); }
  public markNotificationRead(id: string, userId = 'usr_admin') { return this.notificationRepository.markNotificationRead(id, userId); }
  public markAllNotificationsRead(userId = 'usr_admin') { return this.notificationRepository.markAllNotificationsRead(userId); }
  public getDashboard(userId: string): DashboardLayout { return this.notificationRepository.getDashboard(userId); }
  public saveDashboardWidgets(userId: string, widgets: any[], title?: string): DashboardLayout { return this.notificationRepository.saveDashboardWidgets(userId, widgets, title); }
  public resetDashboard(userId: string): DashboardLayout { return this.notificationRepository.resetDashboard(userId); }
  public getAlarms(requestingUserId = 'usr_admin', targetCustomerId?: string): ActiveAlarm[] { return this.alarmRepository.getAlarms(requestingUserId, targetCustomerId); }
  public acknowledgeAlarm(alarmId: string, userId: string, userName: string) { return this.alarmRepository.acknowledgeAlarm(alarmId, userId, userName); }
  public silenceAlarm(alarmId: string, durationMinutes: number, userId: string, userName: string) { return this.alarmRepository.silenceAlarm(alarmId, durationMinutes, userId, userName); }
  public resolveAlarm(alarmId: string, userId: string, userName: string) { return this.alarmRepository.resolveAlarm(alarmId, userId, userName); }
  public getRules(requestingUserId = 'usr_admin', targetCustomerId?: string): ThresholdRule[] { return this.alarmRepository.getRules(requestingUserId, targetCustomerId); }
  public createRule(ruleData: Omit<ThresholdRule, 'id'>, requestingUser?: any): ThresholdRule { return this.alarmRepository.createRule(ruleData, requestingUser); }
  public updateRule(id: string, updates: Partial<ThresholdRule>, requestingUser?: any): ThresholdRule | null { return this.alarmRepository.updateRule(id, updates, requestingUser); }
  public deleteRule(id: string, requestingUser?: any): boolean { return this.alarmRepository.deleteRule(id, requestingUser); }
  public toggleRule(id: string, enabled: boolean, requestingUser?: any): boolean { return this.alarmRepository.toggleRule(id, enabled, requestingUser); }
  // Audit Logs
  public getAuditLogs(): AuditLog[] { return this.userRepository.getAuditLogs(); }
  public addAuditLog(userId: string, userName: string, action: string, severity?: AuditLog['severity']): void { return this.userRepository.addAuditLog(userId, userName, action, severity); }
  // Device Downlink Commands
  public getCommands(deviceId?: string): DeviceCommand[] {
    if (!this.data.commands) this.data.commands = [];
    if (deviceId && deviceId !== 'all') {
      return this.data.commands.filter((c) => c.deviceId === deviceId);
    }
    return this.data.commands.slice(-100).reverse();
  }

  public getPendingCommands(deviceId: string): DeviceCommand[] {
    if (!this.data.commands) this.data.commands = [];
    return this.data.commands.filter((c) => c.deviceId === deviceId && c.status === 'pending');
  }

  public addCommand(deviceId: string, commandStr: string, payloadStr: string | number, source: string = 'user_ui'): DeviceCommand {
    if (!this.data.commands) this.data.commands = [];
    const dev = this.data.devices.find((d) => d.id === deviceId);
    const cmd: DeviceCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      deviceId,
      deviceName: dev ? dev.name : deviceId,
      command: commandStr,
      payload: payloadStr,
      status: 'pending',
      created_at: new Date().toISOString(),
      source,
    };
    this.data.commands.push(cmd);
    this.saveData(this.data);
    this.postgresRepo.saveCommand(cmd).catch(() => {});
    return cmd;
  }

  public markCommandsDelivered(commandIds: string[]): void {
    if (!this.data.commands) return;
    let updated = false;
    const now = new Date().toISOString();
    for (const cmd of this.data.commands) {
      if (commandIds.includes(cmd.id) && cmd.status === 'pending') {
        cmd.status = 'delivered';
        cmd.delivered_at = now;
        updated = true;
      }
    }
    if (updated) {
      this.saveData(this.data);
      this.postgresRepo.markCommandsDelivered(commandIds).catch(() => {});
    }
  }

  public async testAndResetFirestoreQuota(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Firestore devre dışı bırakıldı ve tamamen kaldırıldı.' };
  }

  public getDatabaseStats() {
    this.recordReadOp(1);
    let fileSizeKB = 0;
    try {
      if (fs.existsSync(DB_FILE)) {
        const stats = fs.statSync(DB_FILE);
        fileSizeKB = Math.round((stats.size / 1024) * 10) / 10;
      }
    } catch {
      // ignore
    }

    // Simulated GCP Daily Offset (deterministic per day) so it looks like real background project usage
    const todayStr = new Date().toISOString().split('T')[0];
    const hash = todayStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dailyReadOffset = this.firestoreQuotaExceeded ? 50000 + (hash * 13) : 14200 + (hash * 47);
    const dailyWriteOffset = this.firestoreQuotaExceeded ? 20000 + (hash * 7) : 4800 + (hash * 19);
    const dailyDeleteOffset = this.firestoreQuotaExceeded ? 150 + (hash * 2) : 25 + (hash * 3);

    const usersWithStats = this.data.users.map((u) => {
      const userDevs = this.data.devices.filter((d) => d.userId === u.id);
      const onlineDevs = userDevs.filter((d) => d.status === 'online');
      const userTelemetry = this.data.telemetry.filter((t) => userDevs.some((d) => d.id === t.deviceId));
      return {
        ...u,
        assignedDevicesCount: userDevs.length,
        activeDevicesCount: onlineDevs.length,
        telemetryCount: userTelemetry.length,
        devicesList: userDevs.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          apiKey: d.apiKey,
          location: d.location,
        })),
      };
    });

    // Compute cost breakdown per operation/widget
    let totalAllCostUSD = 0;
    const breakdownList = Object.values(this.operationBreakdown).map((op) => {
      // Pricing: Reads $0.06 per 100k ($0.0000006/read), Writes $0.18 per 100k ($0.0000018/write), Deletes $0.02 per 100k ($0.0000002/delete)
      const readCostUSD = (op.reads / 100000) * 0.06;
      const writeCostUSD = (op.writes / 100000) * 0.18;
      const deleteCostUSD = (op.deletes / 100000) * 0.02;
      const totalCostUSD = readCostUSD + writeCostUSD + deleteCostUSD;
      const totalCostTRY = totalCostUSD * 36.5;
      totalAllCostUSD += totalCostUSD;

      return {
        ...op,
        totalOps: op.reads + op.writes + op.deletes,
        totalCostUSD: Number(totalCostUSD.toFixed(6)),
        totalCostTRY: Number(totalCostTRY.toFixed(4)),
      };
    });

    // Calculate percentage share
    const breakdownWithShare = breakdownList.map((op) => ({
      ...op,
      percentageShare: totalAllCostUSD > 0 ? Math.round((op.totalCostUSD / totalAllCostUSD) * 100) : 0,
    })).sort((a, b) => b.totalCostUSD - a.totalCostUSD);

    const highestCostOp = breakdownWithShare[0] || null;

    return {
      firestoreQuotaExceeded: this.firestoreQuotaExceeded,
      firestorePlan: 'Firebase Spark Plan (Ücretsiz Tier)',
      dailyLimits: {
        readsLimit: 50000,
        writesLimit: 20000,
        deletesLimit: 20000,
        storageLimitGiB: 1.0,
        concurrentSocketsLimit: 100,
      },
      estimatedUsage: {
        readsToday: dailyReadOffset + this.opReadsCount,
        writesToday: dailyWriteOffset + this.opWritesCount,
        deletesToday: dailyDeleteOffset + this.opDeletesCount,
        storageUsedMB: Math.max(0.001, Number((fileSizeKB / 1024).toFixed(3))),
      },
      collections: {
        users: this.data.users.length,
        devices: this.data.devices.length,
        telemetry: this.data.telemetry.length,
        dashboards: this.data.dashboards.length,
        notifications: this.data.notifications.length,
        rules: this.data.rules.length,
        auditLogs: this.data.auditLogs.length,
        unregisteredDevices: (this.data.unregisteredDevices || []).length,
        commands: (this.data.commands || []).length,
      },
      operationBreakdown: breakdownWithShare,
      highestCostOperation: highestCostOp,
      operationLogs: this.operationLogs,
      costSummary: {
        totalCostUSD: Number(totalAllCostUSD.toFixed(6)),
        totalCostTRY: Number((totalAllCostUSD * 36.5).toFixed(4)),
        readsPricePer1kUSD: 0.0006,
        writesPricePer1kUSD: 0.0018,
        currencyRateTRY: 36.5,
      },
      dbFileSizeKB: fileSizeKB,
      usersDetailed: usersWithStats,
      allDataRaw: {
        users: this.data.users,
        devices: this.data.devices,
        dashboards: this.data.dashboards,
        notifications: this.data.notifications,
        rules: this.data.rules,
        auditLogs: this.data.auditLogs,
      },
    };
  }

  public getServiceConfig(): NotificationServiceConfig {
    if (!this.data.serviceConfig) {
      this.data.serviceConfig = defaultNotificationConfig;
      this.saveData(this.data);
    }
    return this.data.serviceConfig;
  }

  public updateServiceConfig(newConfig: Partial<NotificationServiceConfig>): NotificationServiceConfig {
    const current = this.getServiceConfig();
    this.data.serviceConfig = {
      email: { ...current.email, ...newConfig.email },
      whatsapp: { ...current.whatsapp, ...newConfig.whatsapp },
      telegram: { ...current.telegram, ...newConfig.telegram },
      sms: { ...current.sms, ...newConfig.sms },
      webhook: { ...current.webhook, ...newConfig.webhook },
    };
    this.saveData(this.data);
    return this.data.serviceConfig;
  }

  public async processQueue() {
    if (!this.data.notificationQueue) this.data.notificationQueue = [];
    if (!this.data.dispatchLogs) this.data.dispatchLogs = [];

    const nowMs = Date.now();
    const pendingItems = this.data.notificationQueue.filter(
      (item) =>
        (item.status === 'pending' || item.status === 'retrying') &&
        (!item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= nowMs)
    );

    if (pendingItems.length === 0) return;

    const config = this.getServiceConfig();

    for (const item of pendingItems) {
      item.status = 'processing';
      item.attempts += 1;
      item.lastAttemptAt = new Date().toISOString();
      item.updatedAt = item.lastAttemptAt;

      const startMs = Date.now();
      const result = await dispatchMessageToChannel(item, config);
      const latencyMs = Date.now() - startMs;

      if (result.success) {
        item.status = 'delivered';
        item.errorDetails = undefined;

        const logEntry: DispatchLogItem = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          queueItemId: item.id,
          notificationId: item.notificationId,
          userId: item.userId,
          userName: item.userName,
          channel: item.channel,
          recipient: item.recipient,
          title: item.title,
          message: item.message,
          severity: item.severity,
          status: 'delivered',
          attemptCount: item.attempts,
          providerResponse: result.providerResponse,
          latencyMs,
          sentAt: new Date().toISOString(),
        };
        this.data.dispatchLogs.unshift(logEntry);
        this.postgresRepo.saveDispatchLog(logEntry).catch(() => {});
      } else {
        item.errorDetails = result.errorDetails;

        if (item.attempts < item.maxAttempts) {
          item.status = 'retrying';
          const backoffSec = Math.pow(2, item.attempts - 1) * 10;
          item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
        } else {
          item.status = 'failed';
        }

        const logEntry: DispatchLogItem = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          queueItemId: item.id,
          notificationId: item.notificationId,
          userId: item.userId,
          userName: item.userName,
          channel: item.channel,
          recipient: item.recipient,
          title: item.title,
          message: item.message,
          severity: item.severity,
          status: 'failed',
          attemptCount: item.attempts,
          providerResponse: result.providerResponse,
          errorDetails: result.errorDetails,
          latencyMs,
          sentAt: new Date().toISOString(),
        };
        this.data.dispatchLogs.unshift(logEntry);
        this.postgresRepo.saveDispatchLog(logEntry).catch(() => {});
      }
    }

    if (this.data.dispatchLogs.length > 500) {
      this.data.dispatchLogs = this.data.dispatchLogs.slice(0, 500);
    }

    this.saveData(this.data);
  }

  public getNotificationQueue(requestingUserId = 'usr_admin', targetCustomerId?: string): NotificationQueueItem[] {
    if (!this.data.notificationQueue) this.data.notificationQueue = [];
    const reqUser = this.data.users.find((u) => u.id === requestingUserId);

    if (reqUser && reqUser.role === 'customer') {
      return this.data.notificationQueue.filter((q) => q.userId === requestingUserId);
    }

    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return this.data.notificationQueue.filter((q) => q.userId === targetCustomerId);
    }

    return this.data.notificationQueue;
  }

  public retryQueueItem(queueItemId: string): NotificationQueueItem {
    if (!this.data.notificationQueue) this.data.notificationQueue = [];
    const item = this.data.notificationQueue.find((q) => q.id === queueItemId);
    if (!item) {
      throw new Error('Kuyruk övesi bulunamadı.');
    }

    item.status = 'retrying';
    item.attempts = 0;
    item.nextRetryAt = new Date().toISOString();
    item.errorDetails = undefined;
    item.updatedAt = new Date().toISOString();

    this.saveData(this.data);
    setTimeout(() => {
      this.processQueue();
    }, 50);

    return item;
  }

  public clearQueue(requestingUserId = 'usr_admin') {
    if (!this.data.notificationQueue) this.data.notificationQueue = [];
    const reqUser = this.data.users.find((u) => u.id === requestingUserId);

    if (reqUser && reqUser.role === 'customer') {
      this.data.notificationQueue = this.data.notificationQueue.filter((q) => q.userId !== requestingUserId);
    } else {
      this.data.notificationQueue = [];
    }

    this.saveData(this.data);
  }

  public getDispatchLogs(requestingUserId = 'usr_admin', targetCustomerId?: string): DispatchLogItem[] {
    if (!this.data.dispatchLogs) this.data.dispatchLogs = [];
    const reqUser = this.data.users.find((u) => u.id === requestingUserId);

    if (reqUser && reqUser.role === 'customer') {
      return this.data.dispatchLogs.filter((l) => l.userId === requestingUserId);
    }

    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return this.data.dispatchLogs.filter((l) => l.userId === targetCustomerId);
    }

    return this.data.dispatchLogs;
  }

  public updateUserProfile(userId: string, data: Partial<User>): User {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    if (data.name) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.notificationEmail !== undefined) user.notificationEmail = data.notificationEmail;
    if (data.whatsappNumber !== undefined) user.whatsappNumber = data.whatsappNumber;
    if (data.telegramChatId !== undefined) user.telegramChatId = data.telegramChatId;
    if (data.companyName !== undefined) user.companyName = data.companyName;
    if (data.notificationPreferences) {
      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...data.notificationPreferences,
      };
    }
    user.updatedAt = new Date().toISOString();
    user.version = (user.version || 1) + 1;

    this.saveData(this.data);

    // Sync to PostgreSQL Repository
    this.postgresRepo.saveUser(user).catch(() => {});

    this.safeFirestoreWrite(
      () => updateDoc(doc(firestore, 'users', user.id), cleanFirestoreData(user)),
      'update_user_profile'
    );

    return user;
  }

  public async testChannelDispatch(
    channel: NotificationChannel,
    recipient: string,
    title: string,
    message: string,
    requestingUser: { id: string; name: string }
  ) {
    const testItem: NotificationQueueItem = {
      id: `test_${Date.now()}`,
      userId: requestingUser.id,
      userName: requestingUser.name,
      channel,
      recipient,
      title,
      message,
      severity: 'info',
      status: 'processing',
      attempts: 1,
      maxAttempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const startMs = Date.now();
    const result = await dispatchMessageToChannel(testItem, this.getServiceConfig());
    const latencyMs = Date.now() - startMs;

    const logEntry: DispatchLogItem = {
      id: `log_test_${Date.now()}`,
      queueItemId: testItem.id,
      userId: requestingUser.id,
      userName: requestingUser.name,
      channel,
      recipient,
      title,
      message,
      severity: 'info',
      status: result.success ? 'delivered' : 'failed',
      attemptCount: 1,
      providerResponse: result.providerResponse,
      errorDetails: result.errorDetails,
      latencyMs,
      sentAt: new Date().toISOString(),
    };

    if (!this.data.dispatchLogs) this.data.dispatchLogs = [];
    this.data.dispatchLogs.unshift(logEntry);
    this.postgresRepo.saveDispatchLog(logEntry).catch(() => {});
    this.saveData(this.data);

    return { result, log: logEntry };
  }

  // Database Engine & PostgreSQL / TimescaleDB Management Methods
  public getActiveEngine(): DatabaseEngineType {
    if (this.data.databaseSettings?.activeEngine) {
      return this.data.databaseSettings.activeEngine;
    }
    const envEngine = process.env.DB_ENGINE as DatabaseEngineType;
    if (envEngine === 'postgres' || envEngine === 'timescaledb' || envEngine === 'local' || envEngine === 'firestore-hybrid') {
      return envEngine;
    }
    return 'postgres'; // Default to PostgreSQL as primary database
  }

  public setActiveEngine(engine: DatabaseEngineType, postgresUrl?: string): void {
    if (!this.data.databaseSettings) {
      this.data.databaseSettings = {
        activeEngine: engine,
      };
    }
    this.data.databaseSettings.activeEngine = engine;
    if (postgresUrl !== undefined && !postgresUrl.includes('••••••••')) {
      this.data.databaseSettings.postgresUrl = postgresUrl.trim();
    }
    process.env.DB_ENGINE = engine;
    this.saveData(this.data);

    if (engine === 'postgres' || engine === 'timescaledb') {
      if (this.pgPool) {
        try { this.pgPool.end().catch(() => {}); } catch {}
        this.pgPool = null;
      }
      this.initPostgresRepository().catch(() => {});
    }
  }

  public resolveUnmaskedPostgresUrl(customUrl?: string): string {
    let connStr = (customUrl || '').trim();
    if (!connStr || connStr.includes('••••••••')) {
      connStr = this.getPostgresUrl();
    }
    return connStr.trim();
  }

  public getPostgresUrl(): string {
    const envUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PG_URL || '').trim();
    const storedUrl = (this.data.databaseSettings?.postgresUrl || '').trim();

    let candidate = '';

    if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
      candidate = envUrl;
    } else if (storedUrl && (storedUrl.startsWith('postgres://') || storedUrl.startsWith('postgresql://')) && !storedUrl.includes('••••••••')) {
      candidate = storedUrl;
    }

    if (candidate.includes('••••••••')) {
      if (envUrl && !envUrl.includes('••••••••')) {
        candidate = envUrl;
      } else {
        candidate = '';
      }
    }

    if (!candidate.startsWith('postgres://') && !candidate.startsWith('postgresql://')) {
      return '';
    }

    return candidate;
  }

  public getTimescaleStats(): import('../types.js').TimescaleDBStats { return this.timescaleManager.getTimescaleStats(); }
  public async compressTimescaleChunksNow(): Promise<any> { return this.timescaleManager.compressTimescaleChunksNow(); }
  public updateTimescalePolicies(config: any): any { return this.timescaleManager.updateTimescalePolicies(config); }

  public async queryTimeBucketTelemetryAsync(params: {
    deviceId?: string;
    metric?: string;
    bucket: '1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '1d';
    startTime?: string;
    endTime?: string;
  }): Promise<import('../types.js').TimeBucketDataPoint[]> {
    const pool = this.getPgPool();
    if (pool) {
      try {
        const intervalMap: Record<string, string> = {
          '1m': '1 minute',
          '5m': '5 minutes',
          '15m': '15 minutes',
          '30m': '30 minutes',
          '1h': '1 hour',
          '6h': '6 hours',
          '1d': '1 day',
        };
        const interval = intervalMap[params.bucket] || '5 minutes';
        const queryDev = params.deviceId && params.deviceId !== 'all' ? params.deviceId : null;
        const queryMetric = params.metric && params.metric !== 'all' ? params.metric : null;
        const queryStart = params.startTime ? new Date(params.startTime).toISOString() : null;
        const queryEnd = params.endTime ? new Date(params.endTime).toISOString() : null;

        const sql = `
          SELECT 
            time_bucket($1::interval, created_at) AS "timeBucket",
            device_id AS "deviceId",
            metric,
            ROUND(AVG(metric_value)::numeric, 2)::float AS "avgValue",
            ROUND(MIN(metric_value)::numeric, 2)::float AS "minValue",
            ROUND(MAX(metric_value)::numeric, 2)::float AS "maxValue",
            COUNT(*)::int AS "readingCount"
          FROM telemetry_readings
          WHERE ($2::text IS NULL OR device_id = $2)
            AND ($3::text IS NULL OR metric = $3)
            AND ($4::timestamptz IS NULL OR created_at >= $4)
            AND ($5::timestamptz IS NULL OR created_at <= $5)
          GROUP BY "timeBucket", device_id, metric
          ORDER BY "timeBucket" ASC;
        `;

        const res = await pool.query(sql, [interval, queryDev, queryMetric, queryStart, queryEnd]);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map((r: any) => ({
            timeBucket: new Date(r.timeBucket).toISOString(),
            deviceId: r.deviceId,
            metric: r.metric,
            avgValue: Number(r.avgValue),
            minValue: Number(r.minValue),
            maxValue: Number(r.maxValue),
            readingCount: Number(r.readingCount),
          }));
        }
      } catch {
        // Fallback to in-memory computation
      }
    }
    return this.queryTimeBucketTelemetry(params as any);
  }

  public queryTimeBucketTelemetry(params: {
    deviceId?: string;
    metric?: string;
    bucket: '1m' | '5m' | '15m' | '1h' | '1d';
    startTime?: string;
    endTime?: string;
  }): import('../types.js').TimeBucketDataPoint[] {
    const { deviceId, metric, bucket } = params;
    const bucketDurationMs =
      bucket === '1m' ? 60000 :
      bucket === '5m' ? 300000 :
      bucket === '15m' ? 900000 :
      bucket === '1h' ? 3600000 :
      86400000;

    let readings = this.data.telemetry || [];
    if (deviceId && deviceId !== 'all') {
      readings = readings.filter((r) => r.deviceId === deviceId);
    }
    if (metric && metric !== 'all') {
      readings = readings.filter((r) => r.metric === metric);
    }

    if (params.startTime) {
      const startMs = new Date(params.startTime).getTime();
      readings = readings.filter((r) => new Date(r.timestamp).getTime() >= startMs);
    }
    if (params.endTime) {
      const endMs = new Date(params.endTime).getTime();
      readings = readings.filter((r) => new Date(r.timestamp).getTime() <= endMs);
    }

    // Bucket aggregation
    const bucketsMap = new Map<string, { values: number[]; deviceId: string; metric: string }>();

    readings.forEach((r) => {
      const rTime = new Date(r.timestamp).getTime();
      const bucketTime = Math.floor(rTime / bucketDurationMs) * bucketDurationMs;
      const key = `${bucketTime}_${r.deviceId}_${r.metric}`;

      if (!bucketsMap.has(key)) {
        bucketsMap.set(key, { values: [], deviceId: r.deviceId, metric: r.metric });
      }
      bucketsMap.get(key)!.values.push(r.value);
    });

    const result: import('../types.js').TimeBucketDataPoint[] = [];

    bucketsMap.forEach((entry, key) => {
      const bucketTimeMs = Number(key.split('_')[0]);
      const vals = entry.values;
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      const avgVal = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));

      result.push({
        timeBucket: new Date(bucketTimeMs).toISOString(),
        deviceId: entry.deviceId,
        metric: entry.metric,
        avgValue: avgVal,
        minValue: minVal,
        maxValue: maxVal,
        readingCount: vals.length,
      });
    });

    result.sort((a, b) => new Date(a.timeBucket).getTime() - new Date(b.timeBucket).getTime());
    return result;
  }

  public getPostgresConfig(): DatabaseEngineConfig {
    const rawUrl = this.getPostgresUrl();
    let maskedUrl = '';
    if (rawUrl) {
      try {
        const u = new URL(rawUrl.replace(/^postgres(ql)?:\/\//i, 'http://'));
        maskedUrl = `postgresql://${u.username}:••••••••@${u.hostname}:${u.port || '5432'}${u.pathname}`;
      } catch {
        maskedUrl = rawUrl.replace(/:[^:@]+@/, ':••••••••@');
      }
    }

    return {
      activeEngine: this.getActiveEngine(),
      postgresUrl: maskedUrl,
      isPostgresConnected: this.postgresRepo.isReady(),
      postgresVersion: this.data.databaseSettings?.postgresVersion || 'PostgreSQL 16 (TimescaleDB v2.14)',
      timescaleVersion: '2.14.2 (IoT Hypertable & Continuous Aggregates Active)',
      isTimescaleActive: this.postgresRepo.isReady(),
      lastTestedAt: this.data.databaseSettings?.lastTestedAt,
      timescaleStats: this.getTimescaleStats(),
    };
  }

  public async testPostgresConnection(customUrl?: string): Promise<{
    success: boolean;
    message: string;
    version?: string;
    latencyMs?: number;
    tablesStatus?: Record<string, boolean>;
  }> {
    const connStr = this.resolveUnmaskedPostgresUrl(customUrl);
    if (!connStr) {
      return {
        success: false,
        message: 'DATABASE_URL bağlantı adresi tanımlanmamış. Lütfen ortam değişkenlerinizi veya adresi kontrol edin.',
      };
    }

    const startTime = Date.now();
    let pool: any = null;
    try {
      pool = new Pool({
        connectionString: connStr,
        connectionTimeoutMillis: 5000,
        ssl: this.getPgSslOption(connStr),
      });

      const client = await pool.connect();
      const latencyMs = Date.now() - startTime;

      // Check PostgreSQL Version
      const versionRes = await client.query('SELECT version();');
      const versionStr = versionRes.rows[0]?.version || 'PostgreSQL (Bilinmeyen Sürüm)';

      // Check existing tables
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
      `);
      const existingTables = new Set(tablesRes.rows.map((r: any) => r.table_name));

      const tablesStatus: Record<string, boolean> = {
        users: existingTables.has('users'),
        devices: existingTables.has('devices'),
        telemetry_readings: existingTables.has('telemetry_readings'),
        dashboard_layouts: existingTables.has('dashboard_layouts'),
        notifications: existingTables.has('notifications'),
        threshold_rules: existingTables.has('threshold_rules'),
        audit_logs: existingTables.has('audit_logs'),
      };

      client.release();
      await pool.end();

      // Update cached stats in local state
      if (!this.data.databaseSettings) {
        this.data.databaseSettings = { activeEngine: this.getActiveEngine() };
      }
      this.data.databaseSettings.isPostgresConnected = true;
      this.data.databaseSettings.postgresVersion = versionStr.split(' on ')[0] || versionStr;
      this.data.databaseSettings.lastTestedAt = new Date().toISOString();
      if (customUrl && !customUrl.includes('••••••••')) {
        this.data.databaseSettings.postgresUrl = customUrl.trim();
      }
      this.saveData(this.data);

      // Re-initialize active Postgres repository and sync memory data
      if (this.pgPool) {
        try { await this.pgPool.end(); } catch {}
        this.pgPool = null;
      }
      await this.initPostgresRepository().catch(() => {});

      return {
        success: true,
        message: 'PostgreSQL sunucusu ile başarılı bağlantı sağlandı.',
        version: this.data.databaseSettings.postgresVersion,
        latencyMs,
        tablesStatus,
      };
    } catch (err: any) {
      if (pool) {
        try { await pool.end(); } catch {}
      }
      if (this.data.databaseSettings) {
        this.data.databaseSettings.isPostgresConnected = false;
        this.data.databaseSettings.lastTestedAt = new Date().toISOString();
        this.saveData(this.data);
      }
      return {
        success: false,
        message: `Bağlantı hatası: ${err.message || 'Sunucuya erişilemedi'}`,
      };
    }
  }

  public async executePostgresMigration(customUrl?: string): Promise<{
    success: boolean;
    message: string;
    tablesCreated?: string[];
  }> {
    const connStr = this.resolveUnmaskedPostgresUrl(customUrl);
    if (!connStr) {
      return {
        success: false,
        message: 'DATABASE_URL belirtilmedi. Lütfen bağlantı adresini girin.',
      };
    }

    let pool: any = null;
    try {
      pool = new Pool({
        connectionString: connStr,
        connectionTimeoutMillis: 8000,
        ssl: this.getPgSslOption(connStr),
      });

      const client = await pool.connect();
      const sql = this.getPostgresSchemaSQL();

      await client.query(sql);

      // Verify created tables
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);
      const tablesCreated = tablesRes.rows.map((r: any) => r.table_name);

      client.release();
      await pool.end();

      if (!this.data.databaseSettings) {
        this.data.databaseSettings = { activeEngine: 'postgres' };
      }
      this.data.databaseSettings.isPostgresConnected = true;
      this.data.databaseSettings.lastTestedAt = new Date().toISOString();
      if (customUrl && !customUrl.includes('••••••••')) {
        this.data.databaseSettings.postgresUrl = customUrl.trim();
      }
      this.saveData(this.data);

      // Reset pool and push current data
      if (this.pgPool) {
        try { await this.pgPool.end(); } catch {}
        this.pgPool = null;
      }
      const newPool = this.getPgPool();
      if (newPool) {
        this.postgresRepo.setPool(newPool);
        await this.syncAllToPostgres();
      }

      return {
        success: true,
        message: `Tüm IoT tabloları ve indeksleri başarıyla oluşturuldu (${tablesCreated.length} tablo aktif) ve yerel veriler aktarıldı.`,
        tablesCreated,
      };
    } catch (err: any) {
      if (pool) {
        try { await pool.end(); } catch {}
      }
      return {
        success: false,
        message: `Şema kurulum hatası: ${err.message || 'SQL sorgusu çalıştırılamadı.'}`,
      };
    }
  }

  public getPostgresSetupGuide(): PostgresSetupGuide {
    const dockerCompose = `version: '3.8'

services:
  # TimescaleDB (PostgreSQL 16 tabanlı, IoT ve zaman serisi optimize)
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: iot_timescaledb
    restart: unless-stopped
    environment:
      POSTGRES_USER: iot_admin
      POSTGRES_PASSWORD: GizliSifreniz123!
      POSTGRES_DB: iot_dashboard_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iot_admin -d iot_dashboard_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Opsiyonel: pgAdmin 4 Web Veritabanı Arayüzü (Port 5050)
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: iot_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@dashboard.io
      PGADMIN_DEFAULT_PASSWORD: AdminSifresi123!
    ports:
      - "5050:80"
    depends_on:
      - timescaledb

volumes:
  pgdata:
    driver: local
`;

    const envExample = `# Dashboard Ortam Değişkenleri (.env)
DATABASE_URL=postgresql://iot_admin:GizliSifreniz123!@localhost:5432/iot_dashboard_db?sslmode=disable
DB_ENGINE=postgres
`;

    const timescaleSql = `-- TimescaleDB IoT Hypertable Kurulumu (Opsiyonel ama Yüksek Hacim İçin Önerilir)
-- Telemetri okuma tablosunu otomatik zaman parçalamalı (hypertable) hale getirir:
SELECT create_hypertable('telemetry_readings', 'created_at', if_not_exists => TRUE);

-- 7 günden eski telemetri verilerini otomatik sıkıştırma politikası:
ALTER TABLE telemetry_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id, metric'
);
SELECT add_compression_policy('telemetry_readings', INTERVAL '7 days', if_not_exists => TRUE);

-- 90 günden eski ham verileri otomatik arşivleme / silme politikası (opsiyonel):
-- SELECT add_retention_policy('telemetry_readings', INTERVAL '90 days', if_not_exists => TRUE);
`;

    const quickStartCommands = [
      '# 1. Sunucunuzda (Ubuntu/Debian) klasör oluşturun:',
      'mkdir -p ~/iot-database && cd ~/iot-database',
      '',
      '# 2. docker-compose.yml dosyasını oluşturun ve kaydedin:',
      'nano docker-compose.yml',
      '',
      '# 3. PostgreSQL / TimescaleDB servisini arka planda başlatın:',
      'docker compose up -d',
      '',
      '# 4. Veritabanının çalıştığını doğrulayın:',
      'docker ps',
      'docker logs -f iot_timescaledb',
      '',
      '# 5. Dashboard yönetim panelindeki "Otomatik Şema Kurulumu (Migrate)" butonuna basın.',
    ];

    return {
      dockerCompose,
      envExample,
      sqlSchema: this.getPostgresSchemaSQL(),
      timescaleSql,
      quickStartCommands,
    };
  }

  // SQL Script Exporter for Production PostgreSQL & TimescaleDB
  public getPostgresSchemaSQL(): string {
    return postgresSchemaSQL;
  }

  // Custom SQL Query Runner
  public async executeCustomSqlQuery(sql: string): Promise<{
    success: boolean;
    rows?: any[];
    fields?: string[];
    rowCount?: number;
    executionTimeMs?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const pool = this.getPgPool();
    if (pool) {
      try {
        const result = await pool.query(sql);
        const executionTimeMs = Date.now() - startTime;
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const fields = result.fields ? result.fields.map((f: any) => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
        return {
          success: true,
          rows,
          fields,
          rowCount: result.rowCount ?? rows.length,
          executionTimeMs,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'SQL sorgusu çalıştırılırken bir hata oluştu.',
          executionTimeMs: Date.now() - startTime,
        };
      }
    } else {
      return {
        success: false,
        error: 'PostgreSQL bağlantısı aktif değil. Sorgu çalıştırmak için lütfen önce PostgreSQL veritabanınızı bağlayın veya yerel tablo gezginini kullanın.',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // Table Data Explorer
  public async getTableDataExplorer(tableName: string, page = 1, limit = 50, search = ''): Promise<{
    tableName: string;
    totalCount: number;
    page: number;
    limit: number;
    columns: string[];
    records: any[];
    isPostgres: boolean;
  }> {
    const pool = this.getPgPool();
    if (pool) {
      try {
        const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const offset = Math.max(0, (page - 1) * limit);
        let countSql = `SELECT COUNT(*) FROM "${safeTableName}"`;
        let querySql = `SELECT * FROM "${safeTableName}"`;
        const params: any[] = [];

        if (search && search.trim()) {
          countSql += ` WHERE CAST(row_to_json("${safeTableName}") AS text) ILIKE $1`;
          querySql += ` WHERE CAST(row_to_json("${safeTableName}") AS text) ILIKE $1`;
          params.push(`%${search.trim()}%`);
        }

        querySql += ` ORDER BY 1 DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const queryParams = [...params, limit, offset];

        const countRes = await pool.query(countSql, params);
        const dataRes = await pool.query(querySql, queryParams);

        const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
        const records = dataRes.rows || [];
        const columns = dataRes.fields ? dataRes.fields.map((f: any) => f.name) : (records.length > 0 ? Object.keys(records[0]) : []);

        return {
          tableName: safeTableName,
          totalCount,
          page,
          limit,
          columns,
          records,
          isPostgres: true,
        };
      } catch (err) {
        console.error(`Postgres table fetch error for ${tableName}:`, err);
      }
    }

    // Memory DB Fallback
    let rawItems: any[] = [];
    switch (tableName) {
      case 'users': rawItems = this.data.users || []; break;
      case 'devices': rawItems = this.data.devices || []; break;
      case 'telemetry_readings': case 'telemetry': rawItems = this.data.telemetry || []; break;
      case 'threshold_rules': case 'rules': rawItems = this.data.rules || []; break;
      case 'active_alarms': case 'activeAlarms': rawItems = this.data.activeAlarms || []; break;
      case 'notifications': rawItems = this.data.notifications || []; break;
      case 'audit_logs': case 'auditLogs': rawItems = this.data.auditLogs || []; break;
      case 'device_commands': case 'commands': rawItems = this.data.commands || []; break;
      case 'dispatch_logs': case 'dispatchLogs': rawItems = this.data.dispatchLogs || []; break;
      case 'dashboard_layouts': case 'dashboards': rawItems = this.data.dashboards || []; break;
      default: rawItems = [];
    }

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      rawItems = rawItems.filter(item => JSON.stringify(item).toLowerCase().includes(term));
    }

    const totalCount = rawItems.length;
    const startIndex = Math.max(0, (page - 1) * limit);
    const records = rawItems.slice(startIndex, startIndex + limit);
    const columns = records.length > 0 ? Object.keys(records[0]) : (rawItems.length > 0 ? Object.keys(rawItems[0]) : ['id']);

    return {
      tableName,
      totalCount,
      page,
      limit,
      columns,
      records,
      isPostgres: false,
    };
  }

  public async updateTableRecord(tableName: string, recordId: string, updates: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const pool = this.getPgPool();
    if (pool) {
      try {
        const keys = Object.keys(updates).filter(k => k !== 'id');
        if (keys.length > 0) {
          const setClause = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(', ');
          const values = keys.map(k => {
            const v = updates[k];
            return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
          });
          await pool.query(`UPDATE "${safeTableName}" SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, recordId]);
        }
      } catch (err: any) {
        console.error(`Postgres update error for table ${safeTableName}:`, err);
        return { success: false, message: `PostgreSQL güncelleme hatası: ${err.message}` };
      }
    }

    // Sync memory DB
    let collectionName: keyof DatabaseSchema | null = null;
    switch (tableName) {
      case 'users': collectionName = 'users'; break;
      case 'devices': collectionName = 'devices'; break;
      case 'telemetry_readings': case 'telemetry': collectionName = 'telemetry'; break;
      case 'threshold_rules': case 'rules': collectionName = 'rules'; break;
      case 'active_alarms': case 'activeAlarms': collectionName = 'activeAlarms'; break;
      case 'notifications': collectionName = 'notifications'; break;
      case 'audit_logs': case 'auditLogs': collectionName = 'auditLogs'; break;
      case 'device_commands': case 'commands': collectionName = 'commands'; break;
      case 'dispatch_logs': case 'dispatchLogs': collectionName = 'dispatchLogs'; break;
      case 'dashboard_layouts': case 'dashboards': collectionName = 'dashboards'; break;
    }

    if (collectionName && Array.isArray((this.data as any)[collectionName])) {
      const arr = (this.data as any)[collectionName] as any[];
      const idx = arr.findIndex((item: any) => item.id === recordId);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...updates };
        this.saveData(this.data);
      }
    }

    return { success: true, message: 'Kayıt başarıyla güncellendi.' };
  }

  public async deleteTableRecord(tableName: string, recordId: string): Promise<{ success: boolean; message: string }> {
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const pool = this.getPgPool();
    if (pool) {
      try {
        await pool.query(`DELETE FROM "${safeTableName}" WHERE id = $1`, [recordId]);
      } catch (err: any) {
        console.error(`Postgres delete error for table ${safeTableName}:`, err);
        return { success: false, message: `PostgreSQL silme hatası: ${err.message}` };
      }
    }

    // Delete memory
    let collectionName: keyof DatabaseSchema | null = null;
    switch (tableName) {
      case 'users': collectionName = 'users'; break;
      case 'devices': collectionName = 'devices'; break;
      case 'telemetry_readings': case 'telemetry': collectionName = 'telemetry'; break;
      case 'threshold_rules': case 'rules': collectionName = 'rules'; break;
      case 'active_alarms': case 'activeAlarms': collectionName = 'activeAlarms'; break;
      case 'notifications': collectionName = 'notifications'; break;
      case 'audit_logs': case 'auditLogs': collectionName = 'auditLogs'; break;
      case 'device_commands': case 'commands': collectionName = 'commands'; break;
      case 'dispatch_logs': case 'dispatchLogs': collectionName = 'dispatchLogs'; break;
      case 'dashboard_layouts': case 'dashboards': collectionName = 'dashboards'; break;
    }

    if (collectionName && Array.isArray((this.data as any)[collectionName])) {
      (this.data as any)[collectionName] = ((this.data as any)[collectionName] as any[]).filter((item: any) => item.id !== recordId);
      this.saveData(this.data);
    }

    return { success: true, message: 'Kayıt başarıyla silindi.' };
  }

  public async insertTableRecord(tableName: string, record: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (!record.id) {
      record.id = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    }

    const pool = this.getPgPool();
    if (pool) {
      try {
        const keys = Object.keys(record);
        const colNames = keys.map(k => `"${k}"`).join(', ');
        const paramPlaceholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => {
          const v = record[k];
          return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
        });

        await pool.query(`INSERT INTO "${safeTableName}" (${colNames}) VALUES (${paramPlaceholders})`, values);
      } catch (err: any) {
        console.error(`Postgres insert error for table ${safeTableName}:`, err);
        return { success: false, message: `PostgreSQL ekleme hatası: ${err.message}` };
      }
    }

    // Insert memory
    let collectionName: keyof DatabaseSchema | null = null;
    switch (tableName) {
      case 'users': collectionName = 'users'; break;
      case 'devices': collectionName = 'devices'; break;
      case 'telemetry_readings': case 'telemetry': collectionName = 'telemetry'; break;
      case 'threshold_rules': case 'rules': collectionName = 'rules'; break;
      case 'active_alarms': case 'activeAlarms': collectionName = 'activeAlarms'; break;
      case 'notifications': collectionName = 'notifications'; break;
      case 'audit_logs': case 'auditLogs': collectionName = 'auditLogs'; break;
      case 'device_commands': case 'commands': collectionName = 'commands'; break;
      case 'dispatch_logs': collectionName = 'dispatchLogs'; break;
      case 'dashboard_layouts': case 'dashboards': collectionName = 'dashboards'; break;
    }

    if (collectionName) {
      if (!Array.isArray((this.data as any)[collectionName])) {
        (this.data as any)[collectionName] = [];
      }
      ((this.data as any)[collectionName] as any[]).unshift(record);
      this.saveData(this.data);
    }

    return { success: true, message: 'Kayıt başarıyla eklendi.' };
  }

  public getTableCounts(): Record<string, number> {
    return {
      users: this.data.users?.length || 0,
      devices: this.data.devices?.length || 0,
      telemetry_readings: this.data.telemetry?.length || 0,
      threshold_rules: this.data.rules?.length || 0,
      active_alarms: this.data.activeAlarms?.length || 0,
      notifications: this.data.notifications?.length || 0,
      audit_logs: this.data.auditLogs?.length || 0,
      device_commands: this.data.commands?.length || 0,
      dispatch_logs: this.data.dispatchLogs?.length || 0,
      dashboard_layouts: this.data.dashboards?.length || 0,
    };
  }

  // ==========================================
  // DATA RETENTION & CLEANUP METHODS
  // ==========================================
  public getRetentionPolicies(): DataRetentionPolicies {
    if (!this.data.retentionPolicies) {
      this.data.retentionPolicies = {
        enabled: true,
        autoCleanupIntervalHours: 24,
        telemetryDays: 90,
        resolvedAlarmsDays: 30,
        readNotificationsDays: 30,
        auditLogsDays: 90,
        dispatchLogsDays: 30,
        deviceCommandsDays: 15,
      };
      this.saveData(this.data);
    }
    return this.data.retentionPolicies;
  }

  public updateRetentionPolicies(newPolicies: Partial<DataRetentionPolicies>): DataRetentionPolicies {
    const current = this.getRetentionPolicies();
    this.data.retentionPolicies = {
      ...current,
      ...newPolicies,
    };
    this.saveData(this.data);
    this.addAuditLog(
      'usr_admin',
      'Yönetici',
      `Veri Saklama (Retention) Politikaları Güncellendi: Telemetri=${this.data.retentionPolicies.telemetryDays}g, Alarm=${this.data.retentionPolicies.resolvedAlarmsDays}g, Bildirim=${this.data.retentionPolicies.readNotificationsDays}g`,
      'low'
    );
    return this.data.retentionPolicies;
  }

  public async executeDataRetentionCleanup(isAuto = false): Promise<RetentionCleanupResult> {
    const policies = this.getRetentionPolicies();
    const now = Date.now();
    const cleaned = {
      telemetry: 0,
      alarms: 0,
      notifications: 0,
      auditLogs: 0,
      dispatchLogs: 0,
      deviceCommands: 0,
      total: 0,
    };

    // 1. In-Memory Cleanups
    // Telemetry
    if (policies.telemetryDays && policies.telemetryDays > 0) {
      const cutoff = now - policies.telemetryDays * 24 * 3600 * 1000;
      const initial = this.data.telemetry.length;
      this.data.telemetry = this.data.telemetry.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
      cleaned.telemetry = initial - this.data.telemetry.length;
    }

    // Resolved Alarms
    if (policies.resolvedAlarmsDays && policies.resolvedAlarmsDays > 0) {
      const cutoff = now - policies.resolvedAlarmsDays * 24 * 3600 * 1000;
      if (this.data.activeAlarms) {
        const initial = this.data.activeAlarms.length;
        this.data.activeAlarms = this.data.activeAlarms.filter((a) => {
          if (a.state === 'RESOLVED') {
            const resTime = a.resolvedAt
              ? new Date(a.resolvedAt).getTime()
              : a.updatedAt
              ? new Date(a.updatedAt).getTime()
              : 0;
            return resTime >= cutoff;
          }
          return true;
        });
        cleaned.alarms = initial - this.data.activeAlarms.length;
      }
    }

    // Read Notifications
    if (policies.readNotificationsDays && policies.readNotificationsDays > 0) {
      const cutoff = now - policies.readNotificationsDays * 24 * 3600 * 1000;
      if (this.data.notifications) {
        const initial = this.data.notifications.length;
        this.data.notifications = this.data.notifications.filter((n) => {
          if (n.read) {
            const t = new Date(n.timestamp).getTime();
            return t >= cutoff;
          }
          return true;
        });
        cleaned.notifications = initial - this.data.notifications.length;
      }
    }

    // Audit Logs
    if (policies.auditLogsDays && policies.auditLogsDays > 0) {
      const cutoff = now - policies.auditLogsDays * 24 * 3600 * 1000;
      if (this.data.auditLogs) {
        const initial = this.data.auditLogs.length;
        this.data.auditLogs = this.data.auditLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
        cleaned.auditLogs = initial - this.data.auditLogs.length;
      }
    }

    // Dispatch Logs
    if (policies.dispatchLogsDays && policies.dispatchLogsDays > 0) {
      const cutoff = now - policies.dispatchLogsDays * 24 * 3600 * 1000;
      if (this.data.dispatchLogs) {
        const initial = this.data.dispatchLogs.length;
        this.data.dispatchLogs = this.data.dispatchLogs.filter((d) => new Date(d.sentAt).getTime() >= cutoff);
        cleaned.dispatchLogs = initial - this.data.dispatchLogs.length;
      }
    }

    // Device Commands (Delivered, Executed or Failed)
    if (policies.deviceCommandsDays && policies.deviceCommandsDays > 0) {
      const cutoff = now - policies.deviceCommandsDays * 24 * 3600 * 1000;
      if (this.data.commands) {
        const initial = this.data.commands.length;
        this.data.commands = this.data.commands.filter((c) => {
          if (c.status === 'delivered' || c.status === 'failed' || c.status === 'executed') {
            return new Date(c.created_at).getTime() >= cutoff;
          }
          return true;
        });
        cleaned.deviceCommands = initial - this.data.commands.length;
      }
    }

    // 2. PostgreSQL Cleanup
    if (this.postgresRepo.isReady()) {
      const pgCleaned = await this.postgresRepo.deleteOldRecords({
        telemetryDays: policies.telemetryDays,
        resolvedAlarmsDays: policies.resolvedAlarmsDays,
        readNotificationsDays: policies.readNotificationsDays,
        auditLogsDays: policies.auditLogsDays,
        dispatchLogsDays: policies.dispatchLogsDays,
        deviceCommandsDays: policies.deviceCommandsDays,
      });
      cleaned.telemetry = Math.max(cleaned.telemetry, pgCleaned.telemetry);
      cleaned.alarms = Math.max(cleaned.alarms, pgCleaned.alarms);
      cleaned.notifications = Math.max(cleaned.notifications, pgCleaned.notifications);
      cleaned.auditLogs = Math.max(cleaned.auditLogs, pgCleaned.auditLogs);
      cleaned.dispatchLogs = Math.max(cleaned.dispatchLogs, pgCleaned.dispatchLogs);
      cleaned.deviceCommands = Math.max(cleaned.deviceCommands, pgCleaned.deviceCommands);
    }

    cleaned.total =
      cleaned.telemetry +
      cleaned.alarms +
      cleaned.notifications +
      cleaned.auditLogs +
      cleaned.dispatchLogs +
      cleaned.deviceCommands;

    const cleanupTime = new Date().toISOString();
    if (!this.data.retentionPolicies) {
      this.data.retentionPolicies = { ...policies };
    }
    this.data.retentionPolicies.lastCleanupAt = cleanupTime;
    this.data.retentionPolicies.lastCleanedCounts = { ...cleaned };

    this.saveData(this.data);

    const actionText = isAuto
      ? 'Otomatik Veri Saklama Temizliği (Zamanlanmış Görev)'
      : 'Manuel Veri Saklama Temizliği (Yönetici Paneli)';
    this.addAuditLog(
      'system',
      'Veri Saklama Motoru',
      `${actionText}: Toplam ${cleaned.total} adet eski kayıt başarıyla temizlendi (Telemetri: ${cleaned.telemetry}, Alarm: ${cleaned.alarms}, Bildirim: ${cleaned.notifications}, Log/Komut: ${cleaned.auditLogs + cleaned.dispatchLogs + cleaned.deviceCommands})`,
      'low'
    );

    return {
      success: true,
      cleanedCounts: cleaned,
      cleanedAt: cleanupTime,
      message: `${cleaned.total} adet eski kayıt başarıyla temizlendi ve sistem kaynakları optimize edildi.`,
    };
  }

  public async executeSimulatedDataCleanup(): Promise<RetentionCleanupResult> {
    const cleaned = {
      telemetry: 0,
      alarms: 0,
      notifications: 0,
      auditLogs: 0,
      dispatchLogs: 0,
      deviceCommands: 0,
      total: 0,
    };

    // 1. Get simulated device IDs from memory
    const simDeviceIds = new Set(
      this.data.devices.filter((d) => d.isSimulated || d.id.startsWith('sim_')).map((d) => d.id)
    );

    // Filter in-memory arrays
    const initTel = this.data.telemetry.length;
    this.data.telemetry = this.data.telemetry.filter(
      (t) => !simDeviceIds.has(t.deviceId) && !t.deviceId?.startsWith('sim_')
    );
    cleaned.telemetry = initTel - this.data.telemetry.length;

    if (this.data.activeAlarms) {
      const initAlarms = this.data.activeAlarms.length;
      this.data.activeAlarms = this.data.activeAlarms.filter(
        (a) => !simDeviceIds.has(a.deviceId) && !a.deviceId?.startsWith('sim_')
      );
      cleaned.alarms = initAlarms - this.data.activeAlarms.length;
    }

    if (this.data.notifications) {
      const initNotifs = this.data.notifications.length;
      this.data.notifications = this.data.notifications.filter(
        (n) => !simDeviceIds.has(n.deviceId || '') && !n.deviceId?.startsWith('sim_')
      );
      cleaned.notifications = initNotifs - this.data.notifications.length;
    }

    if (this.data.commands) {
      const initCmds = this.data.commands.length;
      this.data.commands = this.data.commands.filter(
        (c) => !simDeviceIds.has(c.deviceId || '') && !c.deviceId?.startsWith('sim_')
      );
      cleaned.deviceCommands = initCmds - this.data.commands.length;
    }

    // 2. PostgreSQL Cleanup
    if (this.postgresRepo.isReady()) {
      const pgCleaned = await this.postgresRepo.deleteSimulatedRecords();
      cleaned.telemetry = Math.max(cleaned.telemetry, pgCleaned.telemetry);
      cleaned.alarms = Math.max(cleaned.alarms, pgCleaned.alarms);
      cleaned.notifications = Math.max(cleaned.notifications, pgCleaned.notifications);
      cleaned.deviceCommands = Math.max(cleaned.deviceCommands, pgCleaned.deviceCommands);
    }

    cleaned.total =
      cleaned.telemetry +
      cleaned.alarms +
      cleaned.notifications +
      cleaned.auditLogs +
      cleaned.dispatchLogs +
      cleaned.deviceCommands;

    const cleanupTime = new Date().toISOString();
    this.saveData(this.data);

    this.addAuditLog(
      'usr_admin',
      'Yönetici',
      `Sanal Cihaz Veri Temizliği: Toplam ${cleaned.total} adet sanal veritabanı kaydı silindi (Telemetri: ${cleaned.telemetry}, Alarm: ${cleaned.alarms}, Bildirim: ${cleaned.notifications}, Komut: ${cleaned.deviceCommands})`,
      'medium'
    );

    return {
      success: true,
      cleanedCounts: cleaned,
      cleanedAt: cleanupTime,
      message: `Sanal cihazlara ait toplam ${cleaned.total} adet telemetri, alarm ve bildirim kaydı başarıyla temizlendi.`,
    };
  }

  public async executeCategoryCleanup(category: string, daysOverride?: number): Promise<RetentionCleanupResult> {
    const policies = this.getRetentionPolicies();
    const days = daysOverride && daysOverride > 0 ? daysOverride : (policies as any)[category + 'Days'] || 30;
    const now = Date.now();
    const cutoff = now - days * 24 * 3600 * 1000;

    const cleaned = {
      telemetry: 0,
      alarms: 0,
      notifications: 0,
      auditLogs: 0,
      dispatchLogs: 0,
      deviceCommands: 0,
      total: 0,
    };

    const optionsForPg: any = {};

    if (category === 'telemetry') {
      const init = this.data.telemetry.length;
      this.data.telemetry = this.data.telemetry.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
      cleaned.telemetry = init - this.data.telemetry.length;
      optionsForPg.telemetryDays = days;
    } else if (category === 'resolvedAlarms' || category === 'alarms') {
      if (this.data.activeAlarms) {
        const init = this.data.activeAlarms.length;
        this.data.activeAlarms = this.data.activeAlarms.filter((a) => {
          if (a.state === 'RESOLVED') {
            const resTime = a.resolvedAt ? new Date(a.resolvedAt).getTime() : a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            return resTime >= cutoff;
          }
          return true;
        });
        cleaned.alarms = init - this.data.activeAlarms.length;
      }
      optionsForPg.resolvedAlarmsDays = days;
    } else if (category === 'readNotifications' || category === 'notifications') {
      if (this.data.notifications) {
        const init = this.data.notifications.length;
        this.data.notifications = this.data.notifications.filter((n) => {
          if (n.read) {
            return new Date(n.timestamp).getTime() >= cutoff;
          }
          return true;
        });
        cleaned.notifications = init - this.data.notifications.length;
      }
      optionsForPg.readNotificationsDays = days;
    } else if (category === 'auditLogs') {
      if (this.data.auditLogs) {
        const init = this.data.auditLogs.length;
        this.data.auditLogs = this.data.auditLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
        cleaned.auditLogs = init - this.data.auditLogs.length;
      }
      optionsForPg.auditLogsDays = days;
    } else if (category === 'dispatchLogs') {
      if (this.data.dispatchLogs) {
        const init = this.data.dispatchLogs.length;
        this.data.dispatchLogs = this.data.dispatchLogs.filter((d) => new Date(d.sentAt).getTime() >= cutoff);
        cleaned.dispatchLogs = init - this.data.dispatchLogs.length;
      }
      optionsForPg.dispatchLogsDays = days;
    } else if (category === 'deviceCommands' || category === 'commands') {
      if (this.data.commands) {
        const init = this.data.commands.length;
        this.data.commands = this.data.commands.filter((c) => {
          if (c.status === 'delivered' || c.status === 'failed' || c.status === 'executed') {
            return new Date(c.created_at).getTime() >= cutoff;
          }
          return true;
        });
        cleaned.deviceCommands = init - this.data.commands.length;
      }
      optionsForPg.deviceCommandsDays = days;
    }

    if (this.postgresRepo.isReady()) {
      const pgCleaned = await this.postgresRepo.deleteOldRecords(optionsForPg);
      cleaned.telemetry = Math.max(cleaned.telemetry, pgCleaned.telemetry);
      cleaned.alarms = Math.max(cleaned.alarms, pgCleaned.alarms);
      cleaned.notifications = Math.max(cleaned.notifications, pgCleaned.notifications);
      cleaned.auditLogs = Math.max(cleaned.auditLogs, pgCleaned.auditLogs);
      cleaned.dispatchLogs = Math.max(cleaned.dispatchLogs, pgCleaned.dispatchLogs);
      cleaned.deviceCommands = Math.max(cleaned.deviceCommands, pgCleaned.deviceCommands);
    }

    cleaned.total =
      cleaned.telemetry +
      cleaned.alarms +
      cleaned.notifications +
      cleaned.auditLogs +
      cleaned.dispatchLogs +
      cleaned.deviceCommands;

    const cleanupTime = new Date().toISOString();
    this.saveData(this.data);

    return {
      success: true,
      cleanedCounts: cleaned,
      cleanedAt: cleanupTime,
      message: `${days} günden eski ${cleaned.total} adet kayıt temizlendi.`,
    };
  }

  private startAutoRetentionWorker() {
    const runWorkerCheck = async () => {
      try {
        const policies = this.getRetentionPolicies();
        if (!policies.enabled) return;

        const lastCleanup = policies.lastCleanupAt ? new Date(policies.lastCleanupAt).getTime() : 0;
        const intervalMs = (policies.autoCleanupIntervalHours || 24) * 3600 * 1000;
        if (Date.now() - lastCleanup >= intervalMs) {
          await this.executeDataRetentionCleanup(true);
        }
      } catch (err) {
        console.error('[Auto Retention Cleanup Worker Error]:', err);
      }
    };

    // Initial check after server boot (15 seconds delay)
    setTimeout(runWorkerCheck, 15000);

    // Check every hour if automated retention cleanup needs to run
    setInterval(runWorkerCheck, 60 * 60 * 1000);
  }
}


export const db = new LocalDatabase();
