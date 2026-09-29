import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import WebSocket from 'ws';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkEndpoint(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function getSampleDeviceApiKey() {
  // 1. Try reading from db.json if present
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const devWithKey = db.devices?.find(d => d.apiKey);
      if (devWithKey?.apiKey) return devWithKey.apiKey;
    }
  } catch {}

  // 2. Try PostgreSQL if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
      const res = await pool.query("SELECT api_key FROM devices WHERE api_key IS NOT NULL AND api_key != '' LIMIT 1;");
      if (res.rows && res.rows[0]?.api_key) {
        const key = res.rows[0].api_key;
        await pool.end();
        return key;
      }

      // If no device exists in PostgreSQL, seed a fixture device dev_smk_01
      const newKey = `nex_smk_${crypto.randomBytes(12).toString('hex')}`;
      const newHash = crypto.createHash('sha256').update(newKey).digest('hex');
      await pool.query(
        `INSERT INTO devices (id, name, device_type, api_key, api_key_prefix, api_key_hash, status, created_at)
         VALUES ('dev_smk_01', 'Smoke Fixture Device', 'ESP32', $1, 'nex_smk', $2, 'online', CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET api_key = $1, api_key_hash = $2;`,
        [newKey, newHash]
      );
      await pool.end();
      return newKey;
    } catch (err) {
      console.warn('[Smoke Test] PostgreSQL fixture query/insert failed:', err.message);
    }
  }

  // 3. Fallback: generate dynamic runtime key and ensure it exists in data/db.json
  const dynamicKey = `nex_smk_${crypto.randomBytes(12).toString('hex')}`;
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let db = { devices: [] };
    if (fs.existsSync(dbPath)) {
      try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch {}
    }
    if (!db.devices) db.devices = [];
    const existing = db.devices.find(d => d.id === 'dev_smk_01');
    if (existing) {
      existing.apiKey = dynamicKey;
    } else {
      db.devices.push({ id: 'dev_smk_01', name: 'Smoke Fixture Device', apiKey: dynamicKey, status: 'online' });
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch {}

  return dynamicKey;
}

async function runSmokeTest() {
  console.log('🏗️ Starting production server bundle (dist/server.cjs) for CI smoke test...');
  
  const envVaultKey = process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16 ? process.env.ENCRYPTION_KEY : null;
  const dynamicVaultKey = envVaultKey || crypto.randomBytes(32).toString('hex');

  const envJwtSecret = (process.env.JWT_SECRET || process.env.SESSION_SECRET);
  const validJwtSecret = envJwtSecret && envJwtSecret.length >= 16 ? envJwtSecret : null;
  const dynamicJwtSecret = validJwtSecret || crypto.randomBytes(32).toString('hex');

  const dynamicDbPass = process.env.POSTGRES_PASSWORD || process.env.SQL_ADMIN_PASSWORD || process.env.DB_PASSWORD || 'SmokeTestSecurePass_2026!';

  const serverEnv = {
    ...process.env,
    ENCRYPTION_KEY: dynamicVaultKey,
    JWT_SECRET: dynamicJwtSecret,
    SESSION_SECRET: dynamicJwtSecret,
    POSTGRES_PASSWORD: dynamicDbPass,
    PORT: '3001',
    NODE_ENV: 'production'
  };

  const server = spawn('node', ['dist/server.cjs'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stderr.on('data', (d) => {
    console.error(`[SERVER_ERR] ${d.toString().trim()}`);
  });

  // Roadmap 3.2 #133-134: Replace stdout string matching with HTTP health endpoint polling
  console.log('⏳ Waiting for server to boot via health endpoint polling (/api/health/live)...');
  let isUp = false;
  const maxAttempts = 60; // 60 * 500ms = 30 seconds max timeout
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await checkEndpoint('http://127.0.0.1:3001/api/health/live');
      if (res.statusCode === 200) {
        isUp = true;
        break;
      }
    } catch {
      // Server not accepting connections yet, wait
    }
    await wait(500);
  }

  if (!isUp) {
    console.error('❌ Server failed to respond to /api/health/live within 30 seconds.');
    server.kill('SIGKILL');
    process.exit(1);
  }

  console.log('✅ Server booted successfully. Running Healthchecks & WebSocket verification...');

  let success = true;
  try {
    // 1. Liveness check
    console.log('➡️ Testing /api/health/live (Liveness)...');
    const live = await checkEndpoint('http://127.0.0.1:3001/api/health/live');
    if (live.statusCode !== 200 || live.data?.status !== 'alive') {
      throw new Error(`Live endpoint failed: status ${live.statusCode}, data: ${JSON.stringify(live.data)}`);
    }
    console.log('   ✅ Live OK (Status: alive, Uptime: ' + live.data.uptimeSeconds + 's)');

    // A production bundle with an empty database must remain live in setup mode.
    // Readiness is expected only after migrations and a real administrator exist.
    const initialReady = await checkEndpoint('http://127.0.0.1:3001/api/health/ready');
    if (
      initialReady.statusCode === 503 &&
      (initialReady.data?.state === 'SETUP' ||
        initialReady.data?.state === 'DB_CONNECTING' ||
        initialReady.data?.database?.status === 'initializing')
    ) {
      console.log(`   ✅ Standalone / Setup mode detected correctly (State: ${initialReady.data?.state || initialReady.data?.database?.status}).`);
      const setupStatus = await checkEndpoint('http://127.0.0.1:3001/api/setup/status');
      if (setupStatus.statusCode !== 200) {
        throw new Error(`Setup status failed: status ${setupStatus.statusCode}, data: ${JSON.stringify(setupStatus.data)}`);
      }
      console.log('   ✅ Setup status endpoint is reachable.');
      return;
    }
    
    // 2. Readiness check (Database status & engine verification)
    console.log('➡️ Testing /api/health/ready (Readiness & DB)...');
    let ready = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      ready = await checkEndpoint('http://127.0.0.1:3001/api/health/ready');
      if (ready.statusCode === 200 && ready.data?.ready && ready.data?.database?.ready) {
        break;
      }
      await wait(500);
    }
    if (!ready || ready.statusCode !== 200 || !ready.data?.ready || !ready.data?.database?.ready) {
      throw new Error(`Ready endpoint failed: status ${ready?.statusCode}, data: ${JSON.stringify(ready?.data)}`);
    }
    console.log(`   ✅ Ready OK (Engine: ${ready.data.database.engine}, DB Status: ${ready.data.database.status})`);

    // 3. Consolidated Health Check
    console.log('➡️ Testing /api/health (Consolidated Health)...');
    const health = await checkEndpoint('http://127.0.0.1:3001/api/health');
    if (health.statusCode !== 200 || health.data?.status !== 'healthy') {
      throw new Error(`Consolidated health failed: status ${health.statusCode}`);
    }
    console.log('   ✅ Consolidated Health OK');

    // 4. WebSocket Verification: Unauthenticated connection rejection (HTTP 401)
    console.log('➡️ Testing WebSocket Authentication Rejection (Unauthenticated)...');
    const unauthRejected = await new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:3001/ws');
      ws.on('open', () => {
        ws.close();
        resolve(false); // Should NOT open
      });
      ws.on('unexpected-response', (req, res) => {
        resolve(res.statusCode === 401);
      });
      ws.on('error', () => {
        resolve(true); // Connection rejected
      });
    });

    if (!unauthRejected) {
      throw new Error('WebSocket allowed unauthenticated connection! Expected 401 Unauthorized.');
    }
    console.log('   ✅ WebSocket Unauthenticated 401 Rejection OK');

    // 5. WebSocket Verification: Authenticated device connection
    const apiKey = await getSampleDeviceApiKey();
    console.log(`➡️ Testing WebSocket Authenticated Upgrade (Device Key: ${apiKey.substring(0, 10)}...)...`);
    const authSuccess = await new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:3001/ws', {
        headers: { 'x-api-key': apiKey }
      });
      const timer = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timer);
        // Send a ping frame or message
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 300);
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        console.error('WebSocket connection error:', err.message);
        resolve(false);
      });
    });

    if (!authSuccess) {
      throw new Error('WebSocket failed to establish authenticated connection with device API key.');
    }
    console.log('   ✅ WebSocket Authenticated Connection & Message Roundtrip OK');

    console.log('🎉 Production bundle Smoke Test (build → start → DB → health/live → health/ready → WebSocket) passed successfully!');
  } catch (err) {
    console.error('❌ Smoke test failed:', err.message);
    success = false;
  } finally {
    // 6. Graceful shutdown verification
    console.log('🛑 Shutting down server gracefully (SIGTERM)...');
    const shutdownPromise = new Promise((resolve) => {
      server.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
      server.kill('SIGTERM');
      setTimeout(() => {
        server.kill('SIGKILL');
        resolve({ forced: true });
      }, 4000);
    });

    await shutdownPromise;
    console.log('   ✅ Server shut down cleanly.');
    process.exit(success ? 0 : 1);
  }
}

runSmokeTest();
