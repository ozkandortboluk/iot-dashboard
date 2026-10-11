export const PRIVATE_PROXY_CIDRS = 'loopback, 172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16';

export function resolveTrustProxy(input: string | undefined, isVpsProduction: boolean): string | number | boolean {
  const configured = input?.trim() || PRIVATE_PROXY_CIDRS;
  if (configured === 'true') return isVpsProduction ? PRIVATE_PROXY_CIDRS : true;
  if (configured === 'false') return false;
  if (/^\d+$/.test(configured)) return Number(configured);
  return configured;
}
