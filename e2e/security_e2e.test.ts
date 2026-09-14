import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import WebSocket from 'ws';

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('Security & E2E Regressions (CSRF, CORS, HttpOnly, WS Auth)', () => {
  let serverProcess: any;
  let sessionCookie: string = '';
  let createdUserId: string = '';
  const PORT = 3006;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const testEmail = `test_${Date.now()}@test.com`;

  beforeAll(async () => {
    // Start production bundle if exists, else tsx server.ts
    const fs = await import('node:fs');
    const isBundled = fs.existsSync('dist/server.cjs');
    const cmd = isBundled ? 'node' : 'npx';
    const args = isBundled ? ['dist/server.cjs'] : ['tsx', 'server.ts'];

    serverProcess = spawn(cmd, args, {
      env: { ...process.env, PORT: String(PORT), SERVER_PORT: String(PORT), NODE_ENV: 'production' }
    });
    serverProcess.stderr?.on('data', (data: Buffer) => {
      // console.error(`[E2E Server stderr]: ${data}`);
    });

    let isUp = false;
    // Roadmap 3.2 #133-134: Detect startup via health endpoint polling instead of stdout string matching
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health/live`);
        if (res.status === 200) {
          isUp = true;
          break;
        }
      } catch {
        // server starting up
      }
      await wait(500);
    }
    
    if (!isUp) {
      throw new Error("E2E Server failed to start within timeout");
    }
    await wait(1000); // give it a moment to finalize WS server binding
  }, 25000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await wait(1000);
    }
  });

  describe('1. CORS Validation (Allowlist vs Invalid Origins)', () => {
    it('Should allow requests from valid origin and return Allow-Credentials', async () => {
      const res = await fetch(`${BASE_URL}/api/health/live`, {
        headers: { 'Origin': 'https://nexusnodeiot.com.tr' }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://nexusnodeiot.com.tr');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('Should return null Origin and no Credentials for malicious/invalid origins', async () => {
      const res = await fetch(`${BASE_URL}/api/health/live`, {
        headers: { 'Origin': 'http://evil-hacker.com' }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('null');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull(); 
    });
  });

  describe('2. Login, HttpOnly Cookie, and Session State', () => {
    it('Should login and set an HttpOnly & SameSite=Lax cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@nexusnodeiot.com.tr', password: 'test1234' })
      });
      
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      
      const match = setCookie!.match(/nexus_session_token=([^;]+)/);
      sessionCookie = match ? match[1] : '';
    }, 15000);

    it('Should login and return a valid session cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@nexusnodeiot.com.tr', password: 'test1234' })
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      const match = setCookie!.match(/nexus_session_token=([^;]+)/);
      sessionCookie = match ? match[1] : '';
    }, 15000);

    it('Should successfully access protected endpoint with the cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Cookie': `nexus_session_token=${sessionCookie}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBeDefined();
      createdUserId = data.user.id;
    }, 10000);
  });

  describe('3. CSRF & Preflight Defense', () => {
    it('Should reject preflight (OPTIONS) with null origin for unauthorized domains', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://evil-csrf.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('null');
    });

    it('Should reject state-changing (POST) requests with session cookie but malicious Origin', async () => {
      // Trying to trigger a state change (e.g. creating a device or updating profile)
      // The server's CORS middleware should block this because the Origin is untrusted
      const res = await fetch(`${BASE_URL}/api/devices`, {
        method: 'POST',
        headers: {
          'Origin': 'http://evil-attacker.com',
          'Content-Type': 'application/json',
          'Cookie': `nexus_session_token=${sessionCookie}`
        },
        body: JSON.stringify({ name: 'CSRF Attempt Device' })
      });
      
      // The fetch API in Node.js might handle CORS differently than a browser,
      // but we should verify the server doesn't return Allow-Credentials
      // which would enable the browser to complete the CSRF attack.
      expect(res.headers.get('access-control-allow-origin')).toBe('null');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });
  });

  describe('4. WebSocket Authentication', () => {
    it('Should successfully authenticate WS connection using the valid user session cookie', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: { 'Cookie': `nexus_session_token=${sessionCookie}` }
        });
        let opened = false;
        ws.on('open', () => {
          opened = true;
          ws.close();
          resolve(true);
        });
        ws.on('unexpected-response', (request, response) => {
          reject(new Error(`Unexpected response: ${response.statusCode}`));
        });
        ws.on('error', (err) => {
          if (!opened) reject(err);
        });
      });
    }, 10000);

    it('Should reject Unauthenticated WS with 401 Unauthorized', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
        let opened = false;
        ws.on('open', () => {
          opened = true;
          ws.close();
          reject(new Error('Connection succeeded but it should have failed without auth'));
        });
        ws.on('unexpected-response', (request, response) => {
          expect(response.statusCode).toBe(401);
          resolve(true);
        });
        ws.on('error', (err) => {
          // Standard ws behavior is to emit error after unexpected-response
          if (!opened) resolve(true);
        });
      });
    }, 10000);

    it('Should reject invalid device credentials with 401 Unauthorized', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: { 'x-api-key': 'invalid_device_token_123' }
        });
        let opened = false;
        ws.on('open', () => {
          opened = true;
          ws.close();
          reject(new Error('Connection succeeded but it should have failed with invalid credentials'));
        });
        ws.on('unexpected-response', (request, response) => {
          expect(response.statusCode).toBe(401);
          resolve(true);
        });
        ws.on('error', (err) => {
          if (!opened) resolve(true);
        });
      });
    }, 10000);

    it('Should reject revoked or expired session cookie with 401 Unauthorized', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: { 'Cookie': 'nexus_session_token=revoked_token_abc123' }
        });
        let opened = false;
        ws.on('open', () => {
          opened = true;
          ws.close();
          reject(new Error('Connection succeeded but it should have failed with revoked token'));
        });
        ws.on('unexpected-response', (request, response) => {
          expect(response.statusCode).toBe(401);
          resolve(true);
        });
        ws.on('error', (err) => {
          if (!opened) resolve(true);
        });
      });
    }, 10000);

    it('Should reject WebSocket connection from untrusted malicious Origin with 403 Forbidden', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: {
            'Cookie': `nexus_session_token=${sessionCookie}`,
            'Origin': 'https://evil-hacker-site.com',
          }
        });
        let opened = false;
        ws.on('open', () => {
          opened = true;
          ws.close();
          reject(new Error('WebSocket allowed connection from untrusted malicious origin!'));
        });
        ws.on('unexpected-response', (request, response) => {
          expect(response.statusCode).toBe(403);
          resolve(true);
        });
        ws.on('error', () => {
          if (!opened) resolve(true);
        });
      });
    }, 10000);

    it('Should allow WebSocket connection from trusted Origin', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: {
            'Cookie': `nexus_session_token=${sessionCookie}`,
            'Origin': `http://127.0.0.1:${PORT}`,
          }
        });
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error('Trusted origin connection timed out'));
        }, 5000);
        ws.on('open', () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }, 10000);

    it('Should enforce tenant isolation over WebSocket bootstrap data', async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
          headers: { 'Cookie': `nexus_session_token=${sessionCookie}` }
        });
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error('Tenant isolation test timed out'));
        }, 6000);

        ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.event === 'devices:updated') {
              // Customer should ONLY receive their own devices, never other tenants' devices
              const devices = parsed.payload;
              if (Array.isArray(devices)) {
                for (const dev of devices) {
                  // Must not belong to another customer tenant
                  if (dev.tenantId && dev.tenantId !== 'usr_admin') {
                    expect(dev.tenantId).toBe(createdUserId);
                  }
                }
              }
              clearTimeout(timer);
              ws.close();
              resolve(true);
            }
          } catch (err) {
            clearTimeout(timer);
            ws.close();
            reject(err);
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }, 10000);
  });

  describe('5. Logout and Session Expiry', () => {
    it('Should logout, invalidate cookie, and block subsequent access', async () => {
      // 1. Logout
      const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': `nexus_session_token=${sessionCookie}` }
      });
      
      expect(logoutRes.status).toBe(200);
      const setCookie = logoutRes.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/); // Invalidated
      
      // 2. Subsequent request with old cookie
      const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Cookie': `nexus_session_token=${sessionCookie}` }
      });
      
      expect(meRes.status).toBe(401);
    }, 10000);
  });
});
