import type { Device, DeviceStatus } from '../../types.js';

export interface CalculatedTimeouts {
  expectedIntervalSeconds: number;
  offlineTimeoutSeconds: number;
  heartbeatTimeoutSeconds: number;
  warningTimeoutSeconds: number;
  intervalMode: 'auto' | 'manual';
}

export interface WatchdogEvaluationResult {
  newStatus: DeviceStatus;
  changed: boolean;
  reason?: string;
  timeoutSeconds: number;
  isConfirmedOffline?: boolean;
  graceBufferSeconds?: number;
  elapsedSeconds?: number;
}

/**
 * Returns the most recent timestamp among lastTelemetryAt, lastHeartbeatAt, lastMessageAt, and lastSeen.
 * Allows the watchdog to evaluate device liveness based on the freshest signal vector.
 */
export function getLatestLivenessTimestamp(dev: Partial<Device>): number {
  const timestamps = [
    dev.lastTelemetryAt ? new Date(dev.lastTelemetryAt).getTime() : 0,
    dev.lastHeartbeatAt ? new Date(dev.lastHeartbeatAt).getTime() : 0,
    dev.lastMessageAt ? new Date(dev.lastMessageAt).getTime() : 0,
    dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0,
  ].filter((t) => !isNaN(t) && t > 0);

  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

export class SmartIntervalService {
  public static readonly DEFAULT_INTERVAL_SECONDS = 30;
  public static readonly MIN_INTERVAL_SECONDS = 2;
  public static readonly MAX_INTERVAL_SECONDS = 86400; // 24 hours
  public static readonly MIN_OFFLINE_TIMEOUT_SECONDS = 10; // Minimum 10 sn network/TCP retransmit toleransı
  public static readonly SAMPLE_WINDOW_SIZE = 5; // Son 5 ardışık paket penceresi
  public static readonly CREATION_GRACE_PERIOD_MS = 180000; // 3 dakika kurulum toleransı

  /**
   * Cihazın aktif beklenen veri gönderme aralığını ve 2x watchdog zaman aşımını hesaplar.
   * heartbeatTimeoutSeconds ile offlineTimeoutSeconds daima birebir EŞİTTİR (2x kuralı, min 10 sn).
   */
  public calculateDeviceTimeouts(dev: Partial<Device>): CalculatedTimeouts {
    const intervalMode: 'auto' | 'manual' = dev.intervalMode === 'manual' ? 'manual' : 'auto';

    let expectedInterval: number;
    if (intervalMode === 'manual' && dev.customIntervalSeconds && dev.customIntervalSeconds > 0) {
      expectedInterval = dev.customIntervalSeconds;
    } else if (dev.expectedIntervalSeconds && dev.expectedIntervalSeconds > 0) {
      expectedInterval = dev.expectedIntervalSeconds;
    } else if (dev.autoDetectedIntervalSeconds && dev.autoDetectedIntervalSeconds > 0) {
      expectedInterval = dev.autoDetectedIntervalSeconds;
    } else {
      expectedInterval = SmartIntervalService.DEFAULT_INTERVAL_SECONDS;
    }

    // Sınır koruması (2 sn - 86400 sn)
    expectedInterval = Math.max(
      SmartIntervalService.MIN_INTERVAL_SECONDS,
      Math.min(SmartIntervalService.MAX_INTERVAL_SECONDS, Math.round(expectedInterval))
    );

    // 2x Kuralı: Veri gönderim sıklığının 2 katı sürede veri gelmezse offline olur.
    // Minimum 10 saniye ağ toleransı (hücresel ağ, Wi-Fi jitter veya handshake gecikmeleri için).
    const autoTimeout = Math.max(
      expectedInterval * 2,
      SmartIntervalService.MIN_OFFLINE_TIMEOUT_SECONDS
    );

    // Kullanıcı arayüzden veya cihaz ayarlarından özel bir çevrimdışı süresi (heartbeatTimeoutSeconds)
    // belirlediyse ve bu süre hesaplanan 2x süresinden daha geniş bir tolerans sağlıyorsa (örn: cihaz 5 sn'de
    // bir gönderirken kullanıcı çevrimdışı olma süresini 60 sn yaptıysa), kullanıcının belirlediği bu
    // geniş toleransı koru. Böylece tek bir Wi-Fi gecikmesinde cihaz gereksiz yere çevrimdışına düşmez.
    const customTimeout = dev.customHeartbeatTimeoutSeconds || dev.heartbeatTimeoutSeconds || 0;
    const offlineTimeoutSeconds = Math.max(autoTimeout, customTimeout);

    // Tutarlılık kuralı: heartbeatTimeoutSeconds ile offlineTimeoutSeconds AYNI değere kilitlenir.
    const heartbeatTimeoutSeconds = offlineTimeoutSeconds;
    const warningTimeoutSeconds = Math.max(
      SmartIntervalService.MIN_OFFLINE_TIMEOUT_SECONDS,
      Math.round(offlineTimeoutSeconds * 0.7)
    );

    return {
      expectedIntervalSeconds: expectedInterval,
      offlineTimeoutSeconds,
      heartbeatTimeoutSeconds,
      warningTimeoutSeconds,
      intervalMode,
    };
  }

  /**
   * Saha cihazından yeni telemetri veya ping ulaştığında çalıştırılır:
   * 1. Cihaz durumunu 'online' yapar ve lastSeen günceller.
   * 2. Uyku/Kesinti/Offline sonrası uyanma paketlerini tespit eder; offline kalınan süreyi frekansa KATMAZ.
   * 3. Peş peşe gelen ardışık paketlerde:
   *    - 2 saniyenin altındaki burst/toplu paketleri filtreler (network jitter önleme).
   *    - Son 5 örneklik hareketli pencere (rolling window) tutar.
   *    - 3 ve üzeri örnek olduğunda en uç (min/max) aykırı değerleri (outliers) eleyerek medyan/budanmış ortalama hesaplar.
   *    - Titreme önleme (hysteresis/damping): Değişim %15 veya 2 saniyeden azsa gereksiz sıklık oynamasını engeller.
   * 4. Kullanıcı manuel sabitlediyse son ayarını kesinlikle korur.
   */
  public processDeviceTelemetryArrival(dev: Device, nowMs: number = Date.now()): Device {
    const previousLastSeen = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
    const wasOffline = dev.status === 'offline';
    const nowIso = new Date(nowMs).toISOString();

    // 1. Cihaz sinyal üretti -> online duruma geçiş
    dev.status = 'online';
    dev.previousLastSeen = dev.lastSeen;
    dev.lastSeen = nowIso;
    dev.lastTelemetryAt = nowIso;
    dev.lastMessageAt = nowIso;
    dev.consecutiveMissedTicks = 0;

    const currentCalculated = this.calculateDeviceTimeouts(dev);
    const activeInterval = currentCalculated.expectedIntervalSeconds;

    // 2. Offline / Uyku sonrası uyanma tespiti
    // Eğer cihaz daha önce offline ise veya son paketten beri aşırı uzun bir süre (aralığın 3.5 katı + 10 sn) geçtiyse
    // bu bir kesinti/uyku sonrası uyanma paketidir, bu süreyi frekans hesabına dahil etme.
    const isWakeupAfterOffline =
      wasOffline ||
      previousLastSeen === 0 ||
      nowMs - previousLastSeen > activeInterval * 3500 + 10000;

    if (!isWakeupAfterOffline && previousLastSeen > 0) {
      const deltaSec = Math.round((nowMs - previousLastSeen) / 1000);

      // Micro-burst filtresi: Cihazın yerleşik aralığı varsa (>= 10 sn),
      // çok parçalı paket gönderimleri veya ping ardışık çağrılarındaki (<= 3 sn) mikro-deltaları
      // frekans örneği havuzuna alarak aralığı yapay şekilde çökertmesini önle.
      const isMicroBurst = activeInterval >= 10 && deltaSec <= 3;

      // Sadece geçerli, burst olmayan deltalarda aralık ölçümü yap (min 2 sn)
      if (
        !isMicroBurst &&
        deltaSec >= SmartIntervalService.MIN_INTERVAL_SECONDS &&
        deltaSec <= SmartIntervalService.MAX_INTERVAL_SECONDS
      ) {
        if (!Array.isArray(dev.recentIntervals)) {
          dev.recentIntervals = [];
        }

        dev.recentIntervals.push(deltaSec);
        if (dev.recentIntervals.length > SmartIntervalService.SAMPLE_WINDOW_SIZE) {
          dev.recentIntervals.shift();
        }

        // Aykırı değerleri filtreleyerek medyan / budanmış ortalama hesapla
        let filteredInterval: number;
        if (dev.recentIntervals.length >= 3) {
          const sorted = [...dev.recentIntervals].sort((a, b) => a - b);
          // Min ve max aykırı değerleri çıkar, ortadaki değerlerin ortalamasını al
          const trimmed = sorted.slice(1, -1);
          const sum = trimmed.reduce((acc, val) => acc + val, 0);
          filteredInterval = Math.round(sum / trimmed.length);
        } else {
          const sum = dev.recentIntervals.reduce((acc, val) => acc + val, 0);
          filteredInterval = Math.round(sum / dev.recentIntervals.length);
        }

        // Sınır koruması
        filteredInterval = Math.max(
          SmartIntervalService.MIN_INTERVAL_SECONDS,
          Math.min(SmartIntervalService.MAX_INTERVAL_SECONDS, filteredInterval)
        );

        // Histerezis (Damping): Eğer mevcut tespit ile yeni tespit arasındaki fark %15'ten veya 2 saniyeden azsa zıplamayı önle
        const previousDetected = dev.autoDetectedIntervalSeconds || activeInterval;
        const diff = Math.abs(filteredInterval - previousDetected);
        if (diff >= 2 && diff / previousDetected > 0.15) {
          dev.autoDetectedIntervalSeconds = filteredInterval;
        } else if (!dev.autoDetectedIntervalSeconds) {
          dev.autoDetectedIntervalSeconds = filteredInterval;
        }

        // Kullanıcı manuel moda almadıysa beklenen aralık dinamik güncellensin
        if (dev.intervalMode !== 'manual') {
          dev.expectedIntervalSeconds = dev.autoDetectedIntervalSeconds;
        }
      }
    } else {
      // Uyanma paketi: Son kullanıcı ayarını veya mevcut aralığı koru
      if (dev.intervalMode === 'manual' && dev.customIntervalSeconds && dev.customIntervalSeconds > 0) {
        dev.expectedIntervalSeconds = dev.customIntervalSeconds;
      } else if (!dev.expectedIntervalSeconds) {
        dev.expectedIntervalSeconds = dev.autoDetectedIntervalSeconds || SmartIntervalService.DEFAULT_INTERVAL_SECONDS;
      }
    }

    // Zaman aşımlarını ve heartbeattimeout'u 2x kuralına göre senkronize et
    const updatedTimeouts = this.calculateDeviceTimeouts(dev);
    dev.expectedIntervalSeconds = updatedTimeouts.expectedIntervalSeconds;
    dev.heartbeatTimeoutSeconds = updatedTimeouts.heartbeatTimeoutSeconds;

    return dev;
  }

  /**
   * Watchdog motoru: Hem fiziksel hem sanal cihazların canlılık durumunu periyodik kontrol eder.
   * - Sanal cihazlar yapay olarak sürekli online tutulmaz; veri üretmiyorsa veya simülasyon durduysa offline olur.
   * - Yeni eklenen cihazlarda kurulum toleransı tanınır (3 dakika).
   * - 2 katı süresince veri gelmeyen cihaz çevrimdışı olur.
   */
  public evaluateDeviceWatchdog(dev: Device, nowMs: number = Date.now()): WatchdogEvaluationResult {
    // 1. Bakım modundaki cihazlar watchdog tarafından değiştirilmez
    if (dev.status === 'maintenance') {
      return { newStatus: 'maintenance', changed: false, timeoutSeconds: 0 };
    }

    // 2. Kullanıcı cihazı manuel kapattıysa (dataFlowActive === false) kesinlikle offline kalır
    if (dev.dataFlowActive === false) {
      const changed = dev.status !== 'offline';
      dev.status = 'offline';
      return {
        newStatus: 'offline',
        changed,
        reason: 'Cihaz veri akışı kullanıcı tarafından kapatıldı',
        timeoutSeconds: 0,
      };
    }

    const timeouts = this.calculateDeviceTimeouts(dev);
    const offlineTimeoutMs = timeouts.offlineTimeoutSeconds * 1000;
    const warningTimeoutMs = timeouts.warningTimeoutSeconds * 1000;

    // 3. Cihaz henüz hiç sinyal göndermemişse (yeni cihaz / ilk kurulum)
    const latestLivenessMs = getLatestLivenessTimestamp(dev);
    if (latestLivenessMs === 0) {
      const isRecentlyCreated = !dev.recentIntervals || dev.recentIntervals.length === 0;
      // İlk 3 dakika boyunca kurulum toleransı tanı
      if (isRecentlyCreated && dev.status === 'online') {
        return {
          newStatus: dev.status,
          changed: false,
          reason: 'Yeni cihaz ilk bağlantı toleransı aktif',
          timeoutSeconds: timeouts.offlineTimeoutSeconds,
        };
      }

      const changed = dev.status !== 'offline';
      dev.status = 'offline';
      return {
        newStatus: 'offline',
        changed,
        reason: 'Cihazdan henüz ilk telemetri veya canlılık sinyali alınmadı',
        timeoutSeconds: timeouts.offlineTimeoutSeconds,
        isConfirmedOffline: true,
      };
    }

    // 4. Son sinyalden bu yana geçen süreyi kontrol et (En güncel zaman: telemetry, heartbeat, message veya lastSeen)
    const elapsedMs = Math.max(0, nowMs - latestLivenessMs);
    const graceBufferSeconds = Math.max(5, Math.min(20, Math.round(timeouts.offlineTimeoutSeconds * 0.25)));
    const confirmedOfflineThresholdMs = (timeouts.offlineTimeoutSeconds + graceBufferSeconds) * 1000;
    const elapsedSeconds = Math.round(elapsedMs / 1000);

    if (elapsedMs > offlineTimeoutMs) {
      dev.consecutiveMissedTicks = (dev.consecutiveMissedTicks || 0) + 1;
      const isConfirmedOffline = elapsedMs >= confirmedOfflineThresholdMs || dev.consecutiveMissedTicks >= 3;

      const changed = dev.status !== 'offline';
      dev.status = 'offline';
      return {
        newStatus: 'offline',
        changed,
        reason: `Veri gönderim sıklığının 2 katı sürede (${timeouts.offlineTimeoutSeconds} sn) sinyal alınamadı. En son sinyalden bu yana ${elapsedSeconds} sn geçti.`,
        timeoutSeconds: timeouts.offlineTimeoutSeconds,
        isConfirmedOffline,
        graceBufferSeconds,
        elapsedSeconds,
      };
    } else if (elapsedMs > warningTimeoutMs) {
      dev.consecutiveMissedTicks = 0;
      const changed = dev.status !== 'warning';
      if (dev.status === 'online') {
        dev.status = 'warning';
      }
      return {
        newStatus: dev.status,
        changed,
        reason: 'Sinyal gecikmesi tespit edildi (tolerans sonu yaklaşıyor)',
        timeoutSeconds: timeouts.offlineTimeoutSeconds,
        isConfirmedOffline: false,
        graceBufferSeconds,
        elapsedSeconds,
      };
    } else {
      dev.consecutiveMissedTicks = 0;
      const changed = dev.status !== 'online';
      dev.status = 'online';
      return {
        newStatus: 'online',
        changed,
        timeoutSeconds: timeouts.offlineTimeoutSeconds,
        isConfirmedOffline: false,
        graceBufferSeconds,
        elapsedSeconds,
      };
    }
  }

  /**
   * Cihazın canlı pano metrik önbelleğini güvenle temizler / filtreler.
   * ÖNEMLİ GÜVENLİK GARANTİSİ:
   * Bu işlem yalnızca anlık cihaz görünümündeki (in-memory / dev.metrics) önbelleği etkiler.
   * TimescaleDB veya PostgreSQL veritabanındaki telemetri geçmiş kayıtlarına KESİNLİKLE DOKUNMAZ.
   */
  public filterLiveMetricsCache(
    dev: Device,
    staleOnly: boolean,
    nowMs: number = Date.now()
  ): { cleanedCount: number; remainingCount: number; thresholdSeconds: number } {
    if (!dev.metrics || typeof dev.metrics !== 'object') {
      dev.metrics = {};
      return { cleanedCount: 0, remainingCount: 0, thresholdSeconds: 0 };
    }

    const timeouts = this.calculateDeviceTimeouts(dev);
    const thresholdSec = timeouts.offlineTimeoutSeconds;
    const initialCount = Object.keys(dev.metrics).length;

    if (!staleOnly) {
      // Tüm anlık pano önbelleğini sıfırla
      dev.metrics = {};
      return { cleanedCount: initialCount, remainingCount: 0, thresholdSeconds: thresholdSec };
    }

    // Sadece 2x süresinden eski kalmış anlık metrikleri temizle
    const lastSeenTime = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
    const elapsedSec = lastSeenTime > 0 ? (nowMs - lastSeenTime) / 1000 : Infinity;

    if (elapsedSec > thresholdSec) {
      // Cihazın kendisi 2x süresidir veri göndermediyse anlık tüm gösterge metrikleri bayatlamıştır
      dev.metrics = {};
      return { cleanedCount: initialCount, remainingCount: 0, thresholdSeconds: thresholdSec };
    }

    return { cleanedCount: 0, remainingCount: initialCount, thresholdSeconds: thresholdSec };
  }
}

export const smartIntervalService = new SmartIntervalService();
