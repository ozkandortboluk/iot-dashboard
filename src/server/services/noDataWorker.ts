import { db } from '../db.js';
import { broadcast } from './websocket.js';

let interval: NodeJS.Timeout | null = null;

export function startNoDataWorker() {
  if (interval) return;
  interval = setInterval(() => {
    checkNoData();
  }, 10_000);
  console.log('[NoDataWorker] NO_DATA (Veri Yok) alarm motoru başlatıldı (10 saniye periyot).');
}

export function stopNoDataWorker() {
  if (interval) clearInterval(interval);
  interval = null;
}

function checkNoData() {
  if (db.telemetryRepository && typeof db.telemetryRepository.evaluateNoDataRules === 'function') {
    const hasChanges = db.telemetryRepository.evaluateNoDataRules();
    if (hasChanges) {
      db.getAlarms()
        .then((a) => broadcast('alarms:updated', a))
        .catch((err) => console.warn('[NoDataWorker] Alarms fetch notice:', err?.message));
      db.getNotifications()
        .then((n) => broadcast('notifications:updated', n))
        .catch((err) => console.warn('[NoDataWorker] Notifications fetch notice:', err?.message));
    }
  }
}
