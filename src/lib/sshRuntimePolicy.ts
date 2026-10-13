/**
 * The API runtime response is authoritative for showing development SSH controls.
 * A missing or contradictory flag must never expose production-only SSH UI.
 */
type RuntimeInfo = {
  environment?: unknown;
  isAiStudio?: unknown;
  isVps?: unknown;
  sshTunnelAllowed?: unknown;
};

export function isConfirmedAiStudioRuntime(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as RuntimeInfo;
  return data.environment === 'aistudio' &&
    data.isAiStudio === true &&
    data.isVps !== true;
}

export function canShowSshControls(value: unknown): boolean {
  return isConfirmedAiStudioRuntime(value) &&
    (value as RuntimeInfo).sshTunnelAllowed === true;
}
