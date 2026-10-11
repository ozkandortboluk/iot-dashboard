/** Only documented WebSocket endpoints may receive HTTP upgrades. */
export function isWebSocketUpgradePath(pathname: string): boolean {
  return pathname === '/ws' || pathname === '/api/ws';
}
