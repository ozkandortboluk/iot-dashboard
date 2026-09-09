import { db } from '../db.js';
import { broadcast } from './websocket.js';
import { rateLimiterService } from './rateLimiter.service.js';
import type { Device } from '../../types.js';
import type { ParsedTelemetryPayload } from '../utils/telemetry.parser.js';

export interface DeviceAuthResult {
  success: boolean;
  device?: Device;
  httpStatus?: number;
  errorResponse?: any;
  devInfoUpdated?: boolean;
  rateLimitHeaders?: Record<string, string>;
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    resetTime: number;
  };
}

export class DeviceAuthService {
  public authenticateDevice(payload: ParsedTelemetryPayload): DeviceAuthResult {
    const { token, deviceNameFromPayload, rawBodyText, clientIp, mac } = payload;

    // 0. Pre-Authentication IP Rate Limit Protection (Anti-DoS for open IoT API)
    const ipRateLimit = rateLimiterService.checkIpRateLimit(clientIp, 300);
    if (!ipRateLimit.allowed) {
      return {
        success: false,
        httpStatus: 429,
        rateLimitHeaders: {
          'Retry-After': String(ipRateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(ipRateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(ipRateLimit.resetTime),
        },
        errorResponse: {
          error: 'IP tabanlı istek limiti aşıldı (Too Many Requests from IP)!',
          status: 'rate_limited',
          ip: clientIp,
          retryAfterSeconds: ipRateLimit.retryAfterSeconds,
          message: 'Bu IP adresinden çok yüksek frekansta istek geldi. Lütfen istek sıklığını düşürün.',
        },
      };
    }

    // 1. Missing Token Check
    if (!token) {
      const unregName = deviceNameFromPayload || (clientIp ? `ESP-Device-${clientIp.split('.').pop()}` : 'ESP-Device');
      const unreg = db.recordUnregisteredDevice({
        ip: clientIp || '—',
        mac: mac || '—',
        hostname: unregName,
        vendor: payload.hardwareModel || (unregName.toLowerCase().includes('nodemcu')
          ? 'Espressif (NodeMCU)'
          : unregName.toLowerCase().includes('esp')
          ? 'Espressif (ESP32/ESP8266)'
          : 'IoT Cihazı'),
        openPorts: [],
        status: 'unregistered',
        lastPacket: rawBodyText ? `${rawBodyText} (Token / DeviceId Eksik)` : 'Token / DeviceId Gönderilmedi (Eksik Paket)',
        tokenProvided: 'Yok',
        pairingCode: payload.pairingCode,
        hardwareModel: payload.hardwareModel,
        roleKey: payload.roleKey,
        firmwareVersion: payload.firmwareVersion,
        lastSeen: new Date().toISOString(),
      } as any);

      if (unreg) {
        broadcast('network:unregistered_device', unreg);
      }
      broadcast('network:updated', db.getDiscoveredDevices());

      return {
        success: false,
        httpStatus: 401,
        errorResponse: {
          error: 'Yetkisiz erişim. Cihaz kimliği (deviceId, apiKey veya token) eksik!',
          status: 'unregistered',
          ip: clientIp || '—',
          mac: mac || '—',
          message:
            'Cihazınız ağda "Kayıtsız Cihaz" olarak kaydedildi. Web Paneli > Ağ Taraması sayfasından "Sisteme Katıl" butonuna basarak cihazınızı kaydedebilirsiniz.',
          expectedFormat: {
            deviceId: 'dev_123456',
            metrics: {
              temperature: { value: 24.7, unit: '°C' },
              humidity: { value: 58.2, unit: '%' },
            },
          },
        },
      };
    }

    // 2. Lookup Device in Database strictly by API Key
    const device = db.getDeviceByApiKey(token);

    // 3. Unregistered/Invalid Token Device Check
    if (!device) {
      const unregName = deviceNameFromPayload || (token.length > 4 ? `ESP32-${token.slice(-4)}` : `ESP-${token}`);
      const unreg = db.recordUnregisteredDevice({
        ip: clientIp || '—',
        mac: mac || '—',
        hostname: unregName,
        vendor: payload.hardwareModel || (unregName.toLowerCase().includes('nodemcu')
          ? 'Espressif (NodeMCU)'
          : unregName.toLowerCase().includes('esp')
          ? 'Espressif (ESP32/ESP8266)'
          : 'IoT Cihazı'),
        openPorts: [],
        status: 'unregistered',
        lastPacket: rawBodyText ? `${rawBodyText} (Kayıtsız Cihaz: ${token})` : `Kayıtsız Cihaz Kimliği: ${token}`,
        tokenProvided: token,
        pairingCode: payload.pairingCode,
        hardwareModel: payload.hardwareModel,
        roleKey: payload.roleKey,
        firmwareVersion: payload.firmwareVersion,
        lastSeen: new Date().toISOString(),
      } as any);

      if (unreg) {
        broadcast('network:unregistered_device', unreg);
      }
      broadcast('network:updated', db.getDiscoveredDevices());

      return {
        success: false,
        httpStatus: 403,
        errorResponse: {
          error: 'Geçersiz veya sistemde kayıtlı olmayan API Token!',
          tokenProvided: token,
          ip: clientIp || '—',
          mac: mac || '—',
          status: 'unregistered',
          message:
            'Cihazınız ağda "Kayıtsız Cihaz" olarak kaydedildi. Web Paneli > Cihazlar veya Ağ Taraması sayfasından cihazınızı sisteme ekleyebilirsiniz.',
        },
      };
    }

    // 3.1. API Key Revocation Check
    if (device.apiKeyRevoked === true) {
      return {
        success: false,
        httpStatus: 401,
        errorResponse: {
          error: 'api_key_revoked',
          status: 'unauthorized',
          deviceId: device.id,
          deviceName: device.name,
          message: 'Bu cihazın API anahtarı iptal edilmiştir (Revoked). Lütfen yönetim panelinden yeni bir anahtar oluşturun.',
        },
      };
    }

    // 3.2. API Key Expiry Check
    if (device.apiKeyExpiresAt && new Date(device.apiKeyExpiresAt).getTime() < Date.now()) {
      return {
        success: false,
        httpStatus: 401,
        errorResponse: {
          error: 'api_key_expired',
          status: 'unauthorized',
          deviceId: device.id,
          deviceName: device.name,
          expiresAt: device.apiKeyExpiresAt,
          message: 'Bu cihazın API anahtarının geçerlilik süresi dolmuştur (Expired).',
        },
      };
    }

    // 3.3. API Key Scope Permission Check (Requires telemetry:write or all)
    if (
      device.apiKeyScopes &&
      Array.isArray(device.apiKeyScopes) &&
      device.apiKeyScopes.length > 0 &&
      !device.apiKeyScopes.includes('all') &&
      !device.apiKeyScopes.includes('telemetry:write')
    ) {
      return {
        success: false,
        httpStatus: 403,
        errorResponse: {
          error: 'insufficient_api_key_scope',
          status: 'forbidden',
          deviceId: device.id,
          deviceName: device.name,
          grantedScopes: device.apiKeyScopes,
          requiredScope: 'telemetry:write',
          message: 'Bu cihaz API anahtarı telemetri verisi yazma ("telemetry:write") yetkisine sahip değildir.',
        },
      };
    }

    // Update Last-Used Timestamp
    device.apiKeyLastUsedAt = new Date().toISOString();

    // 4. Device ID Verification & Auto-Resolution
    // If device is authenticated via valid API Key, we accept it.
    // We only alert if the payload explicitly contains another distinct registered device's ID.
    if (
      payload.deviceIdFromPayload &&
      payload.deviceIdFromPayload !== device.id &&
      payload.deviceIdFromPayload !== device.name &&
      payload.deviceIdFromPayload !== device.apiKey &&
      payload.deviceIdFromPayload !== device.apiKeyPrefix &&
      payload.deviceIdFromPayload !== token &&
      payload.deviceIdFromPayload !== payload.token
    ) {
      // Check if payload specified an ID of a DIFFERENT registered device
      const conflictingDevice = (db.getDevices() || []).find(
        (d: Device) => d.id === payload.deviceIdFromPayload && d.id !== device.id
      );

      if (conflictingDevice) {
        console.warn(`[Device Auth Mismatch] API key belongs to device ${device.id} (${device.name}), but payload specified another device's ID (${conflictingDevice.id} / ${conflictingDevice.name})`);
        return {
          success: false,
          httpStatus: 403,
          errorResponse: {
            error: 'device_id_mismatch',
            message: `Kullanılan API Key "${device.name}" (${device.id}) cihazına ait; ancak gönderilen pakette başka bir cihazın (${conflictingDevice.name} / ${conflictingDevice.id}) ID'si belirtilmiş!`,
            authenticatedDeviceId: device.id,
            authenticatedDeviceName: device.name,
            payloadDeviceId: payload.deviceIdFromPayload,
          },
        };
      }
      // If it's just a custom label or hardware alias (e.g. NEXUS_DEV_982341), accept it smoothly
    }

    // 4. Check If Device Data Flow Is Disabled (Offline Mode)
    if (device.dataFlowActive === false) {
      return {
        success: false,
        httpStatus: 200,
        errorResponse: {
          status: 'offline',
          message: 'Cihaz veri akışı panellerden kapatıldı (Offline modu). Gönderilen telemetri işlenmedi.',
        },
      };
    }

    // 4.5. Reject Physical Telemetry For Simulated Devices (Strict Isolation)
    if (device.isSimulated) {
      return {
        success: false,
        httpStatus: 403,
        errorResponse: {
          error: 'simulated_device_not_allowed',
          message: 'Sanal cihaz gerçek telemetri API’sini kullanamaz.',
        },
      };
    }

    // 4.6. Strict Tenant Isolation Check (Fail-Closed: A device must have a verified tenant assigned)
    if (!device.tenantId || typeof device.tenantId !== 'string' || device.tenantId.trim() === '') {
      return {
        success: false,
        httpStatus: 403,
        errorResponse: {
          error: 'tenant_missing_forbidden',
          status: 'unassigned_device',
          deviceId: device.id,
          deviceName: device.name,
          message: 'Bu cihaz herhangi bir müşteri/tenant hesabına atanmamış (Eksik tenantId). Güvenlik ve tenant izolasyonu gereği telemetri işlenemez.',
        },
      };
    }

    // 5. Check Device-Specific Rate Limit (rateLimitPerMin)
    const configuredLimit = device.rateLimitPerMin || 120;
    const deviceRateLimit = rateLimiterService.checkDeviceRateLimit(device.id, configuredLimit);

    if (!deviceRateLimit.allowed) {
      return {
        success: false,
        httpStatus: 429,
        rateLimitHeaders: {
          'Retry-After': String(deviceRateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(deviceRateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(deviceRateLimit.resetTime),
        },
        errorResponse: {
          error: 'Cihaz istek limiti (Rate Limit) aşıldı!',
          status: 'rate_limited',
          deviceId: device.id,
          deviceName: device.name,
          rateLimitPerMin: deviceRateLimit.limit,
          currentRequestsInWindow: deviceRateLimit.currentCount,
          retryAfterSeconds: deviceRateLimit.retryAfterSeconds,
          message: `Bu cihaz için tanımlı dakikalık telemetri kotası (${deviceRateLimit.limit} paket/dk) aşıldı. Lütfen ESP yazılımınızdaki telemetri gönderme aralığını (örneğin delay / millis timer) artırın.`,
        },
      };
    }

    // 6. Update Device Network Info & Last Seen
    const statusWasOffline = device.status === 'offline';
    device.status = 'online';
    device.dataFlowActive = true;
    device.lastSeen = new Date().toISOString();
    let devInfoUpdated = statusWasOffline;

    if (clientIp && (!device.ipAddress || device.ipAddress.includes('0.0.0.0'))) {
      device.ipAddress = clientIp;
      devInfoUpdated = true;
    }
    if (mac && !device.macAddress) {
      device.macAddress = mac;
      devInfoUpdated = true;
    }

    return {
      success: true,
      device,
      devInfoUpdated,
      rateLimitHeaders: {
        'X-RateLimit-Limit': String(deviceRateLimit.limit),
        'X-RateLimit-Remaining': String(deviceRateLimit.remaining),
        'X-RateLimit-Reset': String(deviceRateLimit.resetTime),
      },
      rateLimitInfo: {
        limit: deviceRateLimit.limit,
        remaining: deviceRateLimit.remaining,
        resetTime: deviceRateLimit.resetTime,
      },
    };
  }
}

export const deviceAuthService = new DeviceAuthService();
