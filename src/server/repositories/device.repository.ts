import crypto from 'crypto';
import type { Device, DiscoveredNetworkDevice, TelemetryReading } from '../../types.js';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

export function generateDeviceKeyDetails(providedKey?: string): {
  rawKey: string;
  prefix: string;
  hash: string;
} {
  const rawKey = providedKey?.trim() || `nex_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(12).toString('hex')}`;
  const prefix = rawKey.substring(0, 12);
  const hash = hashApiKey(rawKey);
  return { rawKey, prefix, hash };
}

export class DeviceRepository {
  constructor(private db: any) {}

  public checkDeviceStatuses(): boolean {
    const now = Date.now();
    let hasChanges = false;
    this.db.data.devices.forEach((dev: Device) => {
      if (dev.status === 'maintenance') return;

      // 1. Virtual / Simulated Devices:
      // If user opened the device (dataFlowActive !== false), KEEP IT ONLINE permanently.
      if (dev.isSimulated) {
        if (dev.dataFlowActive !== false) {
          if (dev.status !== 'online') {
            dev.status = 'online';
            dev.lastSeen = new Date().toISOString();
            hasChanges = true;
          }
        } else {
          if (dev.status !== 'offline') {
            dev.status = 'offline';
            hasChanges = true;
          }
        }
        return;
      }

      // 2. Real Physical IoT Hardware Devices:
      if (!dev.lastSeen) {
        if (dev.status !== 'offline') {
          dev.status = 'offline';
          hasChanges = true;
        }
      } else {
        const elapsedMs = now - new Date(dev.lastSeen).getTime();
        // Configurable IoT Watchdog: Uses device.heartbeatTimeoutSeconds (default 300s / 5 mins)
        const timeoutSec = dev.heartbeatTimeoutSeconds && dev.heartbeatTimeoutSeconds > 0 ? dev.heartbeatTimeoutSeconds : 300;
        const offlineTimeoutMs = timeoutSec * 1000;
        const warningTimeoutMs = offlineTimeoutMs * 0.75;

        // If user manually switched device off (dataFlowActive === false), keep it offline
        if (dev.dataFlowActive === false) {
          if (dev.status !== 'offline') {
            dev.status = 'offline';
            hasChanges = true;
          }
        } else if (elapsedMs > offlineTimeoutMs) {
          if (dev.status !== 'offline') {
            dev.status = 'offline';
            hasChanges = true;

            const timeFormatted = timeoutSec >= 3600 
              ? `${(timeoutSec / 3600).toFixed(1).replace('.0', '')} saattir` 
              : `${Math.round(timeoutSec / 60)} dakikadır`;

            this.db.addAuditLog(
              dev.tenantId || 'system',
              'Sistem Sinyal Takibi',
              `Cihaz Sinyal Kesintisi: ${dev.name} (IP: ${dev.ipAddress || 'Bilinmiyor'}) ${timeFormatted} sinyal göndermedi. Otomatik ÇEVRİMDİŞİ yapıldı.`,
              'high'
            );

            this.db.addNotification({
              tenantId: dev.tenantId || 'usr_admin',
              title: `Cihaz Çevrimdışı (Sinyal Kesintisi)`,
              message: `${dev.name} cihazından ${timeFormatted} sinyal/veri alınamadı. Otomatik olarak ÇEVRİMDİŞİ durumuna geçti. Yeni veri/ping geldiğinde otomatik çevrimiçi olacaktır.`,
              severity: 'critical',
              deviceId: dev.id,
              deviceName: dev.name,
            });
          }
        } else if (elapsedMs > warningTimeoutMs) {
          if (dev.status === 'online') {
            dev.status = 'warning';
            hasChanges = true;
          }
        } else {
          if (dev.status !== 'online') {
            dev.status = 'online';
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      this.db.saveData(this.db.data);
    }
    return hasChanges;
  }

  public getUserTenants(userId: string): string[] {
    return (this.db.data.tenantMemberships || [])
      .filter((m: any) => m.tenantId === userId)
      .map((m: any) => m.tenantId);
  }

  public getDevices(requestingUserId?: string, targetCustomerId?: string): Device[] {
    this.checkDeviceStatuses();
    let list: Device[] = this.db.data.devices || [];
    const users = this.db.data.users || [];
    const reqUser = users.find((u: any) => u.id === requestingUserId);

    if (reqUser && reqUser.role === 'admin') {
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
          list = list.filter((d) => d.tenantId === targetCustomerId);
        }
      }
    } else if (requestingUserId) {
      const allowedTenants = this.getUserTenants(requestingUserId);
      if (!allowedTenants.includes(requestingUserId)) {
        allowedTenants.push(requestingUserId);
      }
      list = list.filter((d) => allowedTenants.includes(d.tenantId));
    }

    return list;
  }

  public assignDeviceOwner(deviceId: string, targetTenantId: string): Device | undefined {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (dev) {
      dev.tenantId = targetTenantId;
      this.db.saveData(this.db.data);
      this.db.postgresRepo?.saveDevice(dev).catch(() => {});
    }
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

  public createDevice(deviceData: Omit<Device, 'id' | 'apiKey' | 'lastSeen'> & { id?: string; apiKey?: string; isSimulated?: boolean; saveSimulatedDataToDb?: boolean }): Device {
    const newId = (deviceData.id && deviceData.id.trim()) ? deviceData.id.trim() : `dev_${Date.now()}`;
    const keyDetails = generateDeviceKeyDetails(deviceData.apiKey);
    const isSimulated = deviceData.isSimulated ?? false;
    const saveSimulatedDataToDb = deviceData.saveSimulatedDataToDb ?? false;

    let name = (deviceData.name || '').trim();
    if (isSimulated && !name.includes('[Sanal]') && !name.includes('(Sanal)')) {
      name = `[Sanal] ${name}`;
    }

    const newDevice: Device = {
      ...deviceData,
      name,
      isSimulated,
      saveSimulatedDataToDb,
      id: newId,
      apiKey: keyDetails.rawKey,
      apiKeyPrefix: keyDetails.prefix,
      apiKeyHash: keyDetails.hash,
      heartbeatTimeoutSeconds: deviceData.heartbeatTimeoutSeconds || 300,
      dataFlowActive: deviceData.dataFlowActive !== false,
      lastSeen: new Date().toISOString(),
    };

    if (!this.db.data.devices) this.db.data.devices = [];
    this.db.data.devices.push(newDevice);

    if (newDevice.ipAddress) this.removeUnregisteredDevice(newDevice.ipAddress);
    if (newDevice.macAddress) this.removeUnregisteredDevice(newDevice.macAddress);
    if (newDevice.name) this.removeUnregisteredDevice(newDevice.name);

    this.db.addAuditLog(
      deviceData.tenantId,
      'Sistem',
      `Yeni Cihaz Eklendi: ${newDevice.name} (IP: ${newDevice.ipAddress})`,
      'medium'
    );
    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    this.db.postgresRepo?.saveDevice(newDevice).catch(() => {});

    return newDevice;
  }

  public regenerateApiKey(deviceId: string): string {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    const keyDetails = generateDeviceKeyDetails();
    dev.apiKey = keyDetails.rawKey;
    dev.apiKeyPrefix = keyDetails.prefix;
    dev.apiKeyHash = keyDetails.hash;

    this.db.addAuditLog('system', 'API Manager', `Cihaz API Anahtarı Yenilendi: ${dev.name}`, 'high');
    this.db.saveData(this.db.data);

    // Sync to PostgreSQL Repository
    this.db.postgresRepo?.saveDevice(dev).catch(() => {});

    return dev.apiKey;
  }

  public convertToPhysicalDevice(deviceId: string, adminUserId = 'system', adminUserName = 'Yönetici'): Device {
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
    this.db.postgresRepo?.saveDevice(dev).catch(() => {});

    return dev;
  }

  public updateDevice(deviceId: string, updates: Partial<Device>): Device {
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
    if (updates.otaStatus !== undefined) dev.otaStatus = updates.otaStatus;
    if (updates.otaTargetFirmwareId !== undefined) dev.otaTargetFirmwareId = updates.otaTargetFirmwareId;
    if (updates.otaProgress !== undefined) dev.otaProgress = updates.otaProgress;
    if (updates.otaErrorMessage !== undefined) dev.otaErrorMessage = updates.otaErrorMessage;
    if (updates.otaLastCheckAt !== undefined) dev.otaLastCheckAt = updates.otaLastCheckAt;
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
    if (updates.heartbeatTimeoutSeconds !== undefined) dev.heartbeatTimeoutSeconds = updates.heartbeatTimeoutSeconds;
    if (updates.expectedIntervalSeconds !== undefined) dev.expectedIntervalSeconds = updates.expectedIntervalSeconds;
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
    this.db.postgresRepo?.saveDevice(dev).catch(() => {});

    return dev;
  }

  public deleteDevice(deviceId: string) {
    const index = this.db.data.devices.findIndex((d: Device) => d.id === deviceId);
    if (index !== -1) {
      const removed = this.db.data.devices.splice(index, 1)[0];
      this.db.addAuditLog('system', 'API Manager', `Cihaz Silindi: ${removed.name}`, 'medium');
      this.db.saveData(this.db.data);

      // Sync to PostgreSQL Repository
      this.db.postgresRepo?.deleteDevice(deviceId).catch(() => {});
    }
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
      if (d.tokenProvided && d.tokenProvided !== 'Yok' && d.tokenProvided.toLowerCase().trim() === target) return false;
      return true;
    });
    this.db.saveData(this.db.data);
  }

  public getDiscoveredDevices(requestingUserId?: string, targetCustomerId?: string): DiscoveredNetworkDevice[] {
    const allDevices: Device[] = this.db.data.devices || [];

    // Determine admin privilege (fail-closed: require explicit admin user)
    let isAdmin = false;
    if (requestingUserId) {
      const user = this.db.data.users?.find((u: any) => u.id === requestingUserId);
      if (user?.role === 'admin' || requestingUserId === 'usr_admin') {
        isAdmin = true;
      }
    }

    // Filter devices based on tenant permission
    let allowedDevices = allDevices;
    if (!isAdmin) {
      // Non-admin users ONLY see devices from their assigned tenants
      const allowedTenants = requestingUserId ? this.getUserTenants(requestingUserId) : [];
      allowedDevices = allDevices.filter((d: Device) => allowedTenants.includes(d.tenantId));
    } else if (targetCustomerId && targetCustomerId !== 'all') {
      allowedDevices = allDevices.filter((d: Device) => d.tenantId === targetCustomerId);
    }

    const registeredDiscovered: DiscoveredNetworkDevice[] = allowedDevices.map((d: Device) => {
      const metricsText = d.metrics ? Object.entries(d.metrics).map(([k, v]) => `${k}:${v}`).join(', ') : 'Veri akışı aktif';
      return {
        ip: d.ipAddress && d.ipAddress.trim() !== '' ? d.ipAddress : '—',
        mac: d.macAddress && d.macAddress.trim() !== '' ? d.macAddress : '—',
        hostname: d.name,
        vendor: d.type === 'sensor' ? 'Espressif (NodeMCU)' : d.type || 'IoT Cihazı',
        openPorts: [], // Real ports will be populated by field agents
        status: d.status === 'online' ? 'transmitting' : 'idle',
        pingMs: d.pingMs,
        rssi: d.rssi,
        lastPacket: metricsText,
        registeredDeviceId: d.id,
        lastSeen: d.lastSeen,
        tenantId: d.tenantId,
      };
    });

    const registeredIps = new Set(
      registeredDiscovered
        .map((rd) => rd.ip.toLowerCase().trim())
        .filter((ip) => ip && ip !== '—')
    );
    const registeredMacs = new Set(
      registeredDiscovered
        .map((rd) => rd.mac.toLowerCase().trim())
        .filter((mac) => mac && mac !== '—')
    );

    // Filter unregistered devices matching visibility
    const unregList = (this.db.data.unregisteredDevices || [])
      .filter((d: DiscoveredNetworkDevice) => {
        // Exclude any legacy fake gateway mock entries
        if (d.hostname === 'Fiber-Modem-Gateway' || (d.ip === '192.168.1.1' && d.vendor?.includes('Zyxel'))) {
          return false;
        }

        const ipClean = d.ip ? d.ip.toLowerCase().trim() : '';
        const macClean = d.mac ? d.mac.toLowerCase().trim() : '';
        if (ipClean && registeredIps.has(ipClean)) return false;
        if (macClean && registeredMacs.has(macClean)) return false;

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

    return [...registeredDiscovered, ...unregList];
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
}
