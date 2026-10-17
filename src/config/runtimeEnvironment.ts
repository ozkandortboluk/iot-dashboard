/**
 * Frontend Runtime Environment Helper
 *
 * Provides environment detection on the browser client without exposing sensitive server internals.
 */

export type FrontendRuntimeEnvironment = 'vps' | 'aistudio' | 'local' | 'test';

export function getFrontendRuntimeEnvironment(): FrontendRuntimeEnvironment {
  // Vite exposes env vars prefixed with VITE_
  const explicit = ((import.meta as any).env?.VITE_APP_ENV || '').toLowerCase().trim();
  if (explicit === 'vps' || explicit === 'aistudio' || explicit === 'local' || explicit === 'test') {
    return explicit;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('nexusnodeiot.com.tr')) {
      return 'vps';
    }
    if (host.includes('.run.app')) {
      return 'aistudio';
    }
    // Any copy running outside production VPS is treated as development/aistudio preview
    return 'aistudio';
  }

  return 'aistudio';
}

export const isAiStudioClient = typeof window !== 'undefined' && !window.location.hostname.includes('nexusnodeiot.com.tr');
export const isLocalClient = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
