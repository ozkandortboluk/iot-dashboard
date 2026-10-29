import { systemLogger } from './systemLogger.service.js';

let isShuttingDown = false;
const shutdownHooks: Array<() => Promise<void> | void> = [];

export function isSystemShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * Registers an asynchronous or synchronous cleanup hook to be executed on server shutdown.
 */
export function registerShutdownHook(hook: () => Promise<void> | void): void {
  shutdownHooks.push(hook);
}

/**
 * Executes registered cleanup hooks and gracefully halts the Node.js process.
 */
export async function performGracefulShutdown(reason: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Graceful Shutdown] ${reason} - Sunucu güvenli şekilde durduruluyor...`);
  try {
    systemLogger.info('system', `[Graceful Shutdown] ${reason} (Çıkış kodu: ${exitCode})`);
  } catch {}

  // RUN-05: Absolute deadline for entire shutdown chain to prevent zombie hangs
  const forceExitDeadline = setTimeout(() => {
    console.warn(`[Graceful Shutdown] Kapanış zaman aşımına uğradı (4s deadline). Zorla çıkılıyor.`);
    process.exit(exitCode);
  }, 4000);
  forceExitDeadline.unref();

  for (const hook of shutdownHooks) {
    try {
      await hook();
    } catch (err: any) {
      console.warn('[Shutdown Hook Hatası]:', err?.message || err);
    }
  }

  clearTimeout(forceExitDeadline);
  console.log(`[Graceful Shutdown] Kapanış zinciri tamamlandı. Çıkış kodu: ${exitCode}`);
  process.exit(exitCode);
}

/**
 * Schedules a controlled system reboot with an intentional delay.
 * Allows pending HTTP responses to flush to the client browser before the process restarts.
 */
export function scheduleSystemReboot(reason: string, delayMs = 1500): void {
  try {
    systemLogger.warn('security', `[SİSTEM YENİDEN BAŞLATMA] ${reason} (${delayMs}ms sonra uygulanacak)`);
  } catch {}

  // In testing environments (Vitest/Node test), do not terminate the test runner
  if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    console.log(`[Test Env] Simüle Edilen Sistem Yeniden Başlatma: ${reason}`);
    return;
  }

  setTimeout(() => {
    performGracefulShutdown(reason, 0);
  }, delayMs);
}
