/**
 * Explicit Origin Allowlist for CORS, CSRF, and WebSocket Connection Validation
 *
 * Configured per runtime environment (vps, aistudio, local, test) with strict deny-by-default.
 */

import { resolveRuntimeEnvironment } from '../config/runtimeEnvironment.js';

function getCleanOrigin(urlStr?: string): string | null {
  if (!urlStr || !urlStr.trim()) return null;
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

// Static production origins (HTTPS only)
const STATIC_VPS_ORIGINS = new Set([
  'https://nexusnodeiot.com.tr',
  'https://www.nexusnodeiot.com.tr',
  'https://app.nexusnodeiot.com.tr',
]);

// Local development origins
const LOCAL_DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://localhost:3000',
  'https://localhost:5173',
  'https://127.0.0.1:3000',
  'https://127.0.0.1:5173',
]);

// Local loopback regex (allows any localhost or 127.0.0.1 port in local/test environments)
const LOCAL_LOOPBACK_REGEX = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

// Multi-segment Cloud Run domain pattern (e.g. https://ais-dev-...europe-west1.run.app)
const CLOUD_RUN_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/i;
const GOOGLE_ORIGIN_REGEX = /^https:\/\/(?:[a-z0-9-]+\.)*(?:google\.com|googleusercontent\.com)$/i;

/**
 * Checks if a given origin or referer string matches the explicit allowlist for the current environment.
 */
export function isOriginAllowed(originOrReferer?: string | null): boolean {
  if (!originOrReferer || !originOrReferer.trim()) {
    return false;
  }

  const clean = getCleanOrigin(originOrReferer);
  if (!clean) return false;

  const env = resolveRuntimeEnvironment();

  // 1. Static production origins (always allowed)
  if (STATIC_VPS_ORIGINS.has(clean)) {
    return true;
  }

  // 2. Local development & test: Allow localhost & loopback variants
  if (env === 'local' || env === 'test') {
    if (LOCAL_LOOPBACK_REGEX.test(clean) || LOCAL_DEV_ORIGINS.has(clean)) {
      return true;
    }
  }

  // 3. AI Studio / Preview / Test / Local: Allow Google Cloud Run & AI Studio preview domains (not allowed in VPS production)
  if (env !== 'vps') {
    if (CLOUD_RUN_ORIGIN_REGEX.test(clean) || GOOGLE_ORIGIN_REGEX.test(clean)) {
      return true;
    }
  }

  // 4. Runtime environment variable overrides (APP_URL, CLIENT_ORIGIN, ALLOWED_ORIGINS)
  const appUrlOrigin = getCleanOrigin(process.env.APP_URL);
  if (appUrlOrigin && clean === appUrlOrigin) {
    return true;
  }

  const clientOrigin = getCleanOrigin(process.env.CLIENT_ORIGIN);
  if (clientOrigin && clean === clientOrigin) {
    return true;
  }

  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  if (allowedOriginsEnv) {
    const list = allowedOriginsEnv.split(',').map((o) => getCleanOrigin(o)).filter(Boolean);
    if (list.includes(clean)) {
      return true;
    }
  }

  return false;
}

export function isAllowedWsOrigin(origin?: string | null): boolean {
  // Non-browser clients (ESP32, NodeMCU, Python IoT scripts, curl) don't send Origin header
  if (!origin || !origin.trim()) {
    return true;
  }
  return isOriginAllowed(origin);
}
