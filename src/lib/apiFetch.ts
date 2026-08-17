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

  let attempts = 0;
  const maxAttempts = 2;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      const res = await fetch(input, {
        ...init,
        headers,
      });

      return res;
    } catch (err) {
      if (attempts >= maxAttempts) {
        console.warn(`[apiFetch] Request to ${input} failed after ${maxAttempts} attempts:`, err);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return fetch(input, {
    ...init,
    headers,
  });
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

