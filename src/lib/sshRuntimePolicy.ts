/**
 * The API runtime response is authoritative for showing development SSH controls.
 * A missing or contradictory flag must never expose production-only SSH UI.
 */
type RuntimeInfo = {
  environment?: unknown;
  isAiStudio?: unknown;
  isVps?: unknown;
  isLocal?: unknown;
  isDevelopmentRuntime?: unknown;
  sshTunnelAllowed?: unknown;
};

export function isConfirmedAiStudioRuntime(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as RuntimeInfo;
  return data.environment === 'aistudio' &&
    data.isAiStudio === true &&
    data.isVps === false;
}

export function isConfirmedDevelopmentRuntime(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as RuntimeInfo;
  if (data.isVps !== false || data.environment === 'vps') return false;
  return (
    data.environment === 'aistudio' ||
    data.environment === 'local' ||
    data.isAiStudio === true ||
    data.isLocal === true ||
    data.isDevelopmentRuntime === true
  );
}

export function canShowSshControls(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as RuntimeInfo;
  return isConfirmedDevelopmentRuntime(value) &&
    data.sshTunnelAllowed === true;
}

