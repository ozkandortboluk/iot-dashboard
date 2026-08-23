import type { User, Device, WidgetConfig, ThresholdRule, NotificationItem, TelemetryReading } from '../types.js';

export const initialUsers: User[] = [];

export const initialDevices: Device[] = [];

export const defaultWidgets: WidgetConfig[] = [
  {
    id: 'w_power_analyzer',
    title: 'Elektrik Sayacı & Reaktif Analizör',
    type: 'power_analyzer',
    span: 2,
    colorScheme: '#f59e0b',
  },
  {
    id: 'w_cpu_area',
    title: 'Sunucu İşlemci (CPU) ve Bellek Yükü',
    type: 'area_chart',
    metricKey: 'cpu',
    span: 2,
    colorScheme: '#3b82f6',
    thresholdWarning: 75,
    thresholdCritical: 90,
  },
  {
    id: 'w_temp_line',
    title: 'Saha Ortam Sıcaklığı (°C)',
    type: 'line_chart',
    metricKey: 'temperature',
    span: 2,
    colorScheme: '#f59e0b',
    thresholdWarning: 35,
    thresholdCritical: 45,
  },
  {
    id: 'w_power_gauge',
    title: 'Toplam Güç Tüketimi (kW)',
    type: 'gauge',
    metricKey: 'power',
    span: 1,
    colorScheme: '#10b981',
    thresholdWarning: 100,
    thresholdCritical: 140,
  },
  {
    id: 'w_metric_cpu',
    title: 'Ortalama CPU Kullanımı',
    type: 'metric',
    metricKey: 'cpu',
    span: 1,
    colorScheme: '#3b82f6',
  },
  {
    id: 'w_metric_temp',
    title: 'Ortalama Merkez Sıcaklığı',
    type: 'metric',
    metricKey: 'temperature',
    span: 1,
    colorScheme: '#f97316',
  },
  {
    id: 'w_devices_grid',
    title: 'Bağlı Cihazlar & Canlı Durumlar',
    type: 'devices_status',
    span: 1,
    colorScheme: '#8b5cf6',
  },
  {
    id: 'w_log_stream',
    title: 'Gerçek Zamanlı API Ingestion Konsolu',
    type: 'log_stream',
    span: 2,
    colorScheme: '#06b6d4',
  },
  {
    id: 'w_notifications',
    title: 'Son Sistem Bildirimleri',
    type: 'notifications',
    span: 2,
    colorScheme: '#ec4899',
  },
];

export const initialRules: ThresholdRule[] = [];

export const initialNotifications: NotificationItem[] = [];

export function generateHistoricalTelemetry(): TelemetryReading[] {
  const readings: TelemetryReading[] = [];
  const now = Date.now();
  const devices = initialDevices;

  for (let i = 60; i >= 0; i--) {
    const timestamp = new Date(now - i * 120000).toISOString();

    devices.forEach((dev) => {
      if (dev.type === 'server') {
        const cpu = Math.max(15, Math.min(98, 40 + Math.sin(i / 5) * 20 + Math.random() * 10));
        const memory = Math.max(30, Math.min(95, 60 + Math.cos(i / 4) * 15 + Math.random() * 5));
        readings.push({
          id: `tel_${dev.id}_cpu_${i}`,
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp,
          metric: 'cpu',
          value: Number(cpu.toFixed(1)),
          unit: '%',
          status: cpu > 85 ? 'critical' : cpu > 70 ? 'warning' : 'normal',
          source: 'simulator',
          environment: 'sandbox',
          simulationRunId: 'sim_run_seed',
        });
        readings.push({
          id: `tel_${dev.id}_mem_${i}`,
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp,
          metric: 'memory',
          value: Number(memory.toFixed(1)),
          unit: '%',
          status: memory > 85 ? 'critical' : memory > 75 ? 'warning' : 'normal',
          source: 'simulator',
          environment: 'sandbox',
          simulationRunId: 'sim_run_seed',
        });
      } else if (dev.type === 'sensor') {
        const temp = Number((22 + Math.sin(i / 8) * 4 + Math.random() * 1.5).toFixed(1));
        const hum = Number((55 + Math.cos(i / 6) * 10 + Math.random() * 3).toFixed(1));
        readings.push({
          id: `tel_${dev.id}_temp_${i}`,
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp,
          metric: 'temperature',
          value: temp,
          unit: '°C',
          status: temp > 35 ? 'warning' : 'normal',
          source: 'simulator',
          environment: 'sandbox',
          simulationRunId: 'sim_run_seed',
        });
        readings.push({
          id: `tel_${dev.id}_hum_${i}`,
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp,
          metric: 'humidity',
          value: hum,
          unit: '%',
          status: 'normal',
          source: 'simulator',
          environment: 'sandbox',
          simulationRunId: 'sim_run_seed',
        });
      } else if (dev.type === 'meter' || dev.type === 'inverter') {
        const pwr = Number((80 + Math.sin(i / 4) * 35 + Math.random() * 8).toFixed(1));
        readings.push({
          id: `tel_${dev.id}_pwr_${i}`,
          deviceId: dev.id,
          deviceName: dev.name,
          timestamp,
          metric: 'power',
          value: pwr,
          unit: 'kW',
          status: pwr > 110 ? 'warning' : 'normal',
          source: 'simulator',
          environment: 'sandbox',
          simulationRunId: 'sim_run_seed',
        });
      }
    });
  }

  return readings;
}
