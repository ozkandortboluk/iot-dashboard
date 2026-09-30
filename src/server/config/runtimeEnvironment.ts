/**
 * Centralized Runtime Environment Configuration
 *
 * Provides reliable, unified environment classification across the entire server:
 * - 'vps': Production VPS deployment (Docker/standalone on host)
 * - 'aistudio': Google AI Studio development / preview sandbox (Cloud Run)
 * - 'local': Local workstation development (Node.js / tsx on localhost)
 * - 'test': Automated testing (Vitest / CI)
 */

export type RuntimeEnvironment = 'vps' | 'aistudio' | 'local' | 'test';

export interface RuntimeConfig {
  environment: RuntimeEnvironment;
  isVps: boolean;
  isAiStudio: boolean;
  isLocal: boolean;
  isTest: boolean;
  isProductionRuntime: boolean;
  isDevelopmentRuntime: boolean;
}

/**
 * Resolves the active runtime environment using APP_ENV with robust fallbacks.
 */
export function resolveRuntimeEnvironment(): RuntimeEnvironment {
  // 1. Explicit APP_ENV override has highest priority
  const explicitEnv = (process.env.APP_ENV || '').toLowerCase().trim();
  if (explicitEnv === 'vps' || explicitEnv === 'aistudio' || explicitEnv === 'local' || explicitEnv === 'test') {
    return explicitEnv;
  }

  // 2. VPS Production detection (VPS_PRODUCTION=true)
  if (process.env.VPS_PRODUCTION === 'true') {
    return 'vps';
  }

  // 3. Automated test detection (VITEST or NODE_ENV=test)
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return 'test';
  }

  // 4. Google AI Studio / Cloud Run detection
  const isCloudRun = Boolean(
    process.env.K_SERVICE ||
    process.env.K_REVISION ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.AIS_PREVIEW === 'true'
  );
  const isRunAppUrl = Boolean(
    (process.env.APP_URL && /\.run\.app/i.test(process.env.APP_URL)) ||
    (process.env.DEV_APP_URL && /\.run\.app/i.test(process.env.DEV_APP_URL))
  );

  if (isCloudRun || isRunAppUrl) {
    return 'aistudio';
  }

  // 5. Fallback for generic production without AI Studio indicators
  if (process.env.NODE_ENV === 'production') {
    return 'vps';
  }

  // 6. Default to local workstation development
  return 'local';
}

export function isVps(): boolean {
  return resolveRuntimeEnvironment() === 'vps';
}

export function isAiStudio(): boolean {
  return resolveRuntimeEnvironment() === 'aistudio';
}

export function isLocal(): boolean {
  return resolveRuntimeEnvironment() === 'local';
}

export function isTest(): boolean {
  return resolveRuntimeEnvironment() === 'test';
}

export function isProductionRuntime(): boolean {
  return isVps();
}

export function isDevelopmentRuntime(): boolean {
  const env = resolveRuntimeEnvironment();
  return env === 'local' || env === 'aistudio';
}

/**
 * Returns structured runtime environment flags for use across the application.
 */
export function getRuntimeConfig(): RuntimeConfig {
  const env = resolveRuntimeEnvironment();
  return {
    environment: env,
    isVps: env === 'vps',
    isAiStudio: env === 'aistudio',
    isLocal: env === 'local',
    isTest: env === 'test',
    isProductionRuntime: env === 'vps',
    isDevelopmentRuntime: env === 'local' || env === 'aistudio',
  };
}

export const runtimeConfig = getRuntimeConfig();
