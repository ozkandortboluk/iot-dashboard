import zlib from 'zlib';
import crypto from 'crypto';
import type {
  Device,
  ArchivedDevice,
  TelemetryCompressionStats,
  DiscoveredNetworkDevice,
  TelemetryReading,
  ThresholdRule,
  ActiveAlarm,
  Site,
  Zone,
  DeviceGroup,
  DeviceReplacementRecord,
  DeviceHealthSummary,
  DiscoveredDeviceLifecycleState,
  PairingMethod,
  PairingAuditRecord,
  CollisionCheckResult,
  PairDeviceRequest,
} from '../../types.js';
import { smartIntervalService } from '../services/smartInterval.service.js';
import { tenantSecurityService } from '../services/tenantSecurity.service.js';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

export function generateDeviceKeyDetails(providedKey?: string): {
  rawKey: string;
  prefix: string;
  hash: string;
} {
  const cleanKey = providedKey?.trim();
  const isValidProvided = Boolean(
    cleanKey &&
    cleanKey !== '__USE_CACHED_TOKEN__' &&
    cleanKey !== 'Yok' &&
    cleanKey !== 'undefined' &&
    cleanKey !== 'null' &&
    !cleanKey.includes('USE_CACHED') &&
    cleanKey.length >= 8
  );

  const rawKey = isValidProvided && cleanKey
    ? cleanKey
    : `nex_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(12).toString('hex')}`;
  const prefix = rawKey.substring(0, 12);
  const hash = hashApiKey(rawKey);
  return { rawKey, prefix, hash };
}

export class DeviceRepository {
  constructor(private db: any) {
    this.healExistingDeviceTokens();
  }

  public healExistingDeviceTokens(): void {
    if (!this.db?.data?.devices || !Array.isArray(this.db.data.devices)) return;
    let modified = false;
    for (const dev of this.db.data.devices) {
      if (dev.id === 'dev_test_01') {
        if (dev.apiKey !== 'dev_key_test_0000000000000000') {
          dev.apiKey = 'dev_key_test_0000000000000000';
          dev.apiKeyPrefix = 'dev_key_test';
          dev.apiKeyHash = hashApiKey(dev.apiKey);
          modified = true;
          this.db.postgresRepo?.saveDevice(dev).catch(() => {});
        }
      } else if (
        !dev.apiKey ||
        dev.apiKey === '__USE_CACHED_TOKEN__' ||
        dev.apiKey.includes('USE_CACHED') ||
        dev.apiKey === 'Yok' ||
        dev.apiKey === 'undefined' ||
        dev.apiKey === 'null'
      ) {
        const newKey = generateDeviceKeyDetails();
        dev.apiKey = newKey.rawKey;
        dev.apiKeyPrefix = newKey.prefix;
        dev.apiKeyHash = newKey.hash;
        modified = true;
        this.db.postgresRepo?.saveDevice(dev).catch(() => {});
      }
    }
    if (modified && typeof this.db.saveData === 'function') {
      this.db.saveData(this.db.data);
    }
  }

  public async checkDeviceStatuses(): Promise<boolean> {
    const now = Date.now();
    let hasChanges = false;
    for (const dev of this.db.data.devices) {
      const prevStatus = dev.status;
      const evalResult = smartIntervalService.evaluateDeviceWatchdog(dev, now);
      if (evalResult.changed) {
        hasChanges = true;
      }

      // Cihazın çevrimdışından tekrar çevrimiçiye dönüşü (Recovery)
      if (evalResult.newStatus === 'online' && dev.lastOfflineNotifiedAt) {
        this.db.addAuditLog(
          dev.tenantId || 'system',
          'Sistem Sinyal Takibi',
          `Cihaz Yeniden Çevrimiçi: ${dev.name} (IP: ${dev.ipAddress || 'Bilinmiyor'}) sinyal/veri akışını yeniden sağladı.`,
          'low'
        );
        this.db.addNotification({
          tenantId: dev.tenantId || 'usr_admin',
          title: `Cihaz Yeniden Çevrimiçi`,
          message: `${dev.name} cihazı bağlantıyı yeniden sağladı ve sistem durumu normale döndü.`,
          severity: 'info',
          deviceId: dev.id,
          deviceName: dev.name,
        });
        dev.lastOfflineNotifiedAt = undefined;
        hasChanges = true;
      }

      // Ağ gecikmesi/jitter toleransı aşılmış, doğrulanmış çevrimdışı bildirimi (Sadece BİR KERE)
      if (evalResult.newStatus === 'offline' && evalResult.isConfirmedOffline) {
        if (!dev.lastOfflineNotifiedAt) {
          dev.lastOfflineNotifiedAt = new Date(now).toISOString();
          hasChanges = true;

          const timeoutSec = evalResult.timeoutSeconds;
          const timeFormatted = timeoutSec >= 3600 
            ? `${(timeoutSec / 3600).toFixed(1).replace('.0', '')} saattir` 
            : timeoutSec >= 60 
              ? `${Math.round(timeoutSec / 60)} dakikadır`
              : `${timeoutSec} saniyedir`;

          this.db.addAuditLog(
            dev.tenantId || 'system',
            'Sistem Sinyal Takibi',
            `Cihaz Sinyal Kesintisi: ${dev.name} (IP: ${dev.ipAddress || 'Bilinmiyor'}) veri gönderim sıklığının 2 katı sürede (${timeFormatted}) sinyal göndermedi. Otomatik ÇEVRİMDİŞİ yapıldı.`,
            'high'
          );

          this.db.addNotification({
            tenantId: dev.tenantId || 'usr_admin',
            title: `Cihaz Çevrimdışı (Sinyal Kesintisi)`,
            message: `${dev.name} cihazından veri gönderim sıklığının 2 katı sürede (${timeFormatted}) sinyal/veri alınamadı. Otomatik olarak ÇEVRİMDİŞİ durumuna geçti. Yeni veri/ping geldiğinde otomatik çevrimiçi olacaktır.`,
            severity: 'critical',
            deviceId: dev.id,
            deviceName: dev.name,
          });
        }
      }
    }

    if (hasChanges) {
      this.db.saveData(this.db.data);
      for (const dev of this.db.data.devices) {
        if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }
      }
    }
    return hasChanges;
  }

  public getUserTenants(userId: string): string[] {
    return (this.db.data.tenantMemberships || [])
      .filter((m: any) => m.tenantId === userId || m.userId === userId || m.memberId === userId)
      .map((m: any) => m.tenantId);
  }

  public getDevices(requestingUserId?: string, targetCustomerId?: string): Device[] {
    this.checkDeviceStatuses();
    let list: Device[] = this.db.data.devices || [];
    const users = this.db.data.users || [];
    const reqUser = users.find((u: any) => u.id === requestingUserId);

    if (reqUser && (reqUser.role === 'admin' || reqUser.id === 'usr_admin' || reqUser.id === 'admin')) {
      if (targetCustomerId && targetCustomerId !== 'all') {
        const targetUser = users.find((u: any) => u.id === targetCustomerId);
        const isTargetAdmin = targetCustomerId === 'usr_admin' || targetCustomerId === 'admin' || (targetUser && targetUser.role === 'admin') || targetCustomerId === reqUser.id;
        
        if (isTargetAdmin) {
          const adminIds = new Set(
            users.filter((u: any) => u.role === 'admin' || u.id === 'usr_admin' || u.id === 'admin').map((u: any) => u.id)
          );
          adminIds.add('usr_admin');
          adminIds.add('admin');
          adminIds.add(reqUser.id);
          if (targetCustomerId) adminIds.add(targetCustomerId);

          list = list.filter((d) => !d.tenantId || adminIds.has(d.tenantId));
        } else {
          list = list.filter((d) => d.tenantId === targetCustomerId || (d as any).customerId === targetCustomerId);
        }
      }
    } else if (requestingUserId) {
      list = tenantSecurityService.filterDevicesForUser(
        reqUser || { id: requestingUserId, role: 'operator' },
        list,
        this.db.data.tenantMemberships || []
      );
    }

    const statusPriority: Record<string, number> = {
      online: 1,
      warning: 2,
      degraded: 2,
      maintenance: 3,
      offline: 4,
    };

    return [...list].sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      const tsA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const tsB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return tsB - tsA;
    });
  }

  public async assignDeviceOwner(
    deviceId: string,
    targetTenantId: string,
    adminUserId = 'system',
    adminUserName = 'Yönetici'
  ): Promise<Device | undefined> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) return undefined;

    const resolved = tenantSecurityService.validateAndResolveDeviceOwnership(
      targetTenantId,
      { id: adminUserId, role: 'admin' },
      this.db.data.users || []
    );

    const oldOwnerId = dev.tenantId || 'usr_admin';
    const oldOwner = this.db.data.users?.find((u: any) => u.id === oldOwnerId);
    const newOwner = this.db.data.users?.find((u: any) => u.id === resolved.canonicalTenantId);

    dev.tenantId = resolved.canonicalTenantId;
    dev.userId = resolved.canonicalTenantId;

    this.db.saveData(this.db.data);
    this.db.addAuditLog(
      adminUserId,
      adminUserName,
      `Cihaz Sahipliği Devredildi: "${dev.name}" -> ${newOwner ? newOwner.name : 'Sistem Yöneticisi'} (${resolved.canonicalTenantId}) [Önceki Sahip: ${oldOwner ? oldOwner.name : oldOwnerId}]`,
      'medium'
    );
    this.db.postgresRepo?.saveDevice(dev).catch((err: any) => {
      console.warn('[Postgres saveDevice on assignDeviceOwner]:', err?.message || err);
    });
    return dev;
  }

  public getDeviceByApiKey(apiKey: string): Device | undefined {
    const token = (apiKey || '').trim();
    if (!token) return undefined;

    const tokenHash = hashApiKey(token);

    return this.db.data.devices.find((d: Device) => {
      if (d.apiKeyHash && d.apiKeyHash === tokenHash) return true;
      if (!d.apiKeyHash && d.apiKey && d.apiKey === token) return true;
      return false;
    });
  }

  public async createDevice(deviceData: Omit<Device, 'id' | 'apiKey' | 'lastSeen'> & { id?: string; apiKey?: string; isSimulated?: boolean; saveSimulatedDataToDb?: boolean }): Promise<Device> {
    let newId = (deviceData.id && deviceData.id.trim()) ? deviceData.id.trim() : `dev_${Date.now()}`;
    
    // Auto-recovery of historical data by MAC Address
    if (deviceData.macAddress && this.db.data.archivedDevices) {
      const archived = this.db.data.archivedDevices.find((a: any) => 
        a.macAddress && a.macAddress.toLowerCase() === deviceData.macAddress!.toLowerCase()
      );
      if (archived && archived.id) {
        newId = archived.id; // Reuse the old ID to link all historical telemetry!
        // Optionally remove from archived list? Let's just leave it or remove it.
        this.db.data.archivedDevices = this.db.data.archivedDevices.filter((a: any) => a.id !== newId);
        
        this.db.addAuditLog('system', 'API Manager', `Cihaz MAC eşleşmesiyle geçmiş verilerine bağlandı: ${deviceData.macAddress}`, 'info');
      }
    }

    // 1. Resolve Device Token: Check if request has an explicit valid key
    let resolvedApiKey: string | undefined = deviceData.apiKey?.trim();
    if (
      !resolvedApiKey ||
      resolvedApiKey === '__USE_CACHED_TOKEN__' ||
      resolvedApiKey.includes('USE_CACHED') ||
      resolvedApiKey === 'Yok' ||
      resolvedApiKey === 'undefined' ||
      resolvedApiKey === 'null'
    ) {
      resolvedApiKey = undefined;
    }

    // 2. If no valid key was provided directly, attempt to recover the token the field device sent during discovery/unregistered packets
    if (!resolvedApiKey) {
      const cleanDevMac = deviceData.macAddress?.replace(/[:-]/g, '').toLowerCase();
      const unreg = (this.db.data.unregisteredDevices || []).find((d: any) => {
        const cleanUnregMac = d.mac?.replace(/[:-]/g, '').toLowerCase();
        const macMatch = cleanDevMac && cleanUnregMac && cleanDevMac === cleanUnregMac;
        const ipMatch = deviceData.ipAddress && d.ip && d.ip === deviceData.ipAddress;
        const nameMatch = deviceData.name && (d.hostname === deviceData.name || d.name === deviceData.name);
        return macMatch || ipMatch || nameMatch;
      });

      if (unreg && unreg.tokenProvided && typeof unreg.tokenProvided === 'string') {
        const candidate = unreg.tokenProvided.trim();
        if (
          candidate !== 'Yok' &&
          candidate !== '__USE_CACHED_TOKEN__' &&
          !candidate.includes('USE_CACHED') &&
          candidate !== 'undefined' &&
          candidate !== 'null' &&
          candidate.length >= 8
        ) {
          resolvedApiKey = candidate;
          this.db.addAuditLog('system', 'Eşleştirme', `Cihazın (${deviceData.name}) gönderdiği donanım tokeni (${candidate.substring(0, 8)}...) başarıyla kaydedildi.`, 'info');
        }
      }
    }

    // Validate that if a custom apiKey was provided or recovered, it doesn't collide with an existing device
    if (resolvedApiKey) {
      const existingKeyDev = this.getDeviceByApiKey(resolvedApiKey);
      if (existingKeyDev && existingKeyDev.id !== newId) {
        throw new Error(`Bu API Anahtarı zaten başka bir cihaz tarafından kullanılıyor (${existingKeyDev.name})`);
      }
    }

    let keyDetails = generateDeviceKeyDetails(resolvedApiKey);
    if (!resolvedApiKey) {
      let attempts = 0;
      while (this.getDeviceByApiKey(keyDetails.rawKey) && attempts < 5) {
        keyDetails = generateDeviceKeyDetails();
        attempts++;
      }
    }
    const isSimulated = deviceData.isSimulated ?? false;
    const saveSimulatedDataToDb = deviceData.saveSimulatedDataToDb ?? false;

    let name = (deviceData.name || '').trim();
    if (isSimulated && !name.includes('[Sanal]') && !name.includes('(Sanal)')) {
      name = `[Sanal] ${name}`;
    }

    const expInterval = deviceData.expectedIntervalSeconds && deviceData.expectedIntervalSeconds > 0
      ? deviceData.expectedIntervalSeconds
      : (deviceData.customIntervalSeconds && deviceData.customIntervalSeconds > 0 ? deviceData.customIntervalSeconds : 30);
    const calculated = smartIntervalService.calculateDeviceTimeouts({
      expectedIntervalSeconds: expInterval,
      customIntervalSeconds: deviceData.customIntervalSeconds,
      intervalMode: deviceData.intervalMode || 'auto',
    });

    // Kanonik Tenant / Müşteri Sahipliği Doğrulaması
    const resolvedOwnership = tenantSecurityService.validateAndResolveDeviceOwnership(
      deviceData.tenantId,
      undefined,
      this.db.data.users || []
    );
    const canonicalTenantId = resolvedOwnership.canonicalTenantId;

    const newDevice: Device = {
      ...deviceData,
      tenantId: canonicalTenantId,
      userId: canonicalTenantId,
      name,
      isSimulated,
      saveSimulatedDataToDb,
      id: newId,
      apiKey: keyDetails.rawKey,
      apiKeyPrefix: keyDetails.prefix,
      apiKeyHash: keyDetails.hash,
      expectedIntervalSeconds: calculated.expectedIntervalSeconds,
      autoDetectedIntervalSeconds: calculated.expectedIntervalSeconds,
      heartbeatTimeoutSeconds: calculated.heartbeatTimeoutSeconds,
      intervalMode: calculated.intervalMode,
      customIntervalSeconds: deviceData.customIntervalSeconds,
      recentIntervals: [],
      dataFlowActive: deviceData.dataFlowActive !== false,
      lastSeen: new Date().toISOString(),
    };

    if (!this.db.data.devices) this.db.data.devices = [];
    this.db.data.devices.push(newDevice);

    if (newDevice.ipAddress) this.removeUnregisteredDevice(newDevice.ipAddress);
    if (newDevice.macAddress) this.removeUnregisteredDevice(newDevice.macAddress);
    if (newDevice.name) this.removeUnregisteredDevice(newDevice.name);

    this.db.addAuditLog(
      canonicalTenantId,
      'Sistem',
      `Yeni Cihaz Eklendi: ${newDevice.name} (IP: ${newDevice.ipAddress || 'Bilinmiyor'}) [Sahip: ${canonicalTenantId}]`,
      'medium'
    );
    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(newDevice).catch((e) => console.warn('[PG Error]', e.message)); }

    return newDevice;
  }

  public async regenerateApiKey(deviceId: string): Promise<string> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    let keyDetails = generateDeviceKeyDetails();
    let attempts = 0;
    while (this.getDeviceByApiKey(keyDetails.rawKey) && attempts < 5) {
      keyDetails = generateDeviceKeyDetails();
      attempts++;
    }
    dev.previousApiKeyHash = dev.apiKeyHash;
    dev.apiKey = keyDetails.rawKey;
    dev.apiKeyPrefix = keyDetails.prefix;
    dev.apiKeyHash = keyDetails.hash;
    dev.apiKeyRotatedAt = new Date().toISOString();
    dev.apiKeyRevoked = false;

    this.db.addAuditLog('system', 'API Manager', `Cihaz API Anahtarı Yenilendi: ${dev.name}`, 'high');
    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev.apiKey;
  }

  public async rotateApiKey(
    deviceId: string,
    options?: { expiresDays?: number; scopes?: string[] }
  ): Promise<{ apiKey: string; prefix: string; expiresAt?: string; scopes: string[]; rotatedAt: string }> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    const keyDetails = generateDeviceKeyDetails();
    dev.previousApiKeyHash = dev.apiKeyHash;
    dev.apiKey = keyDetails.rawKey;
    dev.apiKeyPrefix = keyDetails.prefix;
    dev.apiKeyHash = keyDetails.hash;
    dev.apiKeyRotatedAt = new Date().toISOString();
    dev.apiKeyRevoked = false;

    if (options?.scopes && Array.isArray(options.scopes)) {
      dev.apiKeyScopes = options.scopes;
    } else if (!dev.apiKeyScopes || dev.apiKeyScopes.length === 0) {
      dev.apiKeyScopes = ['all'];
    }

    if (options?.expiresDays && options.expiresDays > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + options.expiresDays);
      dev.apiKeyExpiresAt = exp.toISOString();
    }

    this.db.addAuditLog('system', 'API Manager', `Cihaz API Anahtarı Rotasyonu Gerçekleştirildi: ${dev.name}`, 'high');
    this.db.saveData(this.db.data);

    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return {
      apiKey: dev.apiKey,
      prefix: dev.apiKeyPrefix,
      expiresAt: dev.apiKeyExpiresAt,
      scopes: dev.apiKeyScopes || ['all'],
      rotatedAt: dev.apiKeyRotatedAt,
    };
  }

  public async revokeApiKey(deviceId: string, reason = 'Manuel İptal'): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    dev.apiKeyRevoked = true;
    dev.websocketConnected = false;

    this.db.addAuditLog('system', 'API Manager', `Cihaz API Anahtarı İptal Edildi (Revoked): ${dev.name} (Neden: ${reason})`, 'high');
    this.db.saveData(this.db.data);

    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  public async restoreApiKey(deviceId: string): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    dev.apiKeyRevoked = false;

    this.db.addAuditLog('system', 'API Manager', `Cihaz API Anahtarı Yeniden Aktifleştirildi: ${dev.name}`, 'medium');
    this.db.saveData(this.db.data);

    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  public async updateApiKeySettings(
    deviceId: string,
    settings: { scopes?: string[]; expiresAt?: string }
  ): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    if (settings.scopes !== undefined) {
      dev.apiKeyScopes = settings.scopes;
    }
    if (settings.expiresAt !== undefined) {
      dev.apiKeyExpiresAt = settings.expiresAt;
    }

    this.db.addAuditLog('system', 'API Manager', `Cihaz API İzinleri ve Süresi Güncellendi: ${dev.name}`, 'medium');
    this.db.saveData(this.db.data);

    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  public async convertToPhysicalDevice(deviceId: string, adminUserId: string = 'system', adminUserName: string = 'System'): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');
    if (!dev.isSimulated) throw new Error('Bu cihaz zaten fiziksel bir donanımdır.');

    dev.isSimulated = false;
    dev.saveSimulatedDataToDb = false;
    dev.simulatedMetrics = [];

    if (dev.name.includes('[Sanal]')) {
      dev.name = dev.name.replace(/\[Sanal\]\s*/gi, '').trim();
    } else if (dev.name.includes('(Sanal)')) {
      dev.name = dev.name.replace(/\(Sanal\)\s*/gi, '').trim();
    }

    dev.metrics = {};

    const keyDetails = generateDeviceKeyDetails();
    dev.apiKey = keyDetails.rawKey;
    dev.apiKeyPrefix = keyDetails.prefix;
    dev.apiKeyHash = keyDetails.hash;

    this.db.addAuditLog(adminUserId, adminUserName, `Sanal Cihaz Fiziksel Donanıma Dönüştürüldü (Yeni API Anahtarı Atandı): ${dev.name}`, 'high');
    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  public async updateDevice(deviceId: string, updates: Partial<Device>): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    const configKeys: (keyof Device)[] = [
      'name',
      'type',
      'location',
      'tenantId',
      'rateLimitPerMin',
      'encryptionMethod',
      'heartbeatTimeoutSeconds',
      'expectedIntervalSeconds',
      'intervalMode',
      'customIntervalSeconds',
      'autoDetectedIntervalSeconds',
      'isSimulated',
      'saveSimulatedDataToDb',
      'simulatedMetrics',
    ];
    const isConfigUpdated = configKeys.some((k) => updates[k] !== undefined);

    if (updates.name !== undefined) dev.name = updates.name;
    if (updates.type !== undefined) dev.type = updates.type;
    if (updates.deviceType !== undefined) dev.deviceType = updates.deviceType;
    if (updates.roleKey !== undefined) dev.roleKey = updates.roleKey;
    if (updates.hardwareModel !== undefined) dev.hardwareModel = updates.hardwareModel;
    if (updates.firmwareVersion !== undefined) dev.firmwareVersion = updates.firmwareVersion;
    if (updates.otaStatus !== undefined) dev.otaStatus = updates.otaStatus ? (String(updates.otaStatus).toUpperCase() as any) : 'IDLE';
    if (updates.otaTargetFirmwareId !== undefined) dev.otaTargetFirmwareId = updates.otaTargetFirmwareId;
    if (updates.otaProgress !== undefined) dev.otaProgress = updates.otaProgress;
    if (updates.otaErrorMessage !== undefined) dev.otaErrorMessage = updates.otaErrorMessage;
    if (updates.otaLastCheckAt !== undefined) dev.otaLastCheckAt = updates.otaLastCheckAt;
    if (updates.outputDefinitions !== undefined) dev.outputDefinitions = updates.outputDefinitions;
    if (updates.capabilities !== undefined) dev.capabilities = updates.capabilities;
    if (updates.websocketConnected !== undefined) dev.websocketConnected = updates.websocketConnected;
    if (updates.lastMessageAt !== undefined) dev.lastMessageAt = updates.lastMessageAt;
    if (updates.location !== undefined) dev.location = updates.location;
    if (updates.ipAddress !== undefined) dev.ipAddress = updates.ipAddress;
    if (updates.macAddress !== undefined) dev.macAddress = updates.macAddress;
    const targetTenantId = updates.tenantId !== undefined ? updates.tenantId : (updates as any).userId;
    if (targetTenantId !== undefined) {
      if (dev.tenantId !== targetTenantId) {
        this.db.addAuditLog('system', 'Yönetici', `Cihaz Sorumlu Müşteri/Firma Değiştirildi: ${dev.name} -> ${targetTenantId}`, 'medium');
      }
      dev.tenantId = targetTenantId;
    }
    if (updates.rateLimitPerMin !== undefined) dev.rateLimitPerMin = updates.rateLimitPerMin;
    if (updates.encryptionMethod !== undefined) dev.encryptionMethod = updates.encryptionMethod;
    if (updates.heartbeatTimeoutSeconds !== undefined) {
      dev.heartbeatTimeoutSeconds = updates.heartbeatTimeoutSeconds;
      dev.customHeartbeatTimeoutSeconds = updates.heartbeatTimeoutSeconds;
    }
    if (updates.customHeartbeatTimeoutSeconds !== undefined) dev.customHeartbeatTimeoutSeconds = updates.customHeartbeatTimeoutSeconds;
    if (updates.intervalMode !== undefined) dev.intervalMode = updates.intervalMode;
    if (updates.customIntervalSeconds !== undefined) dev.customIntervalSeconds = updates.customIntervalSeconds;
    if (updates.autoDetectedIntervalSeconds !== undefined) dev.autoDetectedIntervalSeconds = updates.autoDetectedIntervalSeconds;
    if (updates.expectedIntervalSeconds !== undefined) {
      dev.expectedIntervalSeconds = updates.expectedIntervalSeconds;
      if (updates.intervalMode === 'manual' || updates.intervalMode === undefined) {
        dev.customIntervalSeconds = updates.expectedIntervalSeconds;
        dev.intervalMode = 'manual';
      }
    }
    // Calculate and enforce consistent 2x timeouts
    const timeouts = smartIntervalService.calculateDeviceTimeouts(dev);
    dev.expectedIntervalSeconds = timeouts.expectedIntervalSeconds;
    dev.heartbeatTimeoutSeconds = timeouts.heartbeatTimeoutSeconds;
    const wasSimulated = dev.isSimulated;
    if (updates.isSimulated !== undefined) dev.isSimulated = updates.isSimulated;
    if (updates.saveSimulatedDataToDb !== undefined) dev.saveSimulatedDataToDb = updates.saveSimulatedDataToDb;
    if (updates.simulatedMetrics !== undefined) dev.simulatedMetrics = updates.simulatedMetrics;
    
    // If device was simulated and is explicitly converted to physical, clean up tags and regenerate physical key
    if (wasSimulated && updates.isSimulated === false) {
      dev.saveSimulatedDataToDb = false;
      dev.simulatedMetrics = [];
      if (dev.name.includes('[Sanal]')) {
        dev.name = dev.name.replace(/\[Sanal\]\s*/gi, '').trim();
      } else if (dev.name.includes('(Sanal)')) {
        dev.name = dev.name.replace(/\(Sanal\)\s*/gi, '').trim();
      }
      dev.metrics = {};
      if (!updates.apiKey || !updates.apiKey.trim()) {
        const keyDetails = generateDeviceKeyDetails();
        dev.apiKey = keyDetails.rawKey;
        dev.apiKeyPrefix = keyDetails.prefix;
        dev.apiKeyHash = keyDetails.hash;
      }
      this.db.addAuditLog('system', 'Yönetici', `Sanal Cihaz Fiziksel Donanıma Dönüştürüldü (Yeni API Anahtarı Atandı): ${dev.name}`, 'high');
    }

    if (updates.metrics !== undefined) {
      dev.metrics = {
        ...(dev.metrics || {}),
        ...updates.metrics,
      };
    }
    if (updates.lastSeen !== undefined) dev.lastSeen = updates.lastSeen;

    if (updates.apiKey !== undefined && updates.apiKey.trim()) {
      const rawKey = updates.apiKey.trim();
      const existingKeyDev = this.getDeviceByApiKey(rawKey);
      if (existingKeyDev && existingKeyDev.id !== deviceId) {
        throw new Error(`Bu API Anahtarı zaten başka bir cihaz tarafından kullanılıyor (${existingKeyDev.name})`);
      }
      const keyDetails = generateDeviceKeyDetails(rawKey);
      dev.apiKey = keyDetails.rawKey;
      dev.apiKeyPrefix = keyDetails.prefix;
      dev.apiKeyHash = keyDetails.hash;
      this.db.addAuditLog('system', 'API Manager', `Cihaz Manuel Token / API Key Güncellendi: ${dev.name}`, 'high');
    }

    if (updates.dataFlowActive !== undefined) {
      dev.dataFlowActive = updates.dataFlowActive;
      if (updates.dataFlowActive === true) {
        dev.lastSeen = new Date().toISOString();
        dev.status = 'online';
      } else {
        dev.status = 'offline';
      }
    }

    if (updates.status !== undefined) {
      dev.status = updates.status;
      if (updates.status === 'online') {
        dev.lastSeen = new Date().toISOString();
      }
    }

    if (isConfigUpdated) {
      this.db.addAuditLog('system', 'API Manager', `Cihaz Ayarları Güncellendi: ${dev.name}`, 'medium');
    }

    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  public async purgeDeviceDataPermanently(deviceIds: string[]): Promise<void> {
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return;
    const idsSet = new Set(deviceIds);

    // 1. Remove from active devices if any exist
    if (this.db.data.devices) {
      this.db.data.devices = this.db.data.devices.filter((d: Device) => !idsSet.has(d.id));
    }

    // 2. Remove telemetry from memory
    if (this.db.data.telemetry) {
      this.db.data.telemetry = this.db.data.telemetry.filter((t: any) => !idsSet.has(t.deviceId));
    }

    // 3. Remove history cache
    if (this.db.data.history) {
      for (const id of deviceIds) {
        delete this.db.data.history[id];
      }
    }

    // 4. Remove latest telemetry cache
    if (this.db.telemetryRepository?.latestTelemetryCache) {
      for (const id of deviceIds) {
        delete this.db.telemetryRepository.latestTelemetryCache[id];
      }
    }

    // 5. Remove threshold rules specifically configured for these devices
    if (this.db.data.rules) {
      this.db.data.rules = this.db.data.rules.filter((r: any) => !idsSet.has(r.deviceId));
    }

    // 6. Remove active alarms for these devices
    if (this.db.data.activeAlarms) {
      this.db.data.activeAlarms = this.db.data.activeAlarms.filter((a: any) => !idsSet.has(a.deviceId));
    }

    // 7. Remove alarm events for these devices
    if (this.db.data.alarmEvents) {
      this.db.data.alarmEvents = this.db.data.alarmEvents.filter((e: any) => !idsSet.has(e.deviceId));
    }

    // 8. Remove notifications for these devices
    if (this.db.data.notifications) {
      this.db.data.notifications = this.db.data.notifications.filter((n: any) => !idsSet.has(n.deviceId));
    }

    // 9. Remove commands for these devices
    if (this.db.data.commands) {
      this.db.data.commands = this.db.data.commands.filter((c: any) => !idsSet.has(c.deviceId));
    }

    // 10. Purge from PostgreSQL if connected
    if (this.db.postgresRepo?.isReady()) {
      await this.db.postgresRepo.permanentlyPurgeDevices(deviceIds).catch((e: any) =>
        console.warn('[PostgreSQL Permanent Purge Error]:', e.message)
      );
    }
  }

  private async createArchivedRecord(
    device: Device,
    deletedBy?: string,
    deletedByName?: string,
    deleteReason?: string
  ): Promise<ArchivedDevice> {
    const now = new Date().toISOString();

    // 1. Gather historical telemetry for this device from all layers
    const rawReadings: any[] = [];
    try {
      const memReadings = (this.db.data.telemetry || []).filter((t: any) => t.deviceId === device.id);
      rawReadings.push(...memReadings);

      if (this.db.telemetryRepository) {
        const repoReadings = this.db.telemetryRepository.getTelemetry(device.id, undefined, 2000) || [];
        const existingIds = new Set(rawReadings.map((r: any) => r.id));
        for (const rr of repoReadings) {
          if (rr && !existingIds.has(rr.id)) {
            rawReadings.push(rr);
            existingIds.add(rr.id);
          }
        }
      }

      if (this.db.postgresRepo?.isReady()) {
        const pgReadings = await this.db.postgresRepo.getTelemetryForDevice(device.id, 5000);
        if (Array.isArray(pgReadings) && pgReadings.length > 0) {
          const existingIds = new Set(rawReadings.map((r: any) => r.id));
          for (const pr of pgReadings) {
            if (pr && !existingIds.has(pr.id)) {
              rawReadings.push(pr);
              existingIds.add(pr.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Archive] Could not collect telemetry readings for compression:', e);
    }

    // 2. Compress telemetry payload with Gzip
    const jsonStr = JSON.stringify(rawReadings);
    const rawSizeBytes = Buffer.byteLength(jsonStr, 'utf8');
    let compressedBase64 = '';
    let compressedSizeBytes = 0;
    let ratioPercent = 0;

    try {
      const compressedBuffer = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });
      compressedBase64 = compressedBuffer.toString('base64');
      compressedSizeBytes = compressedBuffer.length;
      ratioPercent = rawSizeBytes > 0 ? Math.max(0, Math.round(((rawSizeBytes - compressedSizeBytes) / rawSizeBytes) * 100)) : 0;
    } catch (err) {
      console.warn('[Archive] Gzip compression fallback:', err);
      compressedBase64 = Buffer.from(jsonStr).toString('base64');
      compressedSizeBytes = Buffer.byteLength(compressedBase64, 'utf8');
    }

    const stats: TelemetryCompressionStats = {
      originalPointsCount: rawReadings.length,
      compressedPointsCount: rawReadings.length,
      rawSizeBytes,
      compressedSizeBytes,
      compressionRatioPercent: ratioPercent,
      algorithm: 'gzip-base64',
      compressedAt: now,
    };

    // 3. Metric History & Latest Telemetry snapshot
    const metricHistory = this.db.data.history?.[device.id]
      ? JSON.parse(JSON.stringify(this.db.data.history[device.id]))
      : undefined;
    const latestTelemetry = this.db.telemetryRepository?.latestTelemetryCache?.[device.id]
      ? JSON.parse(JSON.stringify(this.db.telemetryRepository.latestTelemetryCache[device.id]))
      : undefined;

    // 4. Gather Alarms, Rules, Events, Notifications & Commands
    const deviceRules = (this.db.data.rules || []).filter((r: any) => r.deviceId === device.id);
    if (this.db.postgresRepo?.isReady()) {
      const pgRules = await this.db.postgresRepo.getRulesForDevice(device.id);
      const ruleIds = new Set(deviceRules.map((r: any) => r.id));
      for (const pr of pgRules) {
        if (!ruleIds.has(pr.id)) {
          deviceRules.push(pr);
          ruleIds.add(pr.id);
        }
      }
    }

    const deviceAlarms = (this.db.data.activeAlarms || []).filter((a: any) => a.deviceId === device.id);
    if (this.db.postgresRepo?.isReady()) {
      const pgAlarms = await this.db.postgresRepo.getAlarmsForDevice(device.id);
      const alarmIds = new Set(deviceAlarms.map((a: any) => a.id));
      for (const pa of pgAlarms) {
        if (!alarmIds.has(pa.id)) {
          deviceAlarms.push(pa);
          alarmIds.add(pa.id);
        }
      }
    }

    const deviceAlarmEvents = (this.db.data.alarmEvents || []).filter((e: any) => e.deviceId === device.id);
    const deviceNotifications = (this.db.data.notifications || []).filter((n: any) => n.deviceId === device.id);
    const deviceCommands = (this.db.data.commands || []).filter((c: any) => c.deviceId === device.id);

    const archivedRecord: ArchivedDevice = {
      id: device.id,
      device: { ...device, deletedAt: now },
      deletedAt: now,
      deletedBy: deletedBy || 'system',
      deletedByName: deletedByName || 'Yönetici',
      deleteReason: deleteReason || 'Kullanıcı veya Sistem Tarafından Silindi',
      tenantId: device.tenantId || 'usr_admin',
      telemetrySnapshot: {
        stats,
        compressedData: compressedBase64,
        recentReadings: rawReadings.slice(0, 50),
      },
      preservedSettings: {
        name: device.name,
        apiKey: device.apiKey,
        apiKeyScopes: device.apiKeyScopes,
        type: device.type,
        deviceType: device.deviceType,
        roleKey: device.roleKey,
        hardwareModel: device.hardwareModel,
        hardwareRevision: device.hardwareRevision,
        firmwareVersion: device.firmwareVersion,
        outputDefinitions: device.outputDefinitions,
        metrics: device.metrics,
        tags: device.tags,
        siteId: device.siteId,
        zoneId: device.zoneId,
        groupId: device.groupId,
        location: device.location,
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        rateLimitPerMin: device.rateLimitPerMin,
        encryptionMethod: device.encryptionMethod,
        heartbeatTimeoutSeconds: device.heartbeatTimeoutSeconds,
        expectedIntervalSeconds: device.expectedIntervalSeconds,
        intervalMode: device.intervalMode,
        customIntervalSeconds: device.customIntervalSeconds,
        customHeartbeatTimeoutSeconds: device.customHeartbeatTimeoutSeconds,
        maintenanceMode: device.maintenanceMode,
        maintenanceReason: device.maintenanceReason,
        maintenanceUntil: device.maintenanceUntil,
        replacementHistory: device.replacementHistory,
        powerSource: device.powerSource,
        batteryLevel: device.batteryLevel,
        isSimulated: device.isSimulated,
        saveSimulatedDataToDb: device.saveSimulatedDataToDb,
        simulatedMetrics: device.simulatedMetrics,
        capabilities: device.capabilities,
        otaStatus: device.otaStatus,
        otaTargetFirmwareId: device.otaTargetFirmwareId,
      },
      metricHistory,
      latestTelemetry,
      archivedRules: deviceRules,
      archivedAlarms: deviceAlarms,
      archivedAlarmEvents: deviceAlarmEvents,
      archivedNotifications: deviceNotifications,
      archivedCommands: deviceCommands,
    };

    return archivedRecord;
  }

  public async deleteDevice(
    deviceId: string,
    requestingUser?: { id: string; role: string; name?: string }
  ): Promise<void> {
    const index = this.db.data.devices.findIndex((d: Device) => d.id === deviceId);
    if (index !== -1) {
      const removed = this.db.data.devices.splice(index, 1)[0];
      
      // Store in archivedDevices with compressed telemetry, metrics, rules & alarms
      if (!this.db.data.archivedDevices) this.db.data.archivedDevices = [];
      const archivedRecord = await this.createArchivedRecord(
        removed,
        requestingUser?.id,
        requestingUser?.name,
        'Cihaz Yönetim Ekranından Silindi'
      );
      this.db.data.archivedDevices = [
        archivedRecord,
        ...this.db.data.archivedDevices.filter((a: any) => (a.id || a.device?.id) !== removed.id),
      ];

      // Remove device-specific rules and active alarms from active pools while archived
      if (this.db.data.rules) {
        this.db.data.rules = this.db.data.rules.filter((r: any) => r.deviceId !== deviceId);
      }
      if (this.db.data.activeAlarms) {
        this.db.data.activeAlarms = this.db.data.activeAlarms.filter((a: any) => a.deviceId !== deviceId);
      }
      if (this.db.telemetryRepository?.latestTelemetryCache) {
        delete this.db.telemetryRepository.latestTelemetryCache[deviceId];
      }

      this.db.addAuditLog(
        requestingUser?.id || 'system',
        requestingUser?.name || 'API Manager',
        `Cihaz Arşive Taşındı & Silindi: ${removed.name} (ID: ${removed.id}, Ayarlar, metrikler ve alarmlar arşivlendi, Telemetri tasarrufu: ${archivedRecord.telemetrySnapshot?.stats.compressionRatioPercent || 0}%)`,
        'medium'
      );
      this.db.saveData(this.db.data);

      // In PostgreSQL: Remove device from active table only (telemetry and alarms remain safe for restore)
      if (this.db.postgresRepo?.isReady()) {
        await this.db.postgresRepo.deleteDevice(deviceId).catch((e: any) => console.warn('[PG Error]', e.message));
      }
    }
  }

  public async bulkDeleteDevices(deviceIds: string[], requestingUser?: { id: string; role: string; name?: string }): Promise<number> {
    if (!this.db.data.devices || !deviceIds.length) return 0;
    const idsSet = new Set(deviceIds);
    const removedIds: string[] = [];

    if (!this.db.data.archivedDevices) this.db.data.archivedDevices = [];
    const devicesToArchive: Device[] = [];

    this.db.data.devices = this.db.data.devices.filter((d: Device) => {
      if (idsSet.has(d.id)) {
        if (!requestingUser || requestingUser.role === 'admin' || d.tenantId === requestingUser.id || d.userId === requestingUser.id) {
          devicesToArchive.push(d);
          removedIds.push(d.id);
          return false;
        }
      }
      return true;
    });

    const newArchivedRecords: ArchivedDevice[] = [];
    for (const d of devicesToArchive) {
      const archivedRecord = await this.createArchivedRecord(
        d,
        requestingUser?.id,
        requestingUser?.name,
        'Toplu Cihaz Silme İşlemi'
      );
      newArchivedRecords.push(archivedRecord);
    }

    if (removedIds.length > 0) {
      const removedIdSet = new Set(removedIds);
      this.db.data.archivedDevices = [
        ...newArchivedRecords,
        ...this.db.data.archivedDevices.filter((a: any) => !removedIdSet.has(a.id || a.device?.id)),
      ];

      // Remove device-specific rules and active alarms from active pools while archived
      if (this.db.data.rules) {
        this.db.data.rules = this.db.data.rules.filter((r: any) => !removedIdSet.has(r.deviceId));
      }
      if (this.db.data.activeAlarms) {
        this.db.data.activeAlarms = this.db.data.activeAlarms.filter((a: any) => !removedIdSet.has(a.deviceId));
      }
      if (this.db.telemetryRepository?.latestTelemetryCache) {
        for (const id of removedIds) {
          delete this.db.telemetryRepository.latestTelemetryCache[id];
        }
      }

      const userName = requestingUser?.name || requestingUser?.id || 'API Manager';
      this.db.addAuditLog(
        requestingUser?.id || 'system',
        userName,
        `Toplu Cihaz Arşive Taşındı & Silindi: ${removedIds.length} adet cihaz ayarları, metrikleri ve alarmlarıyla arşivlendi`,
        'high'
      );
      this.db.saveData(this.db.data);

      // In PostgreSQL: Remove devices from active table only (telemetry and alarms remain safe for restore)
      if (this.db.postgresRepo?.isReady()) {
        await this.db.postgresRepo.removeDevicesFromActiveTable(removedIds).catch((e: any) => console.warn('[PG Error]', e.message));
      }
    }
    return removedIds.length;
  }

  public getArchivedDevices(requestingUserId?: string, targetTenantId?: string): ArchivedDevice[] {
    const list: any[] = this.db.data.archivedDevices || [];
    
    // Normalize older archive entries that might just be Device objects
    const normalized: ArchivedDevice[] = list.map((item: any) => {
      if (item.device && item.preservedSettings) {
        return {
          ...item,
          metricHistory: item.metricHistory,
          latestTelemetry: item.latestTelemetry,
          archivedRules: item.archivedRules || [],
          archivedAlarms: item.archivedAlarms || [],
          archivedAlarmEvents: item.archivedAlarmEvents || [],
          archivedNotifications: item.archivedNotifications || [],
          archivedCommands: item.archivedCommands || [],
        } as ArchivedDevice;
      }
      // Convert legacy raw Device into ArchivedDevice
      const dev: Device = item.device || item;
      return {
        id: dev.id,
        device: dev,
        deletedAt: dev.deletedAt || item.deletedAt || new Date().toISOString(),
        deletedBy: item.deletedBy || 'system',
        deletedByName: item.deletedByName || 'Sistem',
        deleteReason: item.deleteReason || 'Silindi',
        tenantId: dev.tenantId || 'usr_admin',
        preservedSettings: item.preservedSettings || {
          name: dev.name,
          apiKey: dev.apiKey,
          apiKeyScopes: dev.apiKeyScopes,
          type: dev.type,
          roleKey: dev.roleKey,
          hardwareModel: dev.hardwareModel,
          firmwareVersion: dev.firmwareVersion,
          outputDefinitions: dev.outputDefinitions,
          metrics: dev.metrics,
          tags: dev.tags,
          siteId: dev.siteId,
          zoneId: dev.zoneId,
          groupId: dev.groupId,
          location: dev.location,
          ipAddress: dev.ipAddress,
          macAddress: dev.macAddress,
          rateLimitPerMin: dev.rateLimitPerMin,
          encryptionMethod: dev.encryptionMethod,
        },
        telemetrySnapshot: item.telemetrySnapshot || {
          stats: {
            originalPointsCount: 0,
            compressedPointsCount: 0,
            rawSizeBytes: 0,
            compressedSizeBytes: 0,
            compressionRatioPercent: 0,
            algorithm: 'gzip-base64',
            compressedAt: dev.deletedAt || new Date().toISOString(),
          },
          compressedData: '',
          recentReadings: [],
        },
        metricHistory: item.metricHistory,
        latestTelemetry: item.latestTelemetry,
        archivedRules: item.archivedRules || [],
        archivedAlarms: item.archivedAlarms || [],
        archivedAlarmEvents: item.archivedAlarmEvents || [],
        archivedNotifications: item.archivedNotifications || [],
        archivedCommands: item.archivedCommands || [],
      };
    });

    let isAdmin = !requestingUserId || requestingUserId === 'usr_admin';
    if (requestingUserId) {
      const user = this.db.data.users?.find((u: any) => u.id === requestingUserId);
      if (user?.role === 'admin') isAdmin = true;
    }

    let filtered = normalized;
    if (!isAdmin) {
      const allowedTenants = requestingUserId ? this.getUserTenants(requestingUserId) : [];
      filtered = normalized.filter((a) => allowedTenants.includes(a.tenantId));
    } else if (targetTenantId && targetTenantId !== 'all') {
      filtered = normalized.filter((a) => a.tenantId === targetTenantId);
    }

    const sorted = filtered.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
    const dedupedMap = new Map<string, ArchivedDevice>();
    for (const item of sorted) {
      if (!dedupedMap.has(item.id)) {
        dedupedMap.set(item.id, item);
      }
    }
    return Array.from(dedupedMap.values());
  }

  public getArchivedDeviceById(deviceId: string, requestingUserId?: string): ArchivedDevice | null {
    const all = this.getArchivedDevices(requestingUserId);
    return all.find((a) => a.id === deviceId) || null;
  }

  public getArchivedTelemetry(deviceId: string, requestingUserId?: string): any[] {
    const archive = this.getArchivedDeviceById(deviceId, requestingUserId);
    if (!archive || !archive.telemetrySnapshot?.compressedData) {
      return archive?.telemetrySnapshot?.recentReadings || [];
    }

    try {
      const buffer = Buffer.from(archive.telemetrySnapshot.compressedData, 'base64');
      const decompressed = zlib.gunzipSync(buffer).toString('utf8');
      return JSON.parse(decompressed);
    } catch (e) {
      console.warn('[Archive] Could not decompress archived telemetry:', e);
      return archive.telemetrySnapshot.recentReadings || [];
    }
  }

  public async restoreArchivedDevice(
    deviceId: string,
    requestingUserId?: string,
    requestingUserName?: string
  ): Promise<Device | null> {
    if (!this.db.data.archivedDevices) return null;

    const index = this.db.data.archivedDevices.findIndex((a: any) => {
      const id = a.id || a.device?.id;
      return id === deviceId;
    });

    if (index === -1) return null;

    const archivedItem: ArchivedDevice = this.db.data.archivedDevices.splice(index, 1)[0];
    const rawDev: Device = archivedItem.device || (archivedItem as any);
    const preserved = archivedItem.preservedSettings;

    // Check if device ID already exists in active devices, if so remove stale instance
    const existingIndex = this.db.data.devices.findIndex((d: Device) => d.id === deviceId);
    if (existingIndex !== -1) {
      this.db.data.devices.splice(existingIndex, 1);
    }

    // Reconstruct fully restored Device with all original configurations and metrics
    const restoredDevice: Device = {
      ...rawDev,
      ...(preserved || {}),
      id: rawDev.id || deviceId,
      name: preserved?.name || rawDev.name || `Restored Device ${deviceId}`,
      apiKey: preserved?.apiKey || rawDev.apiKey,
      tenantId: rawDev.tenantId || preserved?.siteId || 'usr_admin',
      status: 'offline', // Will turn online when live heartbeat/telemetry arrives
      metrics: preserved?.metrics || rawDev.metrics || {},
      deletedAt: undefined,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!this.db.data.devices) this.db.data.devices = [];
    this.db.data.devices.push(restoredDevice);

    // 1. Decompress and restore past telemetry records into telemetry array & repository
    let pastReadings: TelemetryReading[] = [];
    if (archivedItem.telemetrySnapshot?.compressedData) {
      try {
        const buffer = Buffer.from(archivedItem.telemetrySnapshot.compressedData, 'base64');
        const decompressed = zlib.gunzipSync(buffer).toString('utf8');
        pastReadings = JSON.parse(decompressed);
        if (Array.isArray(pastReadings) && pastReadings.length > 0) {
          if (!this.db.data.telemetry) this.db.data.telemetry = [];
          const existingIds = new Set(this.db.data.telemetry.map((t: any) => t.id));
          for (const pr of pastReadings) {
            if (!existingIds.has(pr.id)) {
              this.db.data.telemetry.push(pr);
              existingIds.add(pr.id);
            }
          }
          if (this.db.telemetryRepository) {
            await this.db.telemetryRepository.addTelemetryBatchAsync(pastReadings).catch((e: any) =>
              console.warn('[Restore Telemetry Batch Error]', e)
            );
          }
        }
      } catch (err) {
        console.warn('[Restore] Could not restore decompressed telemetry history:', err);
      }
    }

    // 2. Restore metric history
    if (archivedItem.metricHistory) {
      if (!this.db.data.history) this.db.data.history = {};
      this.db.data.history[deviceId] = {
        ...(this.db.data.history[deviceId] || {}),
        ...archivedItem.metricHistory,
      };
    }

    // 3. Restore latest telemetry cache
    if (archivedItem.latestTelemetry && this.db.telemetryRepository) {
      this.db.telemetryRepository.latestTelemetryCache[deviceId] = {
        ...(this.db.telemetryRepository.latestTelemetryCache[deviceId] || {}),
        ...archivedItem.latestTelemetry,
      };
    }

    // 4. Restore archived threshold rules
    if (Array.isArray(archivedItem.archivedRules) && archivedItem.archivedRules.length > 0) {
      if (!this.db.data.rules) this.db.data.rules = [];
      const existingRuleIds = new Set(this.db.data.rules.map((r: any) => r.id));
      for (const rule of archivedItem.archivedRules) {
        if (!existingRuleIds.has(rule.id)) {
          this.db.data.rules.push(rule);
          existingRuleIds.add(rule.id);
        }
        if (this.db.postgresRepo?.isReady()) {
          await this.db.postgresRepo.saveThresholdRule(rule).catch(() => {});
        }
      }
    }

    // 5. Restore archived active alarms
    if (Array.isArray(archivedItem.archivedAlarms) && archivedItem.archivedAlarms.length > 0) {
      if (!this.db.data.activeAlarms) this.db.data.activeAlarms = [];
      const existingAlarmIds = new Set(this.db.data.activeAlarms.map((a: any) => a.id));
      for (const alarm of archivedItem.archivedAlarms) {
        if (!existingAlarmIds.has(alarm.id)) {
          this.db.data.activeAlarms.push(alarm);
          existingAlarmIds.add(alarm.id);
        }
        if (this.db.postgresRepo?.isReady()) {
          await this.db.postgresRepo.saveAlarm(alarm).catch(() => {});
        }
      }
    }

    // 6. Restore alarm events
    if (Array.isArray(archivedItem.archivedAlarmEvents) && archivedItem.archivedAlarmEvents.length > 0) {
      if (!this.db.data.alarmEvents) this.db.data.alarmEvents = [];
      const existingEventIds = new Set(this.db.data.alarmEvents.map((e: any) => e.id));
      for (const ev of archivedItem.archivedAlarmEvents) {
        if (!existingEventIds.has(ev.id)) {
          this.db.data.alarmEvents.push(ev);
          existingEventIds.add(ev.id);
        }
      }
    }

    // 7. Restore notifications & commands
    if (Array.isArray(archivedItem.archivedNotifications) && archivedItem.archivedNotifications.length > 0) {
      if (!this.db.data.notifications) this.db.data.notifications = [];
      const existingNotifIds = new Set(this.db.data.notifications.map((n: any) => n.id));
      for (const notif of archivedItem.archivedNotifications) {
        if (!existingNotifIds.has(notif.id)) {
          this.db.data.notifications.push(notif);
          existingNotifIds.add(notif.id);
        }
      }
    }
    if (Array.isArray(archivedItem.archivedCommands) && archivedItem.archivedCommands.length > 0) {
      if (!this.db.data.commands) this.db.data.commands = [];
      const existingCmdIds = new Set(this.db.data.commands.map((c: any) => c.id));
      for (const cmd of archivedItem.archivedCommands) {
        if (!existingCmdIds.has(cmd.id)) {
          this.db.data.commands.push(cmd);
          existingCmdIds.add(cmd.id);
        }
      }
    }

    const userName = requestingUserName || requestingUserId || 'Sistem Yöneticisi';
    this.db.addAuditLog(
      requestingUserId || 'system',
      userName,
      `Cihaz Arşivden Geri Yüklendi ve Sisteme Entegre Edildi: ${restoredDevice.name} (${restoredDevice.id}, Ayarlar, metrikler ve alarmlar geri yüklendi)`,
      'medium'
    );

    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    if (this.db.postgresRepo?.isReady()) {
      await this.db.postgresRepo.saveDevice(restoredDevice).catch((e: any) => console.warn('[PG Error Restore]', e.message));
    }

    return restoredDevice;
  }

  public async permanentlyDeleteArchivedDevice(
    deviceId: string,
    requestingUserId?: string,
    requestingUserName?: string
  ): Promise<boolean> {
    if (!this.db.data.archivedDevices) return false;

    const initialLen = this.db.data.archivedDevices.length;
    this.db.data.archivedDevices = this.db.data.archivedDevices.filter((a: any) => {
      const id = a.id || a.device?.id;
      return id !== deviceId;
    });

    if (this.db.data.archivedDevices.length < initialLen) {
      // Completely wipe all device data, telemetry, history, rules, alarms, commands & PostgreSQL records
      await this.purgeDeviceDataPermanently([deviceId]);

      const userName = requestingUserName || requestingUserId || 'Sistem Yöneticisi';
      this.db.addAuditLog(
        requestingUserId || 'system',
        userName,
        `Arşivdeki Cihaz ve Tüm Verileri (Telemetri, Alarmlar, Ayarlar) Kalıcı Olarak Silindi: ID ${deviceId}`,
        'high'
      );
      this.db.saveData(this.db.data);
      return true;
    }
    return false;
  }

  public async bulkDeleteArchivedDevices(
    deviceIds: string[],
    requestingUserId?: string,
    requestingUserName?: string
  ): Promise<number> {
    if (!this.db.data.archivedDevices || !Array.isArray(deviceIds) || deviceIds.length === 0) return 0;
    const initialLen = this.db.data.archivedDevices.length;
    const toDeleteSet = new Set(deviceIds);

    this.db.data.archivedDevices = this.db.data.archivedDevices.filter((a: any) => {
      const id = a.id || a.device?.id;
      return !toDeleteSet.has(id);
    });

    const deletedCount = initialLen - this.db.data.archivedDevices.length;
    if (deletedCount > 0) {
      // Completely wipe all data for deleted devices
      await this.purgeDeviceDataPermanently(deviceIds);

      const userName = requestingUserName || requestingUserId || 'Sistem Yöneticisi';
      this.db.addAuditLog(
        requestingUserId || 'system',
        userName,
        `Arşivdeki ${deletedCount} Cihaz ve Tüm Verileri Kalıcı Olarak Silindi (Toplu İşlem)`,
        'high'
      );
      this.db.saveData(this.db.data);
    }
    return deletedCount;
  }

  public async bulkRestoreArchivedDevices(
    deviceIds: string[],
    requestingUserId?: string,
    requestingUserName?: string
  ): Promise<Device[]> {
    if (!this.db.data.archivedDevices || !Array.isArray(deviceIds) || deviceIds.length === 0) return [];
    const restoredDevices: Device[] = [];

    for (const id of deviceIds) {
      const restored = await this.restoreArchivedDevice(id, requestingUserId, requestingUserName);
      if (restored) {
        restoredDevices.push(restored);
      }
    }

    return restoredDevices;
  }

  public async clearArchivedDevices(requestingUserId?: string, targetTenantId?: string): Promise<number> {
    if (!this.db.data.archivedDevices) return 0;
    const initialLen = this.db.data.archivedDevices.length;
    
    let removedIds: string[] = [];
    if (targetTenantId && targetTenantId !== 'all') {
      const remaining: any[] = [];
      for (const a of this.db.data.archivedDevices) {
        const tId = a.tenantId || a.device?.tenantId;
        if (tId === targetTenantId) {
          removedIds.push(a.id || a.device?.id);
        } else {
          remaining.push(a);
        }
      }
      this.db.data.archivedDevices = remaining;
    } else {
      removedIds = this.db.data.archivedDevices.map((a: any) => a.id || a.device?.id).filter(Boolean);
      this.db.data.archivedDevices = [];
    }

    const count = initialLen - (this.db.data.archivedDevices?.length || 0);
    if (removedIds.length > 0) {
      await this.purgeDeviceDataPermanently(removedIds);
    }
    this.db.saveData(this.db.data);
    return count;
  }

  // Network Discovery & Unregistered Devices
  public recordUnregisteredDevice(discDev: DiscoveredNetworkDevice): DiscoveredNetworkDevice | null {
    if (!this.db.data.unregisteredDevices) {
      this.db.data.unregisteredDevices = [];
    }

    // Do NOT record if this device IP or MAC is already in registered devices!
    const isAlreadyRegistered = (this.db.data.devices || []).some(
      (d: Device) =>
        (discDev.ip && d.ipAddress && d.ipAddress.trim() === discDev.ip.trim()) ||
        (discDev.mac && d.macAddress && d.macAddress.toLowerCase().trim() === discDev.mac.toLowerCase().trim())
    );

    if (isAlreadyRegistered) {
      if (discDev.ip) this.removeUnregisteredDevice(discDev.ip);
      if (discDev.mac) this.removeUnregisteredDevice(discDev.mac);
      return null;
    }

    const isRealToken = (t?: string) => t && t !== 'Yok' && t !== 'none' && t.trim() !== '';

    const existingIndex = this.db.data.unregisteredDevices.findIndex((d: any) => {
      if (discDev.ip && d.ip === discDev.ip) return true;
      if (discDev.mac && d.mac === discDev.mac) return true;
      if (isRealToken((discDev as any).tokenProvided) && d.tokenProvided === (discDev as any).tokenProvided) return true;
      return false;
    });

    if (existingIndex !== -1) {
      const existing = this.db.data.unregisteredDevices[existingIndex];
      this.db.data.unregisteredDevices[existingIndex] = {
        ...existing,
        ...discDev,
        lastSeen: new Date().toISOString(),
      };
      this.db.scheduleSave();
      return this.db.data.unregisteredDevices[existingIndex];
    } else {
      const newItem: any = {
        ...discDev,
        status: 'unregistered',
        lastSeen: new Date().toISOString(),
      };
      this.db.data.unregisteredDevices.push(newItem);
      this.db.addAuditLog(
        'system',
        'Ağ Taraması',
        `Yeni Kayıtsız ESP/IoT Cihazı Ağda Tespit Edildi (IP: ${discDev.ip}, Token: ${(discDev as any).tokenProvided || 'Yok'})`,
        'high'
      );
      this.db.saveData(this.db.data);
      return newItem;
    }
  }

  public removeUnregisteredDevice(ipOrMacOrToken: string) {
    if (!this.db.data.unregisteredDevices || !ipOrMacOrToken) return;
    const target = ipOrMacOrToken.toLowerCase().trim();
    this.db.data.unregisteredDevices = this.db.data.unregisteredDevices.filter((d: any) => {
      if (d.ip && d.ip.toLowerCase().trim() === target) return false;
      if (d.mac && d.mac.toLowerCase().trim() === target) return false;
      if (d.hostname && d.hostname.toLowerCase().trim() === target) return false;
      if (d.pairingCode && d.pairingCode.toLowerCase().trim() === target) return false;
      if (d.tokenProvided && d.tokenProvided !== 'Yok' && d.tokenProvided.toLowerCase().trim() === target) return false;
      return true;
    });
    this.db.saveData(this.db.data);
  }

  public clearUnregisteredDevices(targetTenantId?: string): number {
    if (!this.db.data.unregisteredDevices) return 0;
    const initialCount = this.db.data.unregisteredDevices.length;
    if (targetTenantId && targetTenantId !== 'all') {
      this.db.data.unregisteredDevices = this.db.data.unregisteredDevices.filter((d: any) => d.tenantId !== targetTenantId);
    } else {
      this.db.data.unregisteredDevices = [];
    }
    this.db.saveData(this.db.data);
    return initialCount - (this.db.data.unregisteredDevices?.length || 0);
  }

  public getDiscoveredDevices(requestingUserId?: string, targetCustomerId?: string): DiscoveredNetworkDevice[] {
    const allDevices: Device[] = this.db.data.devices || [];

    // Determine admin privilege (fail-closed for specified non-admin users, allow system when undefined)
    let isAdmin = !requestingUserId || requestingUserId === 'usr_admin';
    if (requestingUserId) {
      const user = this.db.data.users?.find((u: any) => u.id === requestingUserId);
      if (user?.role === 'admin') {
        isAdmin = true;
      }
    }

    // Filter devices based on tenant permission, excluding simulated virtual generators from physical discovery
    let allowedDevices = allDevices.filter((d: Device) => !d.isSimulated);
    if (!isAdmin) {
      // Non-admin users ONLY see devices from their assigned tenants
      const allowedTenants = requestingUserId ? this.getUserTenants(requestingUserId) : [];
      allowedDevices = allowedDevices.filter((d: Device) => allowedTenants.includes(d.tenantId));
    } else if (targetCustomerId && targetCustomerId !== 'all') {
      allowedDevices = allowedDevices.filter((d: Device) => d.tenantId === targetCustomerId);
    }

    const registeredIps = new Set(
      allDevices
        .map((d) => d.ipAddress?.toLowerCase().trim())
        .filter((ip): ip is string => !!ip && ip !== '—')
    );
    const registeredMacs = new Set(
      allDevices
        .map((d) => d.macAddress?.toLowerCase().trim())
        .filter((mac): mac is string => !!mac && mac !== '—')
    );
    const registeredNames = new Set(
      allDevices
        .map((d) => d.name?.toLowerCase().trim())
        .filter((name): name is string => !!name)
    );
    const registeredIds = new Set(
      allDevices
        .map((d) => d.id?.toLowerCase().trim())
        .filter((id): id is string => !!id)
    );

    // Filter unregistered devices matching visibility, removing hardcoded/mock fake nodes and any registered devices
    const unregList = (this.db.data.unregisteredDevices || [])
      .filter((d: DiscoveredNetworkDevice) => {
        // Exclude legacy mock or fake demo entries
        if (d.hostname === 'Fiber-Modem-Gateway' || (d.ip === '192.168.1.1' && d.vendor?.includes('Zyxel'))) {
          return false;
        }

        // Exclude if already registered in the system
        if (d.registeredDeviceId && registeredIds.has(d.registeredDeviceId.toLowerCase().trim())) {
          return false;
        }

        const ipClean = d.ip ? d.ip.toLowerCase().trim() : '';
        const macClean = d.mac ? d.mac.toLowerCase().trim() : '';
        const hostClean = d.hostname ? d.hostname.toLowerCase().trim() : '';

        if (ipClean && registeredIps.has(ipClean)) return false;
        if (macClean && registeredMacs.has(macClean)) return false;
        if (hostClean && registeredNames.has(hostClean)) return false;

        if (!isAdmin) {
          // If non-admin, only show unregistered devices explicitly tagged with tenantId or on same subnet
          const allowedTenants = requestingUserId ? this.getUserTenants(requestingUserId) : [];
          if (d.tenantId && allowedTenants.includes(d.tenantId)) return true;
          const userSubnets = Array.from(registeredIps).map((ip) => ip.split('.').slice(0, 3).join('.')).filter(Boolean);
          if (ipClean && userSubnets.some((sub) => ipClean.startsWith(sub))) return true;
          return false;
        }

        return true;
      })
      .map((d: any) => {
        const { tokenProvided, ...rest } = d;
        return {
          ...rest,
          hasAuthToken: !!tokenProvided,
          status: 'unregistered' as const,
        };
      });

    // Only return newly discovered / pending pairing devices; already registered devices must NOT be included in discovery pool
    const combined: DiscoveredNetworkDevice[] = unregList;

    const statusPriority: Record<string, number> = {
      transmitting: 1,
      active: 1,
      online: 1,
      pending: 2,
      discovered: 3,
      unregistered: 3,
      idle: 4,
      offline: 5,
    };

    return combined.sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      const tsA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const tsB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return tsB - tsA;
    });
  }

  public processHistory(reading: TelemetryReading, isSimulated: boolean) {
    if (isSimulated) return; // Do not store long-term history for simulated devices to save space

    const { deviceId, metric, value, timestamp } = reading;
    
    if (!this.db.data.history) this.db.data.history = {};
    if (!this.db.data.history[deviceId]) this.db.data.history[deviceId] = {};
    if (!this.db.data.history[deviceId][metric]) {
      this.db.data.history[deviceId][metric] = { hourly: [], daily: [], monthly: [] };
    }
    
    const history = this.db.data.history[deviceId][metric];
    const d = new Date(timestamp);
    
    const hourKey = d.toISOString().substring(0, 13) + ':00:00Z'; 
    const dayKey = d.toISOString().substring(0, 10) + 'T00:00:00Z'; 
    const monthKey = d.toISOString().substring(0, 7) + '-01T00:00:00Z'; 
    
    const updateBucket = (bucket: any[], key: string, maxItems: number) => {
      let entry = bucket.find((b: any) => b.time === key);
      if (!entry) {
        entry = { time: key, value: 0, count: 0 };
        bucket.push(entry);
        bucket.sort((a: any, b: any) => a.time.localeCompare(b.time));
        if (bucket.length > maxItems) {
          bucket.shift(); // remove oldest
        }
      }
      entry.count += 1;
      // Moving average
      entry.value = entry.value + (value - entry.value) / entry.count;
    };
    
    updateBucket(history.hourly, hourKey, 168); // keep last 168 hours (7 days)
    updateBucket(history.daily, dayKey, 365); // keep last 365 days (1 year)
    updateBucket(history.monthly, monthKey, 60); // keep last 60 months (5 years)
  }

  /**
   * Akıllı Cihaz Telemetri ve Frekans Takip Yöneticisi:
   * 1. Cihaz veri göndermeye başladığında tekrar ONLINE duruma geçer.
   * 2. AKILLI KURAL: Cihazın offline kaldığı süre (uyku/kesinti) veri gönderim sıklığına DAHİL EDİLMEMELİDİR.
   * 3. İki aktif paket arasındaki gerçek süre ölçülerek sistem veri gönderim sıklığını (expectedIntervalSeconds) otomatik belirler.
   * 4. Kullanıcı cihaz ayarlarından sıklığı manuel sabitlediyse, kullanıcının son ayarı KESİNLİKLE KORUNUR.
   */
  public async processDeviceTelemetryArrival(deviceId: string): Promise<Device | null> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) return null;

    const hadOfflineNotification = !!dev.lastOfflineNotifiedAt;
    const now = Date.now();
    smartIntervalService.processDeviceTelemetryArrival(dev, now);

    if (hadOfflineNotification) {
      dev.lastOfflineNotifiedAt = undefined;
      this.db.addAuditLog(
        dev.tenantId || 'system',
        'Sistem Sinyal Takibi',
        `Cihaz Yeniden Çevrimiçi: ${dev.name} (IP: ${dev.ipAddress || 'Bilinmiyor'}) veri akışını yeniden sağladı.`,
        'low'
      );
      this.db.addNotification({
        tenantId: dev.tenantId || 'usr_admin',
        title: `Cihaz Yeniden Çevrimiçi`,
        message: `${dev.name} cihazı veri akışını yeniden sağladı ve normal çalışma durumuna döndü.`,
        severity: 'info',
        deviceId: dev.id,
        deviceName: dev.name,
      });
    }

    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    return dev;
  }

  // ==========================================
  // HIERARCHY: SITES, ZONES & GROUPS
  // ==========================================

  public getSites(tenantId?: string): Site[] {
    if (!this.db.data.sites) this.db.data.sites = [];
    if (!tenantId || tenantId === 'all' || tenantId === 'usr_admin') {
      return this.db.data.sites;
    }
    return this.db.data.sites.filter((s: Site) => s.tenantId === tenantId);
  }

  public createSite(siteData: Partial<Site> & { name: string; tenantId: string }): Site {
    if (!this.db.data.sites) this.db.data.sites = [];
    const newSite: Site = {
      id: siteData.id || `site_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: siteData.tenantId,
      name: siteData.name.trim(),
      address: siteData.address?.trim(),
      createdAt: siteData.createdAt || new Date().toISOString(),
    };
    this.db.data.sites.push(newSite);
    this.db.saveData(this.db.data);
    this.db.addAuditLog(newSite.tenantId, 'Tesis Yönetimi', `Yeni Tesis/Lokasyon Oluşturuldu: ${newSite.name}`, 'info');
    return newSite;
  }

  public deleteSite(siteId: string, tenantId?: string): boolean {
    if (!this.db.data.sites) return false;
    const idx = this.db.data.sites.findIndex((s: Site) => s.id === siteId && (!tenantId || tenantId === 'usr_admin' || s.tenantId === tenantId));
    if (idx === -1) return false;

    const [removed] = this.db.data.sites.splice(idx, 1);
    // Unset siteId on associated devices, zones, groups
    if (this.db.data.devices) {
      this.db.data.devices.forEach((d: Device) => {
        if (d.siteId === siteId) d.siteId = undefined;
      });
    }
    if (this.db.data.zones) {
      this.db.data.zones.forEach((z: Zone) => {
        if (z.siteId === siteId) z.siteId = undefined;
      });
    }
    if (this.db.data.deviceGroups) {
      this.db.data.deviceGroups.forEach((g: DeviceGroup) => {
        if (g.siteId === siteId) g.siteId = undefined;
      });
    }

    this.db.saveData(this.db.data);
    this.db.addAuditLog(removed.tenantId, 'Tesis Yönetimi', `Tesis/Lokasyon Silindi: ${removed.name}`, 'medium');
    return true;
  }

  public getZones(tenantId?: string, siteId?: string): Zone[] {
    if (!this.db.data.zones) this.db.data.zones = [];
    let list: Zone[] = this.db.data.zones;
    if (tenantId && tenantId !== 'all' && tenantId !== 'usr_admin') {
      list = list.filter((z: Zone) => z.tenantId === tenantId);
    }
    if (siteId && siteId !== 'all') {
      list = list.filter((z: Zone) => z.siteId === siteId);
    }
    return list;
  }

  public createZone(zoneData: Partial<Zone> & { name: string; tenantId: string }): Zone {
    if (!this.db.data.zones) this.db.data.zones = [];
    const newZone: Zone = {
      id: zoneData.id || `zone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: zoneData.tenantId,
      siteId: zoneData.siteId,
      name: zoneData.name.trim(),
      description: zoneData.description?.trim(),
      createdAt: zoneData.createdAt || new Date().toISOString(),
    };
    this.db.data.zones.push(newZone);
    this.db.saveData(this.db.data);
    this.db.addAuditLog(newZone.tenantId, 'Bölge Yönetimi', `Yeni Bölge/Alan Oluşturuldu: ${newZone.name}`, 'info');
    return newZone;
  }

  public deleteZone(zoneId: string, tenantId?: string): boolean {
    if (!this.db.data.zones) return false;
    const idx = this.db.data.zones.findIndex((z: Zone) => z.id === zoneId && (!tenantId || tenantId === 'usr_admin' || z.tenantId === tenantId));
    if (idx === -1) return false;

    const [removed] = this.db.data.zones.splice(idx, 1);
    if (this.db.data.devices) {
      this.db.data.devices.forEach((d: Device) => {
        if (d.zoneId === zoneId) d.zoneId = undefined;
      });
    }
    if (this.db.data.deviceGroups) {
      this.db.data.deviceGroups.forEach((g: DeviceGroup) => {
        if (g.zoneId === zoneId) g.zoneId = undefined;
      });
    }

    this.db.saveData(this.db.data);
    this.db.addAuditLog(removed.tenantId, 'Bölge Yönetimi', `Bölge/Alan Silindi: ${removed.name}`, 'medium');
    return true;
  }

  public getDeviceGroups(tenantId?: string, siteId?: string, zoneId?: string): DeviceGroup[] {
    if (!this.db.data.deviceGroups) this.db.data.deviceGroups = [];
    let list: DeviceGroup[] = this.db.data.deviceGroups;
    if (tenantId && tenantId !== 'all' && tenantId !== 'usr_admin') {
      list = list.filter((g: DeviceGroup) => g.tenantId === tenantId);
    }
    if (siteId && siteId !== 'all') {
      list = list.filter((g: DeviceGroup) => g.siteId === siteId);
    }
    if (zoneId && zoneId !== 'all') {
      list = list.filter((g: DeviceGroup) => g.zoneId === zoneId);
    }
    return list;
  }

  public createDeviceGroup(groupData: Partial<DeviceGroup> & { name: string; tenantId: string }): DeviceGroup {
    if (!this.db.data.deviceGroups) this.db.data.deviceGroups = [];
    const newGroup: DeviceGroup = {
      id: groupData.id || `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: groupData.tenantId,
      siteId: groupData.siteId,
      zoneId: groupData.zoneId,
      name: groupData.name.trim(),
      description: groupData.description?.trim(),
      color: groupData.color || '#3b82f6',
      createdAt: groupData.createdAt || new Date().toISOString(),
    };
    this.db.data.deviceGroups.push(newGroup);
    this.db.saveData(this.db.data);
    this.db.addAuditLog(newGroup.tenantId, 'Grup Yönetimi', `Yeni Cihaz Grubu Oluşturuldu: ${newGroup.name}`, 'info');
    return newGroup;
  }

  public deleteDeviceGroup(groupId: string, tenantId?: string): boolean {
    if (!this.db.data.deviceGroups) return false;
    const idx = this.db.data.deviceGroups.findIndex((g: DeviceGroup) => g.id === groupId && (!tenantId || tenantId === 'usr_admin' || g.tenantId === tenantId));
    if (idx === -1) return false;

    const [removed] = this.db.data.deviceGroups.splice(idx, 1);
    if (this.db.data.devices) {
      this.db.data.devices.forEach((d: Device) => {
        if (d.groupId === groupId) d.groupId = undefined;
      });
    }

    this.db.saveData(this.db.data);
    this.db.addAuditLog(removed.tenantId, 'Grup Yönetimi', `Cihaz Grubu Silindi: ${removed.name}`, 'medium');
    return true;
  }

  // ==========================================
  // MAINTENANCE MODE & TAGS
  // ==========================================

  public async setDeviceMaintenanceMode(
    deviceId: string,
    enabled: boolean,
    reason?: string,
    until?: string,
    requestingUser?: any
  ): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    dev.maintenanceMode = Boolean(enabled);
    dev.maintenanceReason = enabled ? (reason || 'Planlı bakım & servis çalışması') : undefined;
    dev.maintenanceUntil = enabled && until ? until : undefined;

    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    const operator = requestingUser?.name || 'Kullanıcı';
    this.db.addAuditLog(
      dev.tenantId || 'system',
      'Bakım Modu',
      `Cihaz Bakım Modu ${enabled ? 'AKTİF EDİLDİ (Alarmlar Susturuldu)' : 'DEVRE DIŞI BIRAKILDI (Normal İzleme)'}: ${dev.name} [Neden: ${dev.maintenanceReason || '—'}, İşlemi Yapan: ${operator}]`,
      enabled ? 'medium' : 'low'
    );

    return dev;
  }

  public async updateDeviceTags(deviceId: string, tags: string[], requestingUser?: any): Promise<Device> {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    const cleanTags = Array.from(new Set((tags || []).map((t) => String(t).trim()).filter(Boolean)));
    dev.tags = cleanTags;

    this.db.saveData(this.db.data);
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDevice(dev).catch((e) => console.warn('[PG Error]', e.message)); }

    const operator = requestingUser?.name || 'Kullanıcı';
    this.db.addAuditLog(
      dev.tenantId || 'system',
      'Etiket Yönetimi',
      `Cihaz Etiketleri Güncellendi: ${dev.name} -> [${cleanTags.join(', ')}] (İşlem: ${operator})`,
      'low'
    );

    return dev;
  }

  // ==========================================
  // HARDWARE REPLACEMENT & AUDIT MIGRATION
  // ==========================================

  public async replaceDeviceHardware(
    oldDeviceId: string,
    data: {
      newDeviceId?: string;
      newName?: string;
      newIp?: string;
      newMac?: string;
      pairingCode?: string;
      reason?: string;
      notes?: string;
    },
    requestingUser: any
  ): Promise<{ device: Device; record: DeviceReplacementRecord }> {
    const oldDev = this.db.data.devices.find((d: Device) => d.id === oldDeviceId);
    if (!oldDev) throw new Error('Değiştirilecek mevcut cihaz bulunamadı.');

    let newMac = data.newMac?.trim();
    let newIp = data.newIp?.trim();
    let newFirmware = oldDev.firmwareVersion;
    let newModel = oldDev.hardwareModel;

    // If pairingCode is provided, resolve from discovered pool
    if (data.pairingCode) {
      const discovered = (this.db.data.unregisteredDevices || []).find((d: any) => d.pairingCode === data.pairingCode);
      if (discovered) {
        newMac = discovered.mac || newMac;
        newIp = discovered.ip || newIp;
        newFirmware = discovered.firmwareVersion || newFirmware;
        newModel = discovered.hardwareModel || newModel;
        if (discovered.ip) this.db.removeUnregisteredDevice(discovered.ip);
        if (discovered.mac) this.db.removeUnregisteredDevice(discovered.mac);
      }
    }

    const record: DeviceReplacementRecord = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: oldDev.tenantId,
      oldDeviceId: oldDev.id,
      oldDeviceName: oldDev.name,
      newDeviceId: data.newDeviceId || oldDev.id,
      newDeviceName: data.newName || oldDev.name,
      replacedAt: new Date().toISOString(),
      replacedBy: requestingUser?.name || requestingUser?.email || 'Sistem Yöneticisi',
      reason: data.reason || 'Arıza / Donanım Yenileme',
      notes: data.notes || `Eski MAC: ${oldDev.macAddress || '—'} -> Yeni MAC: ${newMac || '—'}`,
    };

    if (!this.db.data.replacementHistory) this.db.data.replacementHistory = [];
    this.db.data.replacementHistory.push(record);

    if (!oldDev.replacementHistory) oldDev.replacementHistory = [];
    oldDev.replacementHistory.push(record);

    if (newMac) oldDev.macAddress = newMac;
    if (newIp) oldDev.ipAddress = newIp;
    if (data.newName) oldDev.name = data.newName;
    if (newFirmware) oldDev.firmwareVersion = newFirmware;
    if (newModel) oldDev.hardwareModel = newModel;

    this.db.saveData(this.db.data);
    this.db.postgresRepo?.saveDevice(oldDev).catch(() => {});

    this.db.addAuditLog(
      oldDev.tenantId,
      'Donanım Değişimi',
      `Cihaz Donanım Değişimi Tamamlandı: "${oldDev.name}" [Eski MAC: ${record.notes}] (Değiştiren: ${record.replacedBy}, Neden: ${record.reason})`,
      'high'
    );

    return { device: oldDev, record };
  }

  public getReplacementHistory(tenantId?: string, deviceId?: string): DeviceReplacementRecord[] {
    if (!this.db.data.replacementHistory) this.db.data.replacementHistory = [];
    let list: DeviceReplacementRecord[] = this.db.data.replacementHistory;
    if (tenantId && tenantId !== 'all' && tenantId !== 'usr_admin') {
      list = list.filter((r: DeviceReplacementRecord) => r.tenantId === tenantId);
    }
    if (deviceId) {
      list = list.filter((r: DeviceReplacementRecord) => r.oldDeviceId === deviceId || r.newDeviceId === deviceId);
    }
    return list;
  }

  // ==========================================
  // DEVICE HEALTH SCORE & SUMMARY
  // ==========================================

  public getDeviceHealthSummary(deviceId: string): DeviceHealthSummary | null {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) return null;

    const now = Date.now();
    const lastSeenMs = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
    const diffSec = lastSeenMs > 0 ? (now - lastSeenMs) / 1000 : Infinity;
    const expInterval = dev.expectedIntervalSeconds || 30;

    let freshness: 'live' | 'fresh' | 'stale' | 'dead' = 'dead';
    if (diffSec <= expInterval * 1.2) {
      freshness = 'live';
    } else if (diffSec <= expInterval * 2.5) {
      freshness = 'fresh';
    } else if (diffSec <= expInterval * 5) {
      freshness = 'stale';
    } else {
      freshness = 'dead';
    }

    // Active alarms for this device
    const activeAlarms = (this.db.data.activeAlarms || []).filter(
      (a: any) => a.deviceId === dev.id && a.state === 'ACTIVE'
    );
    const totalAlarms24h = (this.db.data.notifications || []).filter((n: any) => {
      const matchDevice = n.deviceId === dev.id || n.title?.includes(dev.name);
      if (!matchDevice) return false;
      const nTime = new Date(n.timestamp).getTime();
      return now - nTime <= 24 * 3600 * 1000;
    }).length;

    // Calculate Health Score (0 - 100)
    let score = 100;

    if (dev.status === 'offline') {
      score -= 50;
    } else if (dev.status === 'warning') {
      score -= 20;
    }

    if (freshness === 'stale') {
      score -= 15;
    } else if (freshness === 'dead') {
      score -= 30;
    }

    if (activeAlarms.length > 0) {
      score -= Math.min(30, activeAlarms.length * 15);
    }

    if (dev.pingMs && dev.pingMs > 250) {
      score -= 10;
    }

    if (dev.apiKeyRevoked) {
      score -= 40;
    }

    if (dev.maintenanceMode) {
      // In maintenance mode, clamp to minimum 70 if no hardware failures
      score = Math.max(70, score);
    }

    score = Math.max(0, Math.min(100, score));

    // Get last command info
    const deviceCmds = (this.db.data.commands || [])
      .filter((c: any) => c.deviceId === dev.id)
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const lastCmd = deviceCmds[0];

    return {
      deviceId: dev.id,
      deviceName: dev.name,
      status: dev.status,
      healthScore: score,
      firmwareVersion: dev.firmwareVersion,
      hardwareModel: dev.hardwareModel,
      lastTelemetryAt: dev.lastSeen,
      lastCommandStatus: lastCmd?.status,
      lastCommandAt: lastCmd?.appliedAt || lastCmd?.executedAt || lastCmd?.created_at,
      activeAlarmsCount: activeAlarms.length,
      totalAlarms24h,
      dataFreshness: freshness,
      latencyMs: dev.pingMs,
      maintenanceMode: dev.maintenanceMode,
    };
  }

  public getDeviceHealthSummaries(tenantId?: string): DeviceHealthSummary[] {
    let devices: Device[] = this.db.data.devices || [];
    if (tenantId && tenantId !== 'all' && tenantId !== 'usr_admin') {
      devices = devices.filter((d) => d.tenantId === tenantId);
    }
    return devices.map((d) => this.getDeviceHealthSummary(d.id)).filter(Boolean) as DeviceHealthSummary[];
  }

  // ==========================================
  // DISCOVERY & PAIRING SYSTEM
  // ==========================================

  public checkDuplicateIdentity(params: {
    mac?: string;
    ip?: string;
    name?: string;
    excludeDeviceId?: string;
    tenantId?: string;
  }): CollisionCheckResult {
    const devices: Device[] = this.db.data.devices || [];
    const macClean = params.mac ? params.mac.trim().toLowerCase() : null;
    const ipClean = params.ip ? params.ip.trim() : null;
    const nameClean = params.name ? params.name.trim().toLowerCase() : null;

    const conflictingDevices: CollisionCheckResult['conflictingDevices'] = [];
    let collisionType: CollisionCheckResult['collisionType'] = 'none';

    for (const dev of devices) {
      if (params.excludeDeviceId && dev.id === params.excludeDeviceId) continue;

      const devMac = (dev.macAddress || '').trim().toLowerCase();
      const devIp = (dev.ipAddress || '').trim();
      const devName = (dev.name || '').trim().toLowerCase();

      let isMatch = false;
      if (macClean && devMac && macClean === devMac) {
        isMatch = true;
        collisionType = collisionType === 'none' ? 'mac' : 'multiple';
      }
      if (ipClean && devIp && ipClean === devIp) {
        isMatch = true;
        collisionType = collisionType === 'none' ? 'ip' : 'multiple';
      }
      if (nameClean && devName && nameClean === devName && (!params.tenantId || dev.tenantId === params.tenantId)) {
        isMatch = true;
        collisionType = collisionType === 'none' ? 'name' : 'multiple';
      }

      if (isMatch) {
        conflictingDevices.push({
          id: dev.id,
          name: dev.name,
          ipAddress: dev.ipAddress,
          macAddress: dev.macAddress,
          tenantId: dev.tenantId,
          status: dev.status,
        });
      }
    }

    if (conflictingDevices.length === 0) {
      return {
        hasCollision: false,
        collisionType: 'none',
        conflictingDevices: [],
        suggestedAction: 'proceed',
        message: 'Herhangi bir kimlik çakışması tespit edilmedi. Cihaz güvenle kaydedilebilir.',
      };
    }

    let suggestedAction: CollisionCheckResult['suggestedAction'] = 'update_existing';
    let message = 'Bu donanıma ait parametrelerle eşleşen kayıtlı cihazlar bulundu: ';

    if (collisionType === 'mac') {
      suggestedAction = 'replace_hardware';
      message = `Aynı MAC adresine (${params.mac}) sahip ${conflictingDevices.length} cihaz sistemde mevcut. Donanım değişimi (Hardware Replacement) veya mevcut kaydı güncelleme önerilir.`;
    } else if (collisionType === 'ip') {
      suggestedAction = 'update_existing';
      message = `Aynı IP adresine (${params.ip}) sahip cihazlar mevcut. Dinamik DHCP veya statik IP çakışması olabilir.`;
    } else if (collisionType === 'name') {
      suggestedAction = 'rename_unique';
      message = `"${params.name}" adında bir cihaz bu organizasyonda zaten mevcut. Yeni bir isim seçebilir veya mevcut cihazı güncelleyebilirsiniz.`;
    } else {
      message = `Birden fazla kimlik çakışması tespit edildi (MAC/IP/İsim).`;
    }

    return {
      hasCollision: true,
      collisionType,
      conflictingDevices,
      suggestedAction,
      message,
    };
  }

  public getPairingHistory(tenantId?: string): PairingAuditRecord[] {
    if (!this.db.data.pairingHistory) this.db.data.pairingHistory = [];
    let list: PairingAuditRecord[] = this.db.data.pairingHistory;
    if (tenantId && tenantId !== 'all' && tenantId !== 'usr_admin') {
      list = list.filter((r) => r.tenantId === tenantId);
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public addPairingAudit(record: PairingAuditRecord) {
    if (!this.db.data.pairingHistory) this.db.data.pairingHistory = [];
    this.db.data.pairingHistory.unshift(record);
    if (this.db.data.pairingHistory.length > 500) {
      this.db.data.pairingHistory = this.db.data.pairingHistory.slice(0, 500);
    }
    this.db.saveData(this.db.data);
  }

  public updateDiscoveredLifecycle(target: string, state: DiscoveredDeviceLifecycleState) {
    if (!this.db.data.unregisteredDevices) return;
    target = target.toLowerCase().trim();
    const item = this.db.data.unregisteredDevices.find(
      (d: any) =>
        (d.mac && d.mac.toLowerCase().trim() === target) ||
        (d.ip && d.ip.toLowerCase().trim() === target) ||
        (d.pairingCode && d.pairingCode.toLowerCase().trim() === target)
    );
    if (item) {
      item.lifecycleState = state;
      this.db.saveData(this.db.data);
    }
  }

  public async pairDevice(
    request: PairDeviceRequest,
    actor: { id: string; name: string; role: string }
  ): Promise<{ success: boolean; device?: Device; message: string; auditRecord: PairingAuditRecord }> {
    const isActorAdmin = actor.role === 'admin' || actor.id === 'usr_admin' || actor.id === 'admin';
    const targetTenantId = isActorAdmin ? (request.tenantId || actor.id) : actor.id;
    const targetTenant = (this.db.data.users || []).find((u: any) => u.id === targetTenantId);
    const tenantName = targetTenant ? targetTenant.name : (targetTenantId === 'usr_admin' ? 'Merkez Yönetim' : targetTenantId);

    const collision = this.checkDuplicateIdentity({
      mac: request.macAddress,
      ip: request.ipAddress,
      name: request.name,
      tenantId: targetTenantId,
    });

    const strategy = request.collisionStrategy || 'reject';

    // Handle collision strategies
    let resolvedDeviceName = request.name.trim();
    let existingConflictingDev: Device | undefined;

    if (collision.hasCollision) {
      existingConflictingDev = (this.db.data.devices || []).find((d: Device) => d.id === collision.conflictingDevices[0]?.id);

      if (strategy === 'reject') {
        const auditRecord: PairingAuditRecord = {
          id: 'pair_audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          deviceName: request.name,
          tenantId: targetTenantId,
          tenantName,
          actorId: actor.id,
          actorName: actor.name,
          method: request.method,
          pairingCode: request.pairingCode,
          macAddress: request.macAddress,
          ipAddress: request.ipAddress,
          status: 'REJECTED',
          resolutionAction: 'rejected',
          details: `Eşleştirme reddedildi: ${collision.message}`,
          timestamp: new Date().toISOString(),
        };
        this.addPairingAudit(auditRecord);
        return {
          success: false,
          message: collision.message,
          auditRecord,
        };
      } else if (strategy === 'force_unique') {
        let counter = 1;
        while (
          (this.db.data.devices || []).some(
            (d: Device) => d.tenantId === targetTenantId && d.name.toLowerCase() === resolvedDeviceName.toLowerCase()
          )
        ) {
          resolvedDeviceName = `${request.name.trim()} (${counter++})`;
        }
      } else if (strategy === 'update_existing' && existingConflictingDev) {
        // Update the existing device with new connection parameters
        const updated = await this.updateDevice(existingConflictingDev.id, {
          ipAddress: request.ipAddress || existingConflictingDev.ipAddress,
          macAddress: request.macAddress || existingConflictingDev.macAddress,
          location: request.location || existingConflictingDev.location,
          siteId: request.siteId || existingConflictingDev.siteId,
          zoneId: request.zoneId || existingConflictingDev.zoneId,
          groupId: request.groupId || existingConflictingDev.groupId,
          tags: request.tags && request.tags.length > 0 ? request.tags : existingConflictingDev.tags,
        });

        if (request.macAddress) this.removeUnregisteredDevice(request.macAddress);
        if (request.ipAddress) this.removeUnregisteredDevice(request.ipAddress);

        const auditRecord: PairingAuditRecord = {
          id: 'pair_audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          deviceId: existingConflictingDev.id,
          deviceName: existingConflictingDev.name,
          tenantId: targetTenantId,
          tenantName,
          actorId: actor.id,
          actorName: actor.name,
          method: request.method,
          pairingCode: request.pairingCode,
          macAddress: request.macAddress,
          ipAddress: request.ipAddress,
          status: 'DUPLICATE_RESOLVED',
          resolutionAction: 'updated_existing',
          details: `Mevcut cihaz kaydı güncellendi (${existingConflictingDev.name})`,
          timestamp: new Date().toISOString(),
        };
        this.addPairingAudit(auditRecord);
        return { success: true, device: updated, message: 'Mevcut cihaz başarıyla güncellendi.', auditRecord };
      } else if (strategy === 'replace_hardware' && (request.targetDeviceIdToReplace || existingConflictingDev)) {
        const targetDevId = request.targetDeviceIdToReplace || existingConflictingDev?.id;
        if (targetDevId) {
          const replaced = await this.replaceDeviceHardware(
            targetDevId,
            {
              newMac: request.macAddress || 'Bilinmiyor',
              newIp: request.ipAddress,
              reason: `Discovery & Provisioning Sihirbazı üzerinden donanım değişimi (${request.method})`,
              notes: `Eski cihazın yerine atandı. Yeni MAC: ${request.macAddress || '—'}`,
            },
            actor
          );

          if (request.macAddress) this.removeUnregisteredDevice(request.macAddress);
          if (request.ipAddress) this.removeUnregisteredDevice(request.ipAddress);

          const auditRecord: PairingAuditRecord = {
            id: 'pair_audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            deviceId: replaced?.device?.id,
            deviceName: replaced?.device?.name || request.name,
            tenantId: targetTenantId,
            tenantName,
            actorId: actor.id,
            actorName: actor.name,
            method: request.method,
            pairingCode: request.pairingCode,
            macAddress: request.macAddress,
            ipAddress: request.ipAddress,
            status: 'DUPLICATE_RESOLVED',
            resolutionAction: 'replaced_hardware',
            details: `Donanım değişimi tamamlandı: ${replaced?.record?.notes || request.macAddress}`,
            timestamp: new Date().toISOString(),
          };
          this.addPairingAudit(auditRecord);
          return {
            success: true,
            device: replaced?.device,
            message: 'Donanım değişimi başarıyla uygulandı ve telemetri geçmişi korundu.',
            auditRecord,
          };
        }
      }
    }

    // 1. Resolve Device Token: Check if request has an explicit valid key
    let resolvedApiKey: string | undefined = request.apiKey?.trim();
    if (
      !resolvedApiKey ||
      resolvedApiKey === '__USE_CACHED_TOKEN__' ||
      resolvedApiKey.includes('USE_CACHED') ||
      resolvedApiKey === 'Yok' ||
      resolvedApiKey === 'undefined' ||
      resolvedApiKey === 'null'
    ) {
      resolvedApiKey = undefined;
    }

    // 2. If no valid key was explicitly entered by user, look up tokenProvided from unregisteredDevices cache
    if (!resolvedApiKey) {
      const cleanDevMac = request.macAddress?.replace(/[:-]/g, '').toLowerCase();
      const unreg = (this.db.data.unregisteredDevices || []).find((d: any) => {
        const cleanUnregMac = d.mac?.replace(/[:-]/g, '').toLowerCase();
        const macMatch = cleanDevMac && cleanUnregMac && cleanDevMac === cleanUnregMac;
        const ipMatch = request.ipAddress && d.ip && d.ip === request.ipAddress;
        const codeMatch = request.pairingCode && d.pairingCode && d.pairingCode === request.pairingCode;
        const nameMatch = request.name && (d.hostname === request.name || d.name === request.name);
        return macMatch || ipMatch || codeMatch || nameMatch;
      });

      if (unreg && unreg.tokenProvided && typeof unreg.tokenProvided === 'string') {
        const candidate = unreg.tokenProvided.trim();
        if (
          candidate !== 'Yok' &&
          candidate !== '__USE_CACHED_TOKEN__' &&
          !candidate.includes('USE_CACHED') &&
          candidate !== 'undefined' &&
          candidate !== 'null' &&
          candidate.length >= 8
        ) {
          resolvedApiKey = candidate;
        }
      }
    }

    // Standard new device creation
    const createdDev = await this.createDevice({
      name: resolvedDeviceName,
      type: request.type || 'ESP32',
      location: request.location || 'Merkez Tesis',
      ipAddress: request.ipAddress || '',
      macAddress: request.macAddress || '',
      tenantId: targetTenantId,
      userId: targetTenantId,
      siteId: request.siteId,
      zoneId: request.zoneId,
      groupId: request.groupId,
      tags: request.tags || [],
      apiKey: resolvedApiKey,
      rateLimitPerMin: 120,
      encryptionMethod: 'AES-256-GCM',
      status: 'offline',
      metrics: {},
      isSimulated: false,
    });

    if (request.macAddress) this.removeUnregisteredDevice(request.macAddress);
    if (request.ipAddress) this.removeUnregisteredDevice(request.ipAddress);
    if (request.pairingCode) this.removeUnregisteredDevice(request.pairingCode);

    const auditRecord: PairingAuditRecord = {
      id: 'pair_audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      deviceId: createdDev.id,
      deviceName: createdDev.name,
      tenantId: targetTenantId,
      tenantName,
      actorId: actor.id,
      actorName: actor.name,
      method: request.method,
      pairingCode: request.pairingCode,
      macAddress: request.macAddress,
      ipAddress: request.ipAddress,
      status: collision.hasCollision ? 'DUPLICATE_RESOLVED' : 'SUCCESS',
      resolutionAction: 'created_unique',
      details: collision.hasCollision
        ? `Çakışma çözüldü, benzersiz isimle oluşturuldu: "${createdDev.name}"`
        : `Başarılı yeni cihaz eşleştirmesi (${request.method})`,
      timestamp: new Date().toISOString(),
    };
    this.addPairingAudit(auditRecord);

    return {
      success: true,
      device: createdDev,
      message: 'Cihaz başarıyla eşleştirildi ve yetkilendirildi.',
      auditRecord,
    };
  }
}

