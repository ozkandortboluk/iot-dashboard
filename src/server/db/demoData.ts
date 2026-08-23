import crypto from 'crypto';
import type { Device, TelemetryReading, ThresholdRule, NotificationItem } from '../../types.js';

export function seedDemoDataForDatabase(
  dbInstance: any,
  userId: string,
  userName: string,
  companyName: string,
  email: string
) {
  const genSecureKey = (prefix: string) => `dev_key_${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  const demoDevices: Device[] = [
    {
      id: 'dev_01_istanbul',
      userId: userId,
      name: '[Sanal] İstanbul Akıllı Lojistik İklim Sensörü',
      type: 'sensor',
      apiKey: genSecureKey('ist'),
      status: 'online',
      location: 'İstanbul / Maslak - Depo 1',
      ipAddress: '192.168.1.102',
      lastSeen: new Date().toISOString(),
      rateLimitPerMin: 120,
      encryptionMethod: 'AES-256-GCM',
      isSimulated: true,
      metrics: { temperature: 24.5, humidity: 58.2, pressure: 1013.2 },
    },
    {
      id: 'dev_03_bursa',
      userId: userId,
      name: '[Sanal] Bursa Fabrika #4 Akıllı Sayaç',
      type: 'meter',
      apiKey: genSecureKey('brs'),
      status: 'warning',
      location: 'Bursa Organize Sanayi - Hat 4',
      ipAddress: '192.168.10.45',
      lastSeen: new Date().toISOString(),
      rateLimitPerMin: 60,
      encryptionMethod: 'AES-256-GCM',
      isSimulated: true,
      metrics: { power: 84.2, voltage: 228.5, temperature: 41.2 },
    },
    {
      id: 'dev_02_frankfurt',
      userId: userId,
      name: '[Sanal] Frankfurt Bulut Sunucu Düğümü Alpha',
      type: 'server',
      apiKey: genSecureKey('fra'),
      status: 'online',
      location: 'Frankfurt DC - Kabin 4B',
      ipAddress: '10.240.0.12',
      lastSeen: new Date().toISOString(),
      rateLimitPerMin: 300,
      encryptionMethod: 'TLS 1.3 / AES-256',
      isSimulated: true,
      metrics: { cpu: 42.8, memory: 68.4, bandwidth: 450.0 },
    },
  ];
  const readings: TelemetryReading[] = [];
  const now = Date.now();
  for (let i = 60; i >= 0; i--) {
    const timestamp = new Date(now - i * 120000).toISOString();
    demoDevices.forEach((dev) => {
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
          simulationRunId: 'sim_run_demo',
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
          simulationRunId: 'sim_run_demo',
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
          simulationRunId: 'sim_run_demo',
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
          simulationRunId: 'sim_run_demo',
        });
      } else if (dev.type === 'meter') {
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
          simulationRunId: 'sim_run_demo',
        });
      }
    });
  }
  const demoRules: ThresholdRule[] = [
    {
      id: `rule_cpu_high_${userId}`,
      userId: userId,
      userName: userName,
      deviceId: 'all',
      metricKey: 'cpu',
      operator: '>',
      thresholdValue: 80,
      severity: 'critical',
      enabled: true,
      messageTemplate: 'Cihaz {deviceName} yüksek CPU yüküne ulaştı: %{value}',
      hysteresis: 3,
      minBreachDurationSeconds: 10,
      repeatIntervalSeconds: 300,
      notificationChannels: ['app', 'email'],
      activeHours: '00:00-23:59',
      recipients: [email],
    },
    {
      id: `rule_temp_high_${userId}`,
      userId: userId,
      userName: userName,
      deviceId: 'all',
      metricKey: 'temperature',
      operator: '>',
      thresholdValue: 38,
      severity: 'warning',
      enabled: true,
      messageTemplate: '{deviceName} ortam sıcaklığı eşik değerini aştı: {value}°C',
      hysteresis: 1.5,
      minBreachDurationSeconds: 10,
      repeatIntervalSeconds: 300,
      notificationChannels: ['app', 'email'],
      activeHours: '08:00-20:00',
      recipients: [email],
    },
  ];
  const demoNotifications: NotificationItem[] = [
    {
      id: `notif_init_${userId}`,
      userId: userId,
      title: 'Sistem Onboarding Tamamlandı',
      message: 'İlk kurulum ve akıllı IoT izleme katmanı güvenli bir şekilde aktifleştirildi.',
      severity: 'info',
      timestamp: new Date().toISOString(),
      read: false,
    }
  ];

  dbInstance.data.devices = [...(dbInstance.data.devices || []), ...demoDevices];
  dbInstance.data.telemetry = [...(dbInstance.data.telemetry || []), ...readings];
  dbInstance.data.rules = [...(dbInstance.data.rules || []), ...demoRules];
  dbInstance.data.notifications = [...(dbInstance.data.notifications || []), ...demoNotifications];
  dbInstance.saveData(dbInstance.data);

  // Sync to PostgreSQL if active
  const pool = dbInstance.getPgPool();
  if (pool) {
    demoDevices.forEach(d => dbInstance.postgresRepo.saveDevice(d).catch(() => {}));
    demoRules.forEach(r => dbInstance.postgresRepo.saveRule(r).catch(() => {}));
    demoNotifications.forEach(n => dbInstance.postgresRepo.saveNotification(n).catch(() => {}));
    for (const r of readings) {
      dbInstance.postgresRepo.saveTelemetry(r).catch(() => {});
    }
  }
}
