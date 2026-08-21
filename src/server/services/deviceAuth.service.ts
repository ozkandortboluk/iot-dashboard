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
        vendor: unregName.toLowerCase().includes('nodemcu')
          ? 'Espressif (NodeMCU)'
          : unregName.toLowerCase().includes('esp')
          ? 'Espressif (ESP32/ESP8266)'
          : 'IoT Cihazı',
        openPorts: [80, 3000],
        status: 'unregistered',
        pingMs: 12,
        rssi: -60,
        lastPacket: rawBodyText ? `${rawBodyText} (Token / DeviceId Eksik)` : 'Token / DeviceId Gönderilmedi (Eksik Paket)',
        tokenProvided: 'Yok',
        lastSeen: new Date().toISOString(),
      });

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
        vendor: unregName.toLowerCase().includes('nodemcu')
          ? 'Espressif (NodeMCU)'
          : unregName.toLowerCase().includes('esp')
          ? 'Espressif (ESP32/ESP8266)'
          : 'IoT Cihazı',
        openPorts: [80, 3000],
        status: 'unregistered',
        pingMs: 14,
        rssi: -62,
        lastPacket: rawBodyText ? `${rawBodyText} (Kayıtsız Cihaz: ${token})` : `Kayıtsız Cihaz Kimliği: ${token}`,
        tokenProvided: token,
        lastSeen: new Date().toISOString(),
      });

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

    // Automatically convert simulated device to real hardware upon receiving real physical telemetry
    if (device.isSimulated) {
      console.log(`[Device Auth] Fiziki donanımdan canlı veri alındı: ${device.name} (${device.id}). Simülatör modu kapatıldı.`);
      device.isSimulated = false;
      device.saveSimulatedDataToDb = false;
      if (device.name.includes('[Sanal]')) {
        device.name = device.name.replace(/\[Sanal\]\s*/gi, '').trim();
      }
      // Reset simulator dummy metrics so they do not pollute real sensor readings
      device.metrics = {};
      db.updateDevice(device.id, {
        isSimulated: false,
        saveSimulatedDataToDb: false,
        name: device.name,
        metrics: {},
      });
      broadcast('device:updated', device);
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
