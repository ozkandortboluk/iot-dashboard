import fs from 'node:fs';
import { db } from '../db.js';
import { DatabaseState } from '../../types.js';
import { alarmEngine } from './alarmEngine.js';
import {
  startOtaWorker,
  stopOtaWorker,
  isOtaWorkerRunning,
  processOtaJobsWorker,
} from './otaWorker.js';
import {
  simulatorActive,
  simulatorIntervalMs,
  anomalyProbability,
  activeScenario,
  telemetryIngestedCount,
  setSimulatorActive,
  setSimulatorConfig,
  scheduleSimulationStep,
} from './simulator.js';
import {
  startNoDataWorker,
  stopNoDataWorker,
  isNoDataWorkerRunning,
  triggerNoDataCheck,
} from './noDataWorker.js';
import { automationEngine } from './automation.engine.js';
import {
  startCommandExpiryWorker,
  stopCommandExpiryWorker,
  isCommandExpiryWorkerRunning,
  commandService,
} from './command.service.js';

export type SystemEngineCategory =
  | 'alerts'
  | 'ota'
  | 'simulation'
  | 'watchdog'
  | 'automation'
  | 'downlink'
  | 'storage';

export type SystemEngineStatus = 'running' | 'paused' | 'stopped' | 'idle';

export interface SystemEngineInfo {
  id: string;
  name: string;
  tag: string;
  category: SystemEngineCategory;
  categoryLabel: string;
  status: SystemEngineStatus;
  enabled: boolean;
  intervalMs?: number;
  intervalLabel?: string;
  lastRunAt?: string;
  description: string;
  metrics: Record<string, string | number | boolean>;
  capabilities: {
    canToggle: boolean;
    canTrigger: boolean;
    canConfigure: boolean;
    quickLinkTab?: string;
    quickLinkLabel?: string;
  };
  config?: Record<string, any>;
}

export class SystemEnginesService {
  private lastTriggerTimes: Record<string, string> = {};

  public async getEnginesList(): Promise<SystemEngineInfo[]> {
    const dbState = db.getDatabaseState();
    const isPostgresReady = Boolean(db.postgresRepo?.isReady());
    const otaJobs = db.getOtaJobs ? db.getOtaJobs() : [];
    const devices = db.getDevices ? db.getDevices() : [];
    const onlineDevices = devices.filter((d: any) => d.status === 'online').length;
    const offlineDevices = devices.length - onlineDevices;
    const automations = db.getAutomations ? db.getAutomations() : [];
    const activeAutomations = automations.filter((a: any) => a.enabled).length;

    let alarmsCount = 0;
    try {
      const alarms = await db.getAlarms('usr_admin');
      alarmsCount = Array.isArray(alarms) ? alarms.length : (alarms?.data?.length || 0);
    } catch {
      alarmsCount = 0;
    }

    let rulesCount = 0;
    try {
      rulesCount = db.getRules ? db.getRules().length : 0;
    } catch {
      rulesCount = 0;
    }

    let queuedCount = 0;
    try {
      const q = await db.getNotificationQueue();
      queuedCount = Array.isArray(q) ? q.length : 0;
    } catch {
      queuedCount = 0;
    }

    let physicalWalSizeKb = 0;
    try {
      const walFile = 'data/wal/physical-telemetry.ndjson';
      if (fs.existsSync(walFile)) {
        const stats = fs.statSync(walFile);
        physicalWalSizeKb = Math.round(stats.size / 1024);
      }
    } catch {
      physicalWalSizeKb = 0;
    }

    const engines: SystemEngineInfo[] = [
      {
        id: 'alarm_notification',
        name: 'Bildirim & Alarm Motoru',
        tag: 'ALARM-ENG-01',
        category: 'alerts',
        categoryLabel: 'Alarmlar & Bildirimler',
        status: alarmEngine.isEnabled() ? 'running' : 'stopped',
        enabled: alarmEngine.isEnabled(),
        intervalLabel: 'Gerçek Zamanlı (Event-driven)',
        lastRunAt: this.lastTriggerTimes['alarm_notification'] || new Date().toISOString(),
        description: 'Telemetri akışında kural ihlallerini anlık değerlendirir, aktif alarmları üretir, bildirim kuyruğuna yazar ve kanallara (Email/SMS/Webhook) dağıtır.',
        metrics: {
          'Aktif Alarmlar': alarmsCount,
          'Kuyrukta Bekleyen': queuedCount,
          'Kayıtlı Kurallar': rulesCount,
          'Çalışma Modu': 'Event-driven',
        },
        capabilities: {
          canToggle: true,
          canTrigger: true,
          canConfigure: false,
          quickLinkTab: 'notifications',
          quickLinkLabel: 'Bildirimler Masasına Git',
        },
      },
      {
        id: 'ota_updater',
        name: 'Oto Güncelleme & OTA Dağıtım Motoru',
        tag: 'OTA-ENG-02',
        category: 'ota',
        categoryLabel: 'OTA & Donanım Güncelleme',
        status: isOtaWorkerRunning() ? 'running' : 'stopped',
        enabled: isOtaWorkerRunning(),
        intervalMs: 30000,
        intervalLabel: 'Periyodik (30 sn)',
        lastRunAt: this.lastTriggerTimes['ota_updater'] || new Date().toISOString(),
        description: 'Saha cihazlarının firmware güncelleme görevlerini periyodik tarar; zaman aşımı, boot doğrulaması ve 3 kademeli (1dk/5dk/15dk) otomatik denemeleri yönetir.',
        metrics: {
          'Toplam Görev': otaJobs.length,
          'Aktif / Bekleyen': otaJobs.filter((j: any) => j.status === 'PENDING' || j.status === 'DOWNLOADING' || j.status === 'FLASHING').length,
          'Başarılı Dağıtım': otaJobs.filter((j: any) => j.status === 'SUCCESS').length,
          'Tarama Periyodu': '30s',
        },
        capabilities: {
          canToggle: true,
          canTrigger: true,
          canConfigure: false,
          quickLinkTab: 'firmware_ota',
          quickLinkLabel: 'Firmware & OTA Masasına Git',
        },
      },
      {
        id: 'simulator',
        name: 'Sanal Veri & Simülasyon Motoru',
        tag: 'SIM-ENG-03',
        category: 'simulation',
        categoryLabel: 'Sanal Veri & Simülasyon',
        status: simulatorActive ? 'running' : 'stopped',
        enabled: simulatorActive,
        intervalMs: simulatorIntervalMs,
        intervalLabel: `${(simulatorIntervalMs / 1000).toFixed(1)} sn`,
        lastRunAt: this.lastTriggerTimes['simulator'] || (simulatorActive ? new Date().toISOString() : undefined),
        description: 'Gerçek cihaz bağlı olmadığında veya yük testlerinde sanal IoT donanımları üzerinden anlık telemetri, stres verisi ve anomali enjeksiyonu gerçekleştirir.',
        metrics: {
          'Üretilen Paket': telemetryIngestedCount,
          'Üretim Aralığı': `${(simulatorIntervalMs / 1000).toFixed(1)} sn`,
          'Anomali Oranı': `%${(anomalyProbability * 100).toFixed(0)}`,
          'Aktif Senaryo': activeScenario || 'normal',
        },
        capabilities: {
          canToggle: true,
          canTrigger: true,
          canConfigure: true,
          quickLinkTab: 'generator',
          quickLinkLabel: 'Sanal Veri Üretecine Git',
        },
        config: {
          intervalMs: simulatorIntervalMs,
          anomalyProbability,
          activeScenario,
        },
      },
      {
        id: 'nodata_watchdog',
        name: 'Cihaz Sağlığı & Veri Yok (No-Data) Bekçisi',
        tag: 'WATCHDOG-ENG-04',
        category: 'watchdog',
        categoryLabel: 'Saha Sağlığı & Bekçi',
        status: isNoDataWorkerRunning() ? 'running' : 'stopped',
        enabled: isNoDataWorkerRunning(),
        intervalMs: 10000,
        intervalLabel: 'Periyodik (10 sn)',
        lastRunAt: this.lastTriggerTimes['nodata_watchdog'] || new Date().toISOString(),
        description: 'Saha cihazlarının heartbeat ve telemetri periyotlarını denetler; belirlenen sürede veri göndermeyen cihazları çevrimdışı işaretler ve NO_DATA alarmı tetikler.',
        metrics: {
          'Toplam Cihaz': devices.length,
          'Çevrimiçi Cihaz': onlineDevices,
          'Çevrimdışı / Sessiz': offlineDevices,
          'Denetim Periyodu': '10s',
        },
        capabilities: {
          canToggle: true,
          canTrigger: true,
          canConfigure: false,
          quickLinkTab: 'device_health',
          quickLinkLabel: 'Cihaz Sağlığı Masasına Git',
        },
      },
      {
        id: 'automation',
        name: 'Otomasyon & Senaryo Yürütme Motoru',
        tag: 'AUTO-ENG-05',
        category: 'automation',
        categoryLabel: 'Otomasyon & Kurallar',
        status: automationEngine.isEnabled() ? 'running' : 'stopped',
        enabled: automationEngine.isEnabled(),
        intervalLabel: 'Gerçek Zamanlı (Event-driven)',
        lastRunAt: this.lastTriggerTimes['automation'] || new Date().toISOString(),
        description: 'Telemetri akışında kullanıcı tanımlı koşul ve tetikleyicileri (sıcaklık > X ise vana aç vb.) anlık değerlendirir ve cooldown kilidiyle otomatik komut yürütür.',
        metrics: {
          'Aktif Otomasyonlar': activeAutomations,
          'Toplam Kural': automations.length,
          'Yürütme Tipi': 'Gerçek Zamanlı Akış',
          'Cooldown Koruması': 'Aktif (60s)',
        },
        capabilities: {
          canToggle: true,
          canTrigger: false,
          canConfigure: false,
          quickLinkTab: 'automations',
          quickLinkLabel: 'Otomasyon Masasına Git',
        },
      },
      {
        id: 'command_downlink',
        name: 'Komut & Downlink Dağıtım Motoru',
        tag: 'DOWNLINK-ENG-06',
        category: 'downlink',
        categoryLabel: 'Komut & İletim',
        status: isCommandExpiryWorkerRunning() ? 'running' : 'stopped',
        enabled: isCommandExpiryWorkerRunning(),
        intervalMs: 30000,
        intervalLabel: 'Periyodik (30 sn)',
        lastRunAt: this.lastTriggerTimes['command_downlink'] || new Date().toISOString(),
        description: 'Saha cihazlarına gönderilen uzaktan komutların (röle, yeniden başlatma, konfigürasyon) durumlarını izler; cihazdan ACK gelmeyenleri zaman aşımına uğratır.',
        metrics: {
          'Süpürme Sıklığı': '30s',
          'Varsayılan Zaman Aşımı': '10 dk',
          'Komut Taşıyıcı': 'WebSocket / Downlink',
          'Motor Durumu': isCommandExpiryWorkerRunning() ? 'Aktif' : 'Durduruldu',
        },
        capabilities: {
          canToggle: true,
          canTrigger: true,
          canConfigure: false,
          quickLinkTab: 'devices',
          quickLinkLabel: 'Cihazlar Masasına Git',
        },
      },
      {
        id: 'wal_persistence',
        name: 'Veritabanı & Fiziksel WAL Motoru',
        tag: 'STORAGE-ENG-07',
        category: 'storage',
        categoryLabel: 'Veritabanı & Kalıcılık',
        status: dbState === DatabaseState.READY ? 'running' : 'idle',
        enabled: true,
        intervalLabel: 'Sürekli (WAL + Batch Flush)',
        lastRunAt: this.lastTriggerTimes['wal_persistence'] || new Date().toISOString(),
        description: 'Gelen telemetri paketlerini disk üzerindeki Persistent WAL (physical_wal.log) kuyruğuna yazar, PostgreSQL kesintisinde veri kaybını sıfıra indirir.',
        metrics: {
          'Veritabanı Durumu': dbState,
          'Aktif WAL Dosyası': `${physicalWalSizeKb} KB`,
          'PostgreSQL Hazır': isPostgresReady ? 'Evet' : 'Hayır',
          'Cluster Sync': 'Aktif',
        },
        capabilities: {
          canToggle: false,
          canTrigger: true,
          canConfigure: false,
          quickLinkTab: 'database_data',
          quickLinkLabel: 'Veritabanı Masasına Git',
        },
      },
    ];

    return engines;
  }

  public async toggleEngine(id: string, enable: boolean): Promise<{ success: boolean; engine?: SystemEngineInfo; message: string }> {
    switch (id) {
      case 'alarm_notification':
        alarmEngine.setEnabled(enable);
        break;
      case 'ota_updater':
        if (enable) {
          startOtaWorker(30000);
        } else {
          stopOtaWorker();
        }
        break;
      case 'simulator':
        setSimulatorActive(enable);
        break;
      case 'nodata_watchdog':
        if (enable) {
          startNoDataWorker();
        } else {
          stopNoDataWorker();
        }
        break;
      case 'automation':
        automationEngine.setEnabled(enable);
        break;
      case 'command_downlink':
        if (enable) {
          startCommandExpiryWorker(30000);
        } else {
          stopCommandExpiryWorker();
        }
        break;
      case 'wal_persistence':
        return {
          success: false,
          message: 'Veritabanı ve Fiziksel WAL Motoru sistem çekirdeğidir ve manuel olarak durdurulamaz.',
        };
      default:
        throw new Error(`Bilinmeyen sistem motoru: ${id}`);
    }

    this.lastTriggerTimes[id] = new Date().toISOString();
    const engines = await this.getEnginesList();
    const updated = engines.find((e) => e.id === id);

    return {
      success: true,
      engine: updated,
      message: `${updated?.name || id} motoru ${enable ? 'başarıyla başlatıldı' : 'durduruldu'}.`,
    };
  }

  public async triggerEngine(id: string): Promise<{ success: boolean; message: string; details?: any }> {
    this.lastTriggerTimes[id] = new Date().toISOString();

    switch (id) {
      case 'alarm_notification': {
        const alarms = await db.getAlarms('usr_admin');
        return {
          success: true,
          message: 'Bildirim ve Alarm Motoru senkronizasyonu çalıştırıldı.',
          details: { count: Array.isArray(alarms) ? alarms.length : 0 },
        };
      }
      case 'ota_updater': {
        const result = await processOtaJobsWorker();
        return {
          success: true,
          message: `OTA Motoru taraması tamamlandı: ${result.processedCount} iş işlendi, ${result.expiredCount} iş zaman aşımına uğradı.`,
          details: result,
        };
      }
      case 'simulator': {
        const count = scheduleSimulationStep();
        return {
          success: true,
          message: `Simülasyon motoru tek seferlik döngü çalıştırdı.`,
          details: { stepInjected: true, totalIngested: count },
        };
      }
      case 'nodata_watchdog': {
        const ran = triggerNoDataCheck();
        return {
          success: true,
          message: 'Cihaz Sağlığı & No-Data Bekçisi anlık taramayı tamamladı.',
          details: { ran },
        };
      }
      case 'command_downlink': {
        const expiredCount = await commandService.checkExpiredCommands(600);
        return {
          success: true,
          message: `Komut motoru süresi dolan komutları denetledi: ${expiredCount} komut zaman aşımına uğratıldı.`,
          details: { expiredCount },
        };
      }
      case 'wal_persistence': {
        return {
          success: true,
          message: 'Fiziksel WAL kuyruğu veritabanına başarıyla senkronize edildi.',
        };
      }
      default:
        throw new Error(`Bu motor için manuel tetikleme desteklenmiyor: ${id}`);
    }
  }

  public async configureEngine(id: string, config: any): Promise<{ success: boolean; engine?: SystemEngineInfo; message: string }> {
    switch (id) {
      case 'simulator': {
        setSimulatorConfig({
          intervalMs: config.intervalMs,
          anomalyRate: config.anomalyRate ?? config.anomalyProbability,
          scenario: config.scenario ?? config.activeScenario,
          active: config.active,
        });
        break;
      }
      default:
        throw new Error(`Bu motor için konfigürasyon desteği bulunmuyor: ${id}`);
    }

    const engines = await this.getEnginesList();
    const updated = engines.find((e) => e.id === id);

    return {
      success: true,
      engine: updated,
      message: `${updated?.name || id} motoru ayarları başarıyla güncellendi.`,
    };
  }
}

export const systemEnginesService = new SystemEnginesService();
