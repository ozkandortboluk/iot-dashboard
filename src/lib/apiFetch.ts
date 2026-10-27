/**
 * Centralized API Fetch Utility
 *
 * Guarantees HttpOnly cookie credentials across all requests and handles graceful 401 logout events.
 */

export interface ApiFetchOptions extends RequestInit {
  skipUnauthorizedEvent?: boolean;
}

export async function apiFetch(input: RequestInfo | URL, init?: ApiFetchOptions): Promise<Response> {
  const { skipUnauthorizedEvent, ...fetchInit } = init || {};
  const headers = new Headers(fetchInit?.headers || {});
  if (!headers.has('Authorization')) {
    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('nexus_session_token') || localStorage.getItem('nexus_session_token'))
      : null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      if (!headers.has('x-auth-token')) {
        headers.set('x-auth-token', token);
      }
    }
  }
  const method = (fetchInit?.method || 'GET').toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);

  let attempts = 0;
  const maxAttempts = isIdempotent ? 2 : 1;

  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request)?.url || '';

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const res = await fetch(input, {
        ...fetchInit,
        credentials: 'include', // Guaranteed credentials AFTER init spread
        headers,
      });

      if (res.status === 401) {
        if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
          console.warn(`[apiFetch] 401 Unauthorized for URL: ${urlStr}`);
        }
        // Only trigger global logout event if not explicitly silenced and verification fails
        if (!skipUnauthorizedEvent && typeof window !== 'undefined' && (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me'))) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url: urlStr } }));
        }
      }

      return res;
    } catch (err) {
      if (attempts >= maxAttempts) {
        console.warn(`[apiFetch] Request to ${urlStr} failed after ${maxAttempts} attempts:`, err);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const finalRes = await fetch(input, {
    ...fetchInit,
    credentials: 'include', // Guaranteed credentials AFTER init spread
    headers,
  });

  if (finalRes.status === 401) {
    if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
      console.warn(`[apiFetch] 401 Unauthorized for URL: ${urlStr}`);
    }
    if (!skipUnauthorizedEvent && typeof window !== 'undefined' && (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me'))) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url: urlStr } }));
    }
  }

  return finalRes;
}

export async function safeJson<T = any>(res: Response, fallback: T): Promise<T> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
