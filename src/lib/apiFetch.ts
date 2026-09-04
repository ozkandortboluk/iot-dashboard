export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('dashboard_token') : null;

  const headers = new Headers(init?.headers || {});
  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('x-auth-token')) {
      headers.set('x-auth-token', token);
    }
  }

  const method = (init?.method || 'GET').toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);

  let attempts = 0;
  const maxAttempts = isIdempotent ? 2 : 1;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const res = await fetch(input, {
        ...init,
        headers,
      });

      if (res.status === 401 && typeof window !== 'undefined') {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request)?.url || '';
        // Only trigger global logout event if the primary authentication profile verification explicitly fails
        if (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me')) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url: urlStr } }));
        }
      }

      return res;
    } catch (err) {
      if (attempts >= maxAttempts) {
        console.warn(`[apiFetch] Request to ${input} failed after ${maxAttempts} attempts:`, err);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const finalRes = await fetch(input, {
    ...init,
    headers,
  });

  if (finalRes.status === 401 && typeof window !== 'undefined') {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request)?.url || '';
    if (urlStr.includes('/api/profile') || urlStr.includes('/api/auth/me')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url: urlStr } }));
    }
  }

  return finalRes;
}

export async function safeJson<T = any>(res: Response, fallback: T): Promise<T> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

