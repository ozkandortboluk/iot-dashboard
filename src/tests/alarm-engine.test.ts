import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../server/db.js';
import { alarmEngine } from '../server/services/alarmEngine.js';
import type {
  ActiveAlarm,
  ThresholdRule,
  TelemetryReading,
  Device,
  User,
  NotificationQueueItem,
} from '../types.js';

describe('Industrial IoT Production Alarm Engine & Notification Test Suite', () => {
  // Test Tenants & Users
  const customerA: User = {
    id: 'usr_cust_a',
    name: 'Müşteri A Enerji Ltd.',
    email: 'custA@energy.com',
    role: 'customer',
    companyName: 'Müşteri A Enerji Ltd.',
    created_at: new Date().toISOString(),
  };

  const customerB: User = {
    id: 'usr_cust_b',
    name: 'Müşteri B Fabrika A.Ş.',
    email: 'custB@factory.com',
    role: 'customer',
    companyName: 'Müşteri B Fabrika A.Ş.',
    created_at: new Date().toISOString(),
  };

  const adminUser: User = {
    id: 'usr_admin',
    name: 'Sistem Yöneticisi',
    email: 'admin@iot.local',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  // Test Devices
  const deviceA: Device = {
    id: 'esp32_cust_a_01',
    name: 'Trafo Sensörü A1',
    type: 'ESP32-Industrial',
    location: 'Saha 1',
    ipAddress: '192.168.1.10',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    metrics: {},
    tenantId: customerA.id,
    apiKey: 'key_cust_a_01',
    status: 'online',
    isSimulated: false,
    lastSeen: new Date().toISOString(),
  };

  const deviceB: Device = {
    id: 'esp32_cust_b_01',
    name: 'Kazan Sensörü B1',
    type: 'ESP32-Industrial',
    location: 'Saha 2',
    ipAddress: '192.168.1.11',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    metrics: {},
    tenantId: customerB.id,
    apiKey: 'key_cust_b_01',
    status: 'online',
    isSimulated: false,
    lastSeen: new Date().toISOString(),
  };

  const simDeviceA: Device = {
    id: 'sim_device_a_01',
    name: '[Sanal] Trafo Test Cihazı',
    type: 'ESP32-Industrial',
    location: 'Sanal Laboratuvar',
    ipAddress: '127.0.0.1',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    metrics: {},
    tenantId: customerA.id,
    apiKey: 'key_sim_a_01',
    status: 'online',
    isSimulated: true,
    lastSeen: new Date().toISOString(),
  };

  function makeReading(data: Partial<TelemetryReading> & { deviceId: string; deviceName: string; metric: string; value: number }): TelemetryReading {
    return {
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unit: '',
      status: 'normal',
      timestamp: new Date().toISOString(),
      source: 'physical',
      environment: 'production',
      ...data,
    };
  }

  beforeEach(() => {
    // Reset in-memory test database state
    db.data.users = [adminUser, customerA, customerB];
    db.data.devices = [deviceA, deviceB, simDeviceA];
    db.data.rules = [];
    db.data.activeAlarms = [];
    db.data.notifications = [];
    db.data.notificationQueue = [];
    db.data.dispatchLogs = [];
  });

  // =========================================================================
  // 1. Müşteriler arası alarm/kural erişim izolasyonu (Cross-Tenant Isolation)
  // =========================================================================
  describe('1. Müşteriler arası alarm/kural erişim izolasyonu', () => {
    it('Müşteri A sadece kendi kurallarını görmeli, Müşteri B veya Yöneticinin kurallarını görememeli', async () => {
      const ruleA = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 75,
          severity: 'critical',
          enabled: true,
          messageTemplate: '{deviceName} sıcaklık {value}°C',
        },
        customerA
      );

      const ruleB = await db.createRule(
        {
          deviceId: deviceB.id,
          metricKey: 'pressure',
          operator: '>',
          thresholdValue: 10,
          severity: 'warning',
          enabled: true,
          messageTemplate: '{deviceName} basınç {value} bar',
        },
        customerB
      );

      // Customer A query
      const rulesForA = db.getRules(customerA.id);
      expect(rulesForA).toHaveLength(1);
      expect(rulesForA[0].id).toBe(ruleA.id);
      expect(rulesForA[0].tenantId).toBe(customerA.id);

      // Customer B query
      const rulesForB = db.getRules(customerB.id);
      expect(rulesForB).toHaveLength(1);
      expect(rulesForB[0].id).toBe(ruleB.id);
      expect(rulesForB[0].tenantId).toBe(customerB.id);

      // Admin query (all or filtered)
      const allRules = db.getRules(adminUser.id);
      expect(allRules.length).toBeGreaterThanOrEqual(2);

      const adminFilterB = db.getRules(adminUser.id, customerB.id);
      expect(adminFilterB).toHaveLength(1);
      expect(adminFilterB[0].id).toBe(ruleB.id);
    });

    it('Müşteri A başka bir müşterinin kuralını güncelleyememeli, silememeli veya açıp kapatamamalı', async () => {
      const ruleB = await db.createRule(
        {
          deviceId: deviceB.id,
          metricKey: 'pressure',
          operator: '>',
          thresholdValue: 10,
          severity: 'warning',
          enabled: true,
          messageTemplate: '{deviceName} basınç {value} bar',
        },
        customerB
      );

      // Customer A attempts to update Customer B's rule
      const updateResult = await db.updateRule(ruleB.id, { thresholdValue: 20 }, customerA);
      expect(updateResult.success).toBe(false);
      expect(updateResult.forbidden).toBe(true);

      // Customer A attempts to toggle Customer B's rule
      const toggleResult = await db.toggleRule(ruleB.id, false, customerA);
      expect(toggleResult).toBe(false);

      // Customer A attempts to delete Customer B's rule
      const deleteResult = await db.deleteRule(ruleB.id, customerA);
      expect(deleteResult).toBe(false);

      // Rule B must remain intact
      const refreshedRuleB = db.data.rules.find((r: ThresholdRule) => r.id === ruleB.id);
      expect(refreshedRuleB?.thresholdValue).toBe(10);
      expect(refreshedRuleB?.enabled).toBe(true);
    });

    it('Müşteri A cihazından gelen telemetri sadece Müşteri A kurallarını tetiklemeli, Müşteri B kurallarını tetiklememeli', async () => {
      // Rule for Customer A
await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 70,
          severity: 'critical',
          enabled: true,
          messageTemplate: '{deviceName} sıcaklık {value}',
        },
        customerA
      );

      // Rule for Customer B on temperature metric
await db.createRule(
        {
          deviceId: 'all',
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 70,
          severity: 'critical',
          enabled: true,
          messageTemplate: '{deviceName} sıcaklık {value}',
        },
        customerB
      );

      // Telemetry from Device A (owned by Customer A)
      const reading = makeReading({
        deviceId: deviceA.id,
        deviceName: deviceA.name,
        metric: 'temperature',
        value: 85,
        unit: '°C',
      });

      db.telemetryRepository.evaluateProductionRules(reading, deviceA);

      // Only Customer A alarm must be generated
      const alarmsForA = await db.getAlarms(customerA.id);
      const alarmsForB = await db.getAlarms(customerB.id);

      expect(alarmsForA).toHaveLength(1);
      expect(alarmsForA[0].tenantId).toBe(customerA.id);
      expect(alarmsForB).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. Minimum ihlal süresi (Min Breach Duration)
  // =========================================================================
  describe('2. Minimum ihlal süresi (Min Breach Duration)', () => {
    it('Minimum ihlal süresi dolana kadar alarm BREACH_PENDING kalmalı, süre dolunca ACTIVE olmalı', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 80,
          severity: 'critical',
          enabled: true,
          minBreachDurationSeconds: 10, // 10 seconds duration requirement
          messageTemplate: '{deviceName} aşırı sıcaklık: {value}°C',
        },
        customerA
      );

      const t0 = new Date('2026-08-25T12:00:00.000Z');
      const reading1 = makeReading({
        deviceId: deviceA.id,
        deviceName: deviceA.name,
        metric: 'temperature',
        value: 88,
        unit: '°C',
        timestamp: t0.toISOString(),
      });

      // 1. Initial breach at T=0
      db.telemetryRepository.evaluateProductionRules(reading1, deviceA);

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;
      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeDefined();
      expect(alarm?.state).toBe('BREACH_PENDING');
      expect(alarm?.firstBreachAt).toBe(t0.toISOString());
      // No OPEN notification emitted yet
      expect(db.data.notifications).toHaveLength(0);

      // 2. Telemetry at T=5 seconds (not yet 10 seconds)
      const t5 = new Date('2026-08-25T12:00:05.000Z');
      const reading2 = makeReading({
        ...reading1,
        value: 90,
        timestamp: t5.toISOString(),
      });
      db.telemetryRepository.evaluateProductionRules(reading2, deviceA);

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('BREACH_PENDING');
      expect(db.data.notifications).toHaveLength(0);

      // 3. Telemetry at T=11 seconds (breach duration exceeded)
      const t11 = new Date('2026-08-25T12:00:11.000Z');
      const reading3 = makeReading({
        ...reading1,
        value: 92,
        timestamp: t11.toISOString(),
      });
      db.telemetryRepository.evaluateProductionRules(reading3, deviceA);

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');
      expect(alarm?.triggeredAt).toBe(t11.toISOString());
      expect(db.data.notifications.length).toBeGreaterThanOrEqual(1);
    });

    it('BREACH_PENDING aşamasındayken değer normale dönerse alarm tetiklenmeden temizlenmeli/kapanmalı', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 80,
          severity: 'critical',
          enabled: true,
          minBreachDurationSeconds: 10,
          messageTemplate: '{deviceName} aşırı sıcaklık: {value}°C',
        },
        customerA
      );

      const t0 = new Date('2026-08-25T12:00:00.000Z');
      const reading1 = makeReading({
        deviceId: deviceA.id,
        deviceName: deviceA.name,
        metric: 'temperature',
        value: 88,
        unit: '°C',
        timestamp: t0.toISOString(),
      });

      db.telemetryRepository.evaluateProductionRules(reading1, deviceA);
      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;
      expect(db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey)?.state).toBe('BREACH_PENDING');

      // Value drops back to 70 at T=4s (before 10s)
      const t4 = new Date('2026-08-25T12:00:04.000Z');
      const reading2 = makeReading({
        ...reading1,
        value: 70,
        timestamp: t4.toISOString(),
      });
      db.telemetryRepository.evaluateProductionRules(reading2, deviceA);

      const alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('RESOLVED');
    });
  });

  // =========================================================================
  // 3. Histerezisle normale dönüş (Hysteresis Band)
  // =========================================================================
  describe('3. Histerezisle normale dönüş (Hysteresis Band)', () => {
    it('Büyüktür (>) kuralında değer eşik altına inse bile histerezis bandı içindeyse alarm ACTIVE kalmalı, bandın altına inince RESOLVED olmalı', async () => {
      // Rule: > 80, Hysteresis: 5 (Recovery threshold: <= 80 - 5 = 75)
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 80,
          hysteresis: 5,
          severity: 'critical',
          enabled: true,
          messageTemplate: '{deviceName} sıcaklık: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;

      // 1. Value = 85 -> Trigger ACTIVE alarm
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 85,
          unit: '°C',
          timestamp: '2026-08-25T12:00:00.000Z',
        }),
        deviceA
      );

      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');

      // 2. Value = 78 (Below 80, but above 75 recovery band) -> MUST REMAIN ACTIVE
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 78,
          unit: '°C',
          timestamp: '2026-08-25T12:00:10.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');

      // 3. Value = 74 (<= 75 recovery threshold) -> MUST RESOLVE
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 74,
          unit: '°C',
          timestamp: '2026-08-25T12:00:20.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('RESOLVED');
    });

    it('Küçüktür (<) kuralında histerezis bandı doğru değerlendirilmeli', async () => {
      // Rule: < 20, Hysteresis: 3 (Recovery threshold: >= 20 + 3 = 23)
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'pressure',
          operator: '<',
          thresholdValue: 20,
          hysteresis: 3,
          severity: 'warning',
          enabled: true,
          messageTemplate: '{deviceName} düşük basınç: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_pressure`;

      // 1. Value = 15 (< 20) -> ACTIVE
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'pressure',
          value: 15,
          unit: 'bar',
          timestamp: '2026-08-25T12:00:00.000Z',
        }),
        deviceA
      );

      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');

      // 2. Value = 21 (> 20 but < 23) -> Remains ACTIVE
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'pressure',
          value: 21,
          unit: 'bar',
          timestamp: '2026-08-25T12:00:10.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');

      // 3. Value = 23 (>= 23) -> RESOLVED
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'pressure',
          value: 23,
          unit: 'bar',
          timestamp: '2026-08-25T12:00:20.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('RESOLVED');
    });
  });

  // =========================================================================
  // 4. Geceyi aşan çalışma saatleri (Overnight Schedule e.g. 22:00-06:00)
  // =========================================================================
  describe('4. Geceyi aşan çalışma saatleri (Overnight Schedule)', () => {
    it('Gece vardiyası (22:00 - 06:00) kuralı gece saatlerinde tetiklenmeli, gündüz saatlerinde yoksayılmalı', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'vibration',
          operator: '>',
          thresholdValue: 5.0,
          severity: 'critical',
          enabled: true,
          activeHours: '22:00-06:00', // Overnight schedule
          messageTemplate: '{deviceName} gece titreşim uyarısı: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_vibration`;

      // 1. Reading at 23:30 (Turkey Time: inside active hours) -> Should trigger
      // Note: 20:30 UTC = 23:30 Istanbul (UTC+3)
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'vibration',
          value: 8.5,
          unit: 'mm/s',
          timestamp: '2026-08-25T20:30:00.000Z',
        }),
        deviceA
      );

      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeDefined();
      expect(alarm?.state).toBe('ACTIVE');

      // Reset alarms for next test phase
      db.data.activeAlarms = [];

      // 2. Reading at 03:15 (Turkey Time: 00:15 UTC = inside active hours) -> Should trigger
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'vibration',
          value: 8.5,
          unit: 'mm/s',
          timestamp: '2026-08-25T00:15:00.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeDefined();
      expect(alarm?.state).toBe('ACTIVE');

      // Reset alarms
      db.data.activeAlarms = [];

      // 3. Reading at 14:00 (Turkey Time: 11:00 UTC = outside active hours) -> Should NOT trigger
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'vibration',
          value: 8.5,
          unit: 'mm/s',
          timestamp: '2026-08-25T11:00:00.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Türkiye saat dilimi (Europe/Istanbul / UTC+3)
  // =========================================================================
  describe('5. Türkiye saat dilimi (Europe/Istanbul)', () => {
    it('09:00 - 18:00 TRT kuralı UTC saat farkını doğru hesaplayarak değerlendirmeli', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'current',
          operator: '>',
          thresholdValue: 30,
          severity: 'warning',
          enabled: true,
          activeHours: '09:00-18:00',
          messageTemplate: '{deviceName} mesai akım aşımı: {value}A',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_current`;

      // 1. UTC 05:30 = Istanbul 08:30 (Outside 09:00-18:00 TRT) -> Should NOT trigger
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'current',
          value: 45,
          unit: 'A',
          timestamp: '2026-08-25T05:30:00.000Z',
        }),
        deviceA
      );

      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeUndefined();

      // 2. UTC 07:00 = Istanbul 10:00 (Inside 09:00-18:00 TRT) -> Should trigger
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'current',
          value: 45,
          unit: 'A',
          timestamp: '2026-08-25T07:00:00.000Z',
        }),
        deviceA
      );

      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm).toBeDefined();
      expect(alarm?.state).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // 6. Alarm onaylandıktan sonra tekrar gönderilmemesi (Acknowledged Alarm)
  // =========================================================================
  describe('6. Alarm onaylandıktan sonra tekrar gönderilmemesi', () => {
    it('Alarm onaylandığında (acknowledged=true) repeatInterval süresi geçse bile yeni REPEAT bildirimleri engellenmeli', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 70,
          severity: 'critical',
          enabled: true,
          repeatIntervalSeconds: 60, // 60s repeat
          messageTemplate: '{deviceName} sıcaklık: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;

      const now = Date.now();
      const t0 = new Date(now).toISOString();

      // 1. Initial breach at T=0
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 85,
          unit: '°C',
          timestamp: t0,
        }),
        deviceA
      );

      // Customer A receives 1 OPEN notification
      const custANotifs = await db.getNotifications(customerA.id);
      expect(custANotifs).toHaveLength(1);
      expect(custANotifs[0].alarmState).toBe('OPEN');

      // 2. User acknowledges the alarm
      const ackSuccess = await alarmEngine.acknowledge(alarmKey, customerA);
      expect(ackSuccess).toBe(true);

      const alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.acknowledged).toBe(true);

      const notifCountAfterAck = (await db.getNotifications(customerA.id)).length;

      // 3. Telemetry arrives at T=120s (past repeatInterval of 60s)
      const t120 = new Date(now + 120 * 1000).toISOString();
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 88,
          unit: '°C',
          timestamp: t120,
        }),
        deviceA
      );

      // Repeat count is updated, but NO new REPEAT notification is spawned
      expect(alarm?.repeatCount).toBe(2);
      expect(alarm?.currentValue).toBe(88);
      expect((await db.getNotifications(customerA.id)).length).toBe(notifCountAfterAck);
      const repeatNotifs = db.data.notifications.filter((n) => n.alarmState === 'REPEAT');
      expect(repeatNotifs).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. Susturma süresi bitince davranış (Silenced Alarm Expiry)
  // =========================================================================
  describe('7. Susturma süresi bitince davranış', () => {
    it('Susturma süresi boyunca bildirim gönderilmemeli; süre dolduğunda ihlal devam ediyorsa alarm aktifleşmeli', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 70,
          severity: 'critical',
          enabled: true,
          repeatIntervalSeconds: 60,
          messageTemplate: '{deviceName} sıcaklık: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;

      // 1. Initial breach at T=0
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 85,
          unit: '°C',
          timestamp: '2026-08-25T12:00:00.000Z',
        }),
        deviceA
      );

      // 2. Silence alarm for 10 minutes (until 12:10)
      const silenceEnd = '2026-08-25T12:10:00.000Z';
      const alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      if (alarm) {
        alarm.silencedUntil = silenceEnd;
        alarm.state = 'SILENCED';
      }

      const countBefore = db.data.notifications.length;

      // 3. Telemetry at T=12:05 (During silence) -> Should NOT produce new notifications
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 86,
          unit: '°C',
          timestamp: '2026-08-25T12:05:00.000Z',
        }),
        deviceA
      );

      expect(db.data.notifications.length).toBe(countBefore);

      // 4. Telemetry at T=12:12 (After silence expired, still breaching) -> Should resume alerting
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 89,
          unit: '°C',
          timestamp: '2026-08-25T12:12:00.000Z',
        }),
        deviceA
      );

      const repeatNotifs = db.data.notifications.filter((n) => n.alarmState === 'REPEAT');
      expect(repeatNotifs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 8. Sırasız telemetri (Out-of-Order Telemetry Protection)
  // =========================================================================
  describe('8. Sırasız telemetri (Out-of-Order Telemetry)', () => {
    it('Eski zaman damgalı gecikmiş paket aktif alarm durumunu bozmamalı veya geriletmemeli', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 80,
          severity: 'critical',
          enabled: true,
          messageTemplate: '{deviceName} sıcaklık: {value}',
        },
        customerA
      );

      const alarmKey = `alarm_${rule.id}_${deviceA.id}_temperature`;

      // 1. Current packet at T=12:00:00 with value 90 (Breach) -> ACTIVE
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 90,
          unit: '°C',
          timestamp: '2026-08-25T12:00:00.000Z',
        }),
        deviceA
      );

      let alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');
      expect(alarm?.currentValue).toBe(90);

      // 2. Stale delayed packet arriving late with timestamp T=11:58:00 (value 50 normal)
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'temperature',
          value: 50,
          unit: '°C',
          timestamp: '2026-08-25T11:58:00.000Z',
        }),
        deviceA
      );

      // Alarm must STILL be ACTIVE with current value 90 (not falsely overwritten or resolved by stale packet)
      alarm = db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmKey);
      expect(alarm?.state).toBe('ACTIVE');
      expect(alarm?.currentValue).toBe(90);
    });
  });

  // =========================================================================
  // 9. Simülasyon alarmının WhatsApp/e-posta kuyruğuna girmemesi
  // =========================================================================
  describe('9. Simülasyon alarmının dış bildirim kuyruğuna girmemesi', () => {
    it('Sanal/simülasyon cihazı eşiği aştığında panel bildirimi üretilmeli ancak WhatsApp/Email kuyruğuna ASLA girmemeli', async () => {
      // Create a rule with external notification channels
      const rule = await db.createRule(
        {
          deviceId: simDeviceA.id,
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 60,
          severity: 'critical',
          enabled: true,
          notificationChannels: ['whatsapp', 'email', 'sms', 'telegram', 'app'],
          recipients: ['+905551234567', 'test@factory.com'],
          messageTemplate: '{deviceName} test sıcaklık: {value}',
        },
        customerA
      );

      // Evaluate simulation reading
      db.telemetryRepository.evaluateSimulationRules(
        makeReading({
          deviceId: simDeviceA.id,
          deviceName: simDeviceA.name,
          metric: 'temperature',
          value: 85,
          unit: '°C',
          source: 'simulator',
          environment: 'sandbox',
        }),
        simDeviceA
      );

      // In-app test notification must exist
      const testNotifs = db.data.notifications.filter((n) => n.isSimulation || n.title.includes('TEST ALARMI'));
      expect(testNotifs.length).toBeGreaterThanOrEqual(1);

      // BUT external dispatch queue must be strictly empty!
      expect(db.data.notificationQueue).toHaveLength(0);
    });
  });

  // =========================================================================
  // 10. Başarısız gönderimin en fazla üç kez denenmesi (Max 3 Attempts)
  // =========================================================================
  describe('10. Başarısız gönderimin en fazla 3 kez denenmesi', () => {
    it('Kuyrukta teslim edilemeyen öğe 3 denemeden sonra status=failed olmalı ve tekrar denenmemeli', async () => {
      const queueItem: NotificationQueueItem = {
        id: 'q_test_fail_01',
        ruleId: 'rule_test',
        tenantId: customerA.id,
        userName: customerA.name,
        channel: 'email',
        recipient: 'invalid-email-address',
        title: 'Kritik Alarm',
        message: 'Kazan sıcaklık 95C',
        severity: 'critical',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.data.notificationQueue = [queueItem];

      // Service config with invalid SMTP to guarantee failure
      db.updateServiceConfig({
        email: {
          enabled: true,
          provider: 'smtp',
          smtpHost: 'non-existent-host.local',
          smtpPort: 587,
          smtpUser: '',
          fromEmail: 'alerts@iot.local',
          fromName: 'IoT Alerts',
        },
      });

      // 1. First attempt
      await db.processQueue();
      expect(queueItem.attempts).toBe(1);
      expect(queueItem.status).toBe('retrying');

      // 2. Second attempt (force nextRetryAt to now)
      queueItem.nextRetryAt = new Date(Date.now() - 1000).toISOString();
      await db.processQueue();
      expect(queueItem.attempts).toBe(2);
      expect(queueItem.status).toBe('retrying');

      // 3. Third attempt (maxAttempts reached)
      queueItem.nextRetryAt = new Date(Date.now() - 1000).toISOString();
      await db.processQueue();
      expect(queueItem.attempts).toBe(3);
      expect(queueItem.status).toBe('failed');

      // 4. Fourth attempt run -> should be ignored (no further retries)
      await db.processQueue();
      expect(queueItem.attempts).toBe(3);
      expect(queueItem.status).toBe('failed');
    });
  });

  // =========================================================================
  // 11. Aynı bildirimin kuyrukta çoğalmaması (Deduplication)
  // =========================================================================
  describe('11. Bildirim tekilleştirme (Deduplication / Debounce)', () => {
    it('Aynı alarm süresince gelen ardışık telemetriler yeni bildirim satırları basmak yerine mevcut bildirimi yerinde güncellemelidir', async () => {
      const rule = await db.createRule(
        {
          deviceId: deviceA.id,
          metricKey: 'pressure',
          operator: '>',
          thresholdValue: 10,
          severity: 'critical',
          enabled: true,
          repeatIntervalSeconds: 300, // 5 min repeat
          messageTemplate: '{deviceName} yüksek basınç: {value} bar',
        },
        customerA
      );

      const now = Date.now();
      // Telemetry 1 (Alarm Opens)
      db.telemetryRepository.evaluateProductionRules(
        makeReading({
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          metric: 'pressure',
          value: 12,
          unit: 'bar',
          timestamp: new Date(now).toISOString(),
        }),
        deviceA
      );

      const notifsA1 = await db.getNotifications(customerA.id);
      expect(notifsA1).toHaveLength(1);
      expect(notifsA1[0].currentValue).toBe(12);

      // Telemetry 2, 3, 4 within seconds of each other
      for (let i = 1; i <= 3; i++) {
        db.telemetryRepository.evaluateProductionRules(
          makeReading({
            deviceId: deviceA.id,
            deviceName: deviceA.name,
            metric: 'pressure',
            value: 12 + i,
            unit: 'bar',
            timestamp: new Date(now + i * 1000).toISOString(),
          }),
          deviceA
        );
      }

      // Should still be only 1 notification row for Customer A, updated in place with latest count and value!
      const notifsAAfter = await db.getNotifications(customerA.id);
      expect(notifsAAfter).toHaveLength(1);
      expect(notifsAAfter[0].currentValue).toBe(15);
      expect(notifsAAfter[0].repeatCount).toBe(4);
    });
  });

  // =========================================================================
  // 12. Sunucu yeniden başladıktan sonra aktif alarmın devam etmesi
  // =========================================================================
  describe('12. Aktif alarmların sunucu yeniden başladığında korunması (Persistence)', () => {
    it('Sunucu/veritabanı reload edildiğinde aktif alarmlar durumları, repeat sayıları ve onay bilgileriyle korunmalıdır', async () => {
      const activeAlarm: ActiveAlarm = {
        id: 'alarm_persisted_test_01',
        ruleId: 'rule_temp_crit',
        deviceId: deviceA.id,
        deviceName: deviceA.name,
        tenantId: customerA.id,
        metricKey: 'temperature',
        operator: '>',
        thresholdValue: 85,
        currentValue: 92.5,
        severity: 'critical',
        state: 'ACTIVE',
        firstBreachAt: '2026-08-25T10:00:00.000Z',
        triggeredAt: '2026-08-25T10:00:00.000Z',
        lastNotifiedAt: '2026-08-25T10:00:00.000Z',
        acknowledged: true,
        acknowledgedAt: '2026-08-25T10:05:00.000Z',
        acknowledgedBy: customerA.name,
        repeatCount: 14,
        message: 'Kritik sıcaklık aşıldı',
        updatedAt: '2026-08-25T10:15:00.000Z',
        version: 5,
        source: 'physical',
        environment: 'production',
      };

      db.telemetryRepository.upsertActiveAlarm(activeAlarm);

      // Verify alarm in current session
      const foundBefore = await db.getAlarms(customerA.id);
      expect(foundBefore.some((a: ActiveAlarm) => a.id === activeAlarm.id)).toBe(true);

      // Simulate rehydration from database schema
      const exported = JSON.parse(JSON.stringify(db.data));
      expect(exported.activeAlarms).toBeDefined();
      const persistedAlarm = exported.activeAlarms.find((a: ActiveAlarm) => a.id === activeAlarm.id);
      expect(persistedAlarm).toBeDefined();
      expect(persistedAlarm.state).toBe('ACTIVE');
      expect(persistedAlarm.acknowledged).toBe(true);
      expect(persistedAlarm.repeatCount).toBe(14);
      expect(persistedAlarm.currentValue).toBe(92.5);
    });
  });

  // =========================================================================
  // 13. Yetkisiz kuyruk retry ve alarm kapatma/onaylama girişimi (403 Forbidden)
  // =========================================================================
  describe('13. Yetkisiz işlem engelleme (403 Forbidden & Access Control)', () => {
    it('Müşteri A, Müşteri B ye ait bir alarmı kapatamaz (resolve), onaylayamaz (ack) veya susturamaz (silence)', async () => {
      const alarmB: ActiveAlarm = {
        id: 'alarm_b_specific_01',
        ruleId: 'rule_b',
        deviceId: deviceB.id,
        deviceName: deviceB.name,
        tenantId: customerB.id,
        metricKey: 'pressure',
        operator: '>',
        thresholdValue: 10,
        currentValue: 14,
        severity: 'critical',
        state: 'ACTIVE',
        firstBreachAt: new Date().toISOString(),
        acknowledged: false,
        repeatCount: 1,
        message: 'Kazan B yüksek basınç',
        updatedAt: new Date().toISOString(),
        version: 1,
        source: 'physical',
        environment: 'production',
      };

      db.telemetryRepository.upsertActiveAlarm(alarmB);

      // Customer A attempts to acknowledge Customer B's alarm -> MUST FAIL (throws error)
      await expect(alarmEngine.acknowledge(alarmB.id, customerA)).rejects.toThrow(/erişim yetkiniz yok/);
      expect(db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmB.id)?.acknowledged).toBe(false);

      // Customer A attempts to silence Customer B's alarm -> MUST FAIL
      await expect(alarmEngine.silence(alarmB.id, 30, customerA)).rejects.toThrow(/erişim yetkiniz yok/);
      expect(db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmB.id)?.state).toBe('ACTIVE');

      // Customer A attempts to resolve Customer B's alarm -> MUST FAIL
      await expect(alarmEngine.resolve(alarmB.id, customerA)).rejects.toThrow(/erişim yetkiniz yok/);
      expect(db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmB.id)?.state).toBe('ACTIVE');

      // But Admin can resolve or acknowledge Customer B's alarm
      const adminAckRes = await alarmEngine.acknowledge(alarmB.id, adminUser);
      expect(adminAckRes).toBe(true);
      expect(db.data.activeAlarms.find((a: ActiveAlarm) => a.id === alarmB.id)?.acknowledged).toBe(true);
    });

    it('Müşteri A, Müşteri B ye ait kuyruk öğesini retry edemez (Hata fırlatılmalı)', async () => {
      const queueItemB: NotificationQueueItem = {
        id: 'q_item_b_01',
        ruleId: 'rule_b',
        tenantId: customerB.id,
        userName: customerB.name,
        channel: 'whatsapp',
        recipient: '+905559876543',
        title: 'Kritik Uyarı',
        message: 'Basınç aşıldı',
        severity: 'critical',
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.data.notificationQueue = [queueItemB];

      // Customer A tries to retry Customer B's queue item
      expect(() => {
        db.retryQueueItem(queueItemB.id, customerA);
      }).toThrow(/erişim yetkiniz yok/);

      // Status must remain failed
      expect(queueItemB.status).toBe('failed');

      // Admin or Customer B can retry
      const retried = db.retryQueueItem(queueItemB.id, customerB);
      expect(retried.status).toBe('retrying');
    });
  });
});
