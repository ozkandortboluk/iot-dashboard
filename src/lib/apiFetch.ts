/**
 * Centralized API Fetch Utility
 *
 * Guarantees HttpOnly cookie credentials across all requests and handles graceful 401 logout events.
 */

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const method = (init?.method || 'GET').toUpperCase();
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
        ...init,
        credentials: 'include', // Guaranteed credentials AFTER init spread
        headers,
      });

      if (res.status === 401) {
        if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
          console.warn(`[apiFetch] 401 Unauthorized for URL: ${urlStr}`);
        }
        // Only trigger global logout event if the primary authentication profile verification explicitly fails
        if (typeof window !== 'undefined' && (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me'))) {
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
    ...init,
    credentials: 'include', // Guaranteed credentials AFTER init spread
    headers,
  });

  if (finalRes.status === 401) {
    if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
      console.warn(`[apiFetch] 401 Unauthorized for URL: ${urlStr}`);
    }
    if (typeof window !== 'undefined' && (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me'))) {
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
