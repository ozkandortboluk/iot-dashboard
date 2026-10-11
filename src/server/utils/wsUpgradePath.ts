/** Only documented WebSocket endpoints may receive HTTP upgrades. */
export function isWebSocketUpgradePath(pathname: string): boolean {
  return pathname === '/ws' || pathname === '/api/ws';
}

/** Only origin-form request targets are accepted; absolute URLs and protocol-relative paths are rejected. */
export function parseWebSocketUpgradeUrl(target?: string): URL | null {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return null;
  try {
    const parsed = new URL(target, 'http://127.0.0.1');
    return isWebSocketUpgradePath(parsed.pathname) ? parsed : null;
  } catch {
    return null;
  }
}
