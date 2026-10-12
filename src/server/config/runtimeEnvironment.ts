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
  const isTestRunner = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const explicitEnv = (process.env.APP_ENV || '').toLowerCase().trim();

  // 1. In automated tests (Vitest / NODE_ENV=test), honor explicit APP_ENV overrides strictly
  if (isTestRunner) {
    if (explicitEnv === 'vps' || explicitEnv === 'aistudio' || explicitEnv === 'local' || explicitEnv === 'test') {
      return explicitEnv as RuntimeEnvironment;
    }
    if (process.env.VPS_PRODUCTION === 'true') {
      return 'vps';
    }
    return 'test';
  }

  // 2. Explicit APP_ENV override in real runtime
  if (explicitEnv === 'vps') {
    return 'vps';
  }
  if (explicitEnv === 'aistudio') {
    return 'aistudio';
  }

  // 3. VPS Production detection (VPS_PRODUCTION=true)
  if (process.env.VPS_PRODUCTION === 'true') {
    return 'vps';
  }

  // 4. Google AI Studio / Cloud Run detection (always aistudio in Cloud Run unless VPS explicitly configured)
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

/** SSH tunnels are a development-only capability, never enabled on VPS. */
export function isDevelopmentSshTunnelAllowed(): boolean {
  if (process.env.VPS_PRODUCTION === 'true' || process.env.APP_ENV?.trim().toLowerCase() === 'vps') return false;
  const env = resolveRuntimeEnvironment();
  if (env !== 'aistudio' && env !== 'local' && env !== 'test') return false;
  if (process.env.DB_SSH_TUNNEL_ENABLED === 'false' || process.env.ENABLE_SSH_TUNNEL === 'false') return false;
  return true;
}

export function isVps(): boolean {
  return resolveRuntimeEnvironment() === 'vps';
}

/**
 * Determines whether the active process is running in a real production VPS host.
 * Returns true only when NODE_ENV is production (or VPS_PRODUCTION=true) AND outside
 * the Google Cloud Run / AI Studio preview sandbox environment.
 */
export function isProductionVpsEnvironment(): boolean {
  const isVpsProd = process.env.VPS_PRODUCTION === 'true';
  const isCloudRunSandbox = Boolean(
    process.env.K_SERVICE ||
    process.env.K_REVISION ||
    process.env.CLOUD_RUN_TIMEOUT_SECONDS ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.AIS_PREVIEW === 'true' ||
    (process.env.APP_URL && /\.run\.app/i.test(process.env.APP_URL)) ||
    (process.env.DEV_APP_URL && /\.run\.app/i.test(process.env.DEV_APP_URL))
  ) && !isVpsProd;
  return (process.env.NODE_ENV === 'production' || isVpsProd) && !isCloudRunSandbox;
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
