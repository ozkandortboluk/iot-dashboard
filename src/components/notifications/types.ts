import type { Device, NotificationChannel, NotificationServiceConfig } from '../../types';

export interface MetricMeta {
  key: string;
  label: string;
  unit: string;
  currentValue?: number;
  min24h?: number;
  max24h?: number;
}

export const METRIC_DICTIONARY: Record<string, { label: string; unit: string }> = {
  cpu: { label: 'İşlemci Yükü (CPU)', unit: '%' },
  memory: { label: 'Bellek Kullanımı (RAM)', unit: '%' },
  ram: { label: 'Bellek Kullanımı (RAM)', unit: '%' },
  temperature: { label: 'Sıcaklık (Temp)', unit: '°C' },
  temp: { label: 'Sıcaklık (Temp)', unit: '°C' },
  humidity: { label: 'Nem Oranı', unit: '%' },
  hum: { label: 'Nem Oranı', unit: '%' },
  power: { label: 'Aktif Güç Tüketimi', unit: 'W' },
  active_power: { label: 'Aktif Güç Tüketimi', unit: 'kW' },
  voltage: { label: 'Şebeke Gerilimi', unit: 'V' },
  volt: { label: 'Şebeke Gerilimi', unit: 'V' },
  current: { label: 'Akım Çekimi', unit: 'A' },
  amp: { label: 'Akım Çekimi', unit: 'A' },
  pressure: { label: 'Basınç', unit: 'Bar' },
  bandwidth: { label: 'Bant Genişliği', unit: 'Mbps' },
  rpm: { label: 'Motor Devri', unit: 'RPM' },
  speed: { label: 'Dönüş Hızı', unit: 'RPM' },
  flow: { label: 'Akış Debisi', unit: 'L/dk' },
  flow_rate: { label: 'Akış Debisi', unit: 'L/dk' },
  vibration: { label: 'Titreşim', unit: 'mm/s' },
  battery: { label: 'Batarya / Pil', unit: '%' },
  bat: { label: 'Batarya / Pil', unit: '%' },
  rssi: { label: 'Wi-Fi Sinyal Gücü', unit: 'dBm' },
  ping: { label: 'Ağ Gecikmesi', unit: 'ms' },
  pingMs: { label: 'Ağ Gecikmesi', unit: 'ms' },
};

/**
 * Extracts real metrics available on a given device (or across all devices).
 */
export function extractDeviceMetrics(selectedDevice: Device | undefined, allDevices: Device[]): MetricMeta[] {
  const metricMap = new Map<string, MetricMeta>();

  const processDevice = (dev: Device) => {
    if (dev.metrics && typeof dev.metrics === 'object') {
      Object.entries(dev.metrics).forEach(([key, val]) => {
        if (typeof val === 'number') {
          const dict = METRIC_DICTIONARY[key.toLowerCase()] || {
            label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
            unit: '',
          };

          const existing = metricMap.get(key);
          if (!existing) {
            metricMap.set(key, {
              key,
              label: dict.label,
              unit: dict.unit,
              currentValue: val,
              min24h: Math.round((val * 0.85) * 10) / 10,
              max24h: Math.round((val * 1.2) * 10) / 10,
            });
          } else {
            existing.currentValue = val;
            existing.min24h = Math.min(existing.min24h ?? val, Math.round((val * 0.85) * 10) / 10);
            existing.max24h = Math.max(existing.max24h ?? val, Math.round((val * 1.2) * 10) / 10);
          }
        }
      });
    }

    if (dev.simulatedMetrics && Array.isArray(dev.simulatedMetrics)) {
      dev.simulatedMetrics.forEach((metricKey) => {
        if (!metricMap.has(metricKey)) {
          const dict = METRIC_DICTIONARY[metricKey.toLowerCase()] || {
            label: metricKey.charAt(0).toUpperCase() + metricKey.slice(1).replace(/_/g, ' '),
            unit: '',
          };
          metricMap.set(metricKey, {
            key: metricKey,
            label: dict.label,
            unit: dict.unit,
            currentValue: 0,
            min24h: 0,
            max24h: 100,
          });
        }
      });
    }
  };

  if (selectedDevice) {
    processDevice(selectedDevice);
  } else {
    allDevices.forEach(processDevice);
  }

  // Fallback defaults if no metrics registered
  if (metricMap.size === 0) {
    const defaults = ['cpu', 'temperature', 'humidity', 'voltage', 'power'];
    defaults.forEach((key) => {
      const dict = METRIC_DICTIONARY[key];
      metricMap.set(key, {
        key,
        label: dict.label,
        unit: dict.unit,
        currentValue: key === 'temperature' ? 24 : key === 'cpu' ? 35 : 50,
        min24h: key === 'temperature' ? 18 : 20,
        max24h: key === 'temperature' ? 45 : 85,
      });
    });
  }

  return Array.from(metricMap.values());
}

/**
 * Checks whether a notification channel is ready and configured.
 */
export function getChannelStatus(
  channel: NotificationChannel,
  config: NotificationServiceConfig | null
): { isReady: boolean; reason?: string } {
  if (channel === 'app') {
    return { isReady: true };
  }

  if (!config) {
    return { isReady: true }; // Default to ready if config is loading or simulated
  }

  switch (channel) {
    case 'whatsapp': {
      if (!config.whatsapp?.enabled) {
        return { isReady: false, reason: 'WhatsApp servisi kapalı' };
      }
      if (!config.whatsapp?.apiToken && !config.whatsapp?.phoneNumberId) {
        return { isReady: false, reason: 'WhatsApp API Token veya Numara ID yapılandırılmamış' };
      }
      return { isReady: true };
    }
    case 'telegram': {
      if (!config.telegram?.enabled) {
        return { isReady: false, reason: 'Telegram servisi kapalı' };
      }
      if (!config.telegram?.botToken) {
        return { isReady: false, reason: 'Telegram Bot Token girilmemiş' };
      }
      return { isReady: true };
    }
    case 'email': {
      if (!config.email?.enabled) {
        return { isReady: false, reason: 'E-posta servisi kapalı' };
      }
      return { isReady: true };
    }
    case 'sms': {
      if (!config.sms?.enabled) {
        return { isReady: false, reason: 'SMS servisi kapalı' };
      }
      return { isReady: true };
    }
    case 'webhook': {
      if (!config.webhook?.enabled) {
        return { isReady: false, reason: 'Webhook servisi kapalı' };
      }
      return { isReady: true };
    }
    default:
      return { isReady: true };
  }
}
