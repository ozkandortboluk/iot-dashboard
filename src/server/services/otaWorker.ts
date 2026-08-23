import { db } from '../db.js';
import type { OtaDeploymentJob } from '../../types.js';

const RETRY_INTERVALS_MS = [
  1 * 60 * 1000,   // Attempt 1: 1 minute
  5 * 60 * 1000,   // Attempt 2: 5 minutes
  15 * 60 * 1000,  // Attempt 3: 15 minutes
];

export async function processOtaJobsWorker(): Promise<{ processedCount: number; expiredCount: number }> {
  let processedCount = 0;
  let expiredCount = 0;
  const nowMs = Date.now();
  const jobs = db.getOtaJobs();

  for (const job of jobs) {
    // 1. Check expiration for active non-terminal jobs
    if (job.status !== 'SUCCESS' && job.status !== 'FAILED' && job.status !== 'CANCELLED' && job.status !== 'EXPIRED') {
      if (job.expiresAt && new Date(job.expiresAt).getTime() < nowMs) {
        job.status = 'EXPIRED';
        job.errorMessage = 'OTA güncelleme görevinin geçerlilik süresi (expires_at) doldu.';
        job.completedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
        db.saveOtaJob(job);

        const dev = db.getDeviceById(job.deviceId);
        if (dev) {
          dev.otaStatus = 'EXPIRED';
          dev.otaErrorMessage = job.errorMessage;
          dev.otaTargetFirmwareId = undefined;
          db.updateDevice(dev.id, dev);
        }
        expiredCount++;
        continue;
      }
    }

    // 2. Check for orphaned jobs stuck in DOWNLOADING / FLASHING / REBOOTING for > 15 mins without boot confirmation
    if (job.status === 'DOWNLOADING' || job.status === 'FLASHING' || job.status === 'REBOOTING' || job.status === 'VERIFYING') {
      const lastUpdated = job.updatedAt ? new Date(job.updatedAt).getTime() : new Date(job.created_at).getTime();
      const staledDurationMs = nowMs - lastUpdated;

      if (staledDurationMs > 15 * 60 * 1000) {
        job.attemptCount = (job.attemptCount || 1);
        if (job.attemptCount >= (job.maxAttempts || 3)) {
          job.status = 'FAILED';
          job.errorMessage = 'Cihaz güncelleme sonrası boot doğrulaması göndermedi (Zaman aşımı / Staled timeout). Rollback tetiklendi.';
          job.completedAt = new Date().toISOString();
        } else {
          job.status = 'PENDING';
          job.errorMessage = `Zaman aşımı. Otomatik yeniden deneme (${job.attemptCount}/${job.maxAttempts || 3}) planlandı.`;
          const nextInterval = RETRY_INTERVALS_MS[Math.min(job.attemptCount - 1, RETRY_INTERVALS_MS.length - 1)];
          job.nextRetryAt = new Date(nowMs + nextInterval).toISOString();
        }
        job.updatedAt = new Date().toISOString();
        db.saveOtaJob(job);

        const dev = db.getDeviceById(job.deviceId);
        if (dev) {
          dev.otaStatus = job.status === 'FAILED' ? 'FAILED' : 'PENDING';
          dev.otaErrorMessage = job.errorMessage;
          if (job.status === 'FAILED') dev.otaTargetFirmwareId = undefined;
          db.updateDevice(dev.id, dev);
        }
        processedCount++;
        continue;
      }
    }

    // 3. Retry worker for pending / failed jobs with remaining attempts scheduled for retry
    if (job.status === 'PENDING' && job.nextRetryAt) {
      if (new Date(job.nextRetryAt).getTime() <= nowMs) {
        // Clear nextRetryAt to allow device check to pick it up immediately
        job.nextRetryAt = undefined;
        job.updatedAt = new Date().toISOString();
        db.saveOtaJob(job);

        const dev = db.getDeviceById(job.deviceId);
        if (dev && dev.otaStatus !== 'PENDING') {
          dev.otaStatus = 'PENDING';
          db.updateDevice(dev.id, dev);
        }

        processedCount++;
      }
    }
  }

  return { processedCount, expiredCount };
}

let workerInterval: any = null;

export function startOtaWorker(intervalMs: number = 30000): void {
  if (workerInterval) return;

  // Run initial scan on boot
  processOtaJobsWorker().catch((err) => {
    console.error('[OTA Worker Error]:', err?.message || err);
  });

  workerInterval = setInterval(() => {
    processOtaJobsWorker().catch((err) => {
      console.error('[OTA Worker Error]:', err?.message || err);
    });
  }, intervalMs);

  console.log(`[OTA Worker] Arka plan OTA yeniden deneme ve zaman aşımı servisi başlatıldı (${intervalMs / 1000}s).`);
}

export function stopOtaWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
