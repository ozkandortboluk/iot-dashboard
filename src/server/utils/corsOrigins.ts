/**
 * Explicit Origin Allowlist for CORS, CSRF, and WebSocket Connection Validation
 *
 * Replaces overly broad wildcards (*.run.app, *.nexusnodeiot.com.tr) with an explicit,
 * strictly audited set of production and development origins.
 */

function getCleanOrigin(urlStr?: string): string | null {
  if (!urlStr || !urlStr.trim()) return null;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.origin.toLowerCase();
  } catch {
    return urlStr.trim().toLowerCase().replace(/\/+$/, '');
  }
}

// Static explicit allowed origins
const STATIC_EXPLICIT_ORIGINS = new Set([
  'https://nexusnodeiot.com.tr',
  'https://www.nexusnodeiot.com.tr',
  'http://nexusnodeiot.com.tr',
  'http://www.nexusnodeiot.com.tr',
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

/**
 * Checks if a given origin or referer string matches the explicit allowlist.
 */
export function isOriginAllowed(originOrReferer?: string | null): boolean {
  if (!originOrReferer || !originOrReferer.trim()) {
    return false;
  }

  const clean = getCleanOrigin(originOrReferer);
  if (!clean) return false;

  // 1. Check static production origins
  if (STATIC_EXPLICIT_ORIGINS.has(clean)) {
    return true;
  }

  // 2. Check local development origins
  if (LOCAL_DEV_ORIGINS.has(clean)) {
    return true;
  }

  // 3. Check explicitly configured runtime environment origins (e.g. APP_URL, CLIENT_ORIGIN)
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
