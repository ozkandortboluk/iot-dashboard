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

      if (!dev.lastSeen) {
        if (dev.status !== 'offline') {
          dev.status = 'offline';
          hasChanges = true;
        }
      } else {
        const elapsedMs = now - new Date(dev.lastSeen).getTime();
        // If data flow is disabled or no telemetry received for > 40 seconds, automatically mark offline
        if (dev.dataFlowActive === false || elapsedMs > 40000) {
          if (dev.status !== 'offline') {
            dev.status = 'offline';
            hasChanges = true;

            this.db.addAuditLog(
              dev.userId || 'system',
              'Sistem Sinyal Takibi',
              `Cihaz Sinyal Kesintisi: ${dev.name} (IP: ${dev.ipAddress}) 40 saniyedir sinyal göndermedi. Otomatik ÇEVRİMDİŞİ yapıldı.`,
              'high'
            );

            this.db.addNotification({
              userId: dev.userId || 'usr_admin',
              title: `Cihaz Çevrimdışı (Sinyal Kesintisi)`,
              message: `${dev.name} cihazından 40 saniyedir sinyal/veri alınamadı. Otomatik olarak ÇEVRİMDİŞİ durumuna geçti.`,
              severity: 'critical',
              deviceId: dev.id,
              deviceName: dev.name,
            });
          }
        } else if (elapsedMs > 18000) {
          if (dev.status === 'online') {
            dev.status = 'warning';
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

  public getDevices(requestingUserId?: string, targetCustomerId?: string): Device[] {
    this.checkDeviceStatuses();
    let list: Device[] = this.db.data.devices || [];
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);

    if (reqUser && reqUser.role === 'admin') {
      if (targetCustomerId && targetCustomerId !== 'all') {
        list = list.filter((d) => d.userId === targetCustomerId);
      }
    } else if (requestingUserId) {
      list = list.filter((d) => d.userId === requestingUserId);
    }

    return list;
  }

  public assignDeviceOwner(deviceId: string, targetUserId: string): Device | undefined {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (dev) {
      dev.userId = targetUserId;
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
      if (d.apiKey && d.apiKey === token) return true;
      return false;
    });
  }

  public createDevice(deviceData: Omit<Device, 'id' | 'apiKey' | 'lastSeen'> & { apiKey?: string; isSimulated?: boolean; saveSimulatedDataToDb?: boolean }): Device {
    const newId = `dev_${Date.now()}`;
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
      lastSeen: new Date().toISOString(),
    };

    if (!this.db.data.devices) this.db.data.devices = [];
    this.db.data.devices.push(newDevice);

    if (newDevice.ipAddress) this.removeUnregisteredDevice(newDevice.ipAddress);
    if (newDevice.macAddress) this.removeUnregisteredDevice(newDevice.macAddress);
    if (newDevice.name) this.removeUnregisteredDevice(newDevice.name);

    this.db.addAuditLog(
      deviceData.userId,
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

  public updateDevice(deviceId: string, updates: Partial<Device>): Device {
    const dev = this.db.data.devices.find((d: Device) => d.id === deviceId);
    if (!dev) throw new Error('Cihaz bulunamadı');

    const configKeys: (keyof Device)[] = [
      'name',
      'type',
      'location',
      'userId',
      'rateLimitPerMin',
      'encryptionMethod',
      'isSimulated',
      'saveSimulatedDataToDb',
      'simulatedMetrics',
    ];
    const isConfigUpdated = configKeys.some((k) => updates[k] !== undefined);

    if (updates.name !== undefined) dev.name = updates.name;
    if (updates.type !== undefined) dev.type = updates.type;
    if (updates.location !== undefined) dev.location = updates.location;
    if (updates.ipAddress !== undefined) dev.ipAddress = updates.ipAddress;
    if (updates.macAddress !== undefined) dev.macAddress = updates.macAddress;
    if (updates.userId !== undefined) dev.userId = updates.userId;
    if (updates.rateLimitPerMin !== undefined) dev.rateLimitPerMin = updates.rateLimitPerMin;
    if (updates.encryptionMethod !== undefined) dev.encryptionMethod = updates.encryptionMethod;
    if (updates.isSimulated !== undefined) dev.isSimulated = updates.isSimulated;
    if (updates.saveSimulatedDataToDb !== undefined) dev.saveSimulatedDataToDb = updates.saveSimulatedDataToDb;
    if (updates.simulatedMetrics !== undefined) dev.simulatedMetrics = updates.simulatedMetrics;
    if (updates.metrics !== undefined) {
      dev.metrics = {
        ...(dev.metrics || {}),
        ...updates.metrics,
      };
    }
    if (updates.lastSeen !== undefined) dev.lastSeen = updates.lastSeen;

    if (updates.apiKey !== undefined && updates.apiKey.trim()) {
      dev.apiKey = updates.apiKey.trim();
      this.db.addAuditLog('system', 'API Manager', `Cihaz Manuel Token / API Key Güncellendi: ${dev.name}`, 'high');
    }

    if (updates.dataFlowActive !== undefined) {
      dev.dataFlowActive = updates.dataFlowActive;
      if (updates.dataFlowActive === true) {
        dev.lastSeen = new Date().toISOString();
        dev.status = 'online';
      }
    }

    if (updates.status !== undefined) {
      dev.status = updates.status;
      if (updates.status === 'offline') {
        dev.dataFlowActive = false;
      } else if (updates.status === 'online') {
        dev.dataFlowActive = true;
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

    const existingIndex = this.db.data.unregisteredDevices.findIndex((d: DiscoveredNetworkDevice) => {
      if (discDev.ip && d.ip === discDev.ip) return true;
      if (discDev.mac && d.mac === discDev.mac) return true;
      if (isRealToken(discDev.tokenProvided) && d.tokenProvided === discDev.tokenProvided) return true;
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
      const newItem: DiscoveredNetworkDevice = {
        ...discDev,
        status: 'unregistered',
        lastSeen: new Date().toISOString(),
      };
      this.db.data.unregisteredDevices.push(newItem);
      this.db.addAuditLog(
        'system',
        'Ağ Taraması',
        `Yeni Kayıtsız ESP/IoT Cihazı Ağda Tespit Edildi (IP: ${discDev.ip}, Token: ${discDev.tokenProvided || 'Yok'})`,
        'high'
      );
      this.db.saveData(this.db.data);
      return newItem;
    }
  }

  public removeUnregisteredDevice(ipOrMacOrToken: string) {
    if (!this.db.data.unregisteredDevices || !ipOrMacOrToken) return;
    const target = ipOrMacOrToken.toLowerCase().trim();
    this.db.data.unregisteredDevices = this.db.data.unregisteredDevices.filter((d: DiscoveredNetworkDevice) => {
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

    // Determine admin privilege
    let isAdmin = !requestingUserId || requestingUserId === 'usr_admin';
    if (requestingUserId && !isAdmin) {
      const user = this.db.data.users?.find((u: any) => u.id === requestingUserId);
      if (user?.role === 'admin') isAdmin = true;
    }

    // Filter devices based on tenant permission
    let allowedDevices = allDevices;
    if (!isAdmin) {
      // Non-admin customers ONLY see their own devices
      allowedDevices = allDevices.filter((d: Device) => d.userId === requestingUserId);
    } else if (targetCustomerId && targetCustomerId !== 'all') {
      allowedDevices = allDevices.filter((d: Device) => d.userId === targetCustomerId);
    }

    const registeredDiscovered: DiscoveredNetworkDevice[] = allowedDevices.map((d: Device) => {
      const metricsText = d.metrics ? Object.entries(d.metrics).map(([k, v]) => `${k}:${v}`).join(', ') : 'Veri akışı aktif';
      return {
        ip: d.ipAddress && d.ipAddress.trim() !== '' ? d.ipAddress : '—',
        mac: d.macAddress && d.macAddress.trim() !== '' ? d.macAddress : '—',
        hostname: d.name,
        vendor: d.type === 'sensor' ? 'Espressif (NodeMCU)' : d.type || 'IoT Cihazı',
        openPorts: [80, 3000],
        status: d.status === 'online' ? 'transmitting' : 'idle',
        pingMs: d.status === 'online' ? (d.pingMs || 8) : 0,
        rssi: d.status === 'online' ? (d.rssi || -55) : -85,
        lastPacket: metricsText,
        registeredDeviceId: d.id,
        lastSeen: d.lastSeen,
        userId: d.userId,
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
          // If non-admin, only show unregistered devices explicitly tagged with userId or on same subnet
          if (d.userId && d.userId === requestingUserId) return true;
          const userSubnets = Array.from(registeredIps).map((ip) => ip.split('.').slice(0, 3).join('.')).filter(Boolean);
          if (ipClean && userSubnets.some((sub) => ipClean.startsWith(sub))) return true;
          return false;
        }

        return true;
      })
      .map((d: DiscoveredNetworkDevice) => ({
        ...d,
        status: 'unregistered' as const,
      }));

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
