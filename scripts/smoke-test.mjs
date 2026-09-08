import { spawn } from 'child_process';
import http from 'http';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkEndpoint(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runSmokeTest() {
  console.log('🏗️ Starting production server bundle (dist/server.cjs) for CI smoke test...');
  
  const server = spawn('node', ['dist/server.cjs'], {
    env: { ...process.env, PORT: '3001', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let isUp = false;
  server.stdout.on('data', (d) => {
    if (d.toString().includes('Aktif!')) isUp = true;
  });

  server.stderr.on('data', (d) => {
    console.error(`[SERVER_ERR] ${d.toString().trim()}`);
  });

  // Wait up to 15 seconds for server to start
  console.log('⏳ Waiting for server to boot...');
  for (let i = 0; i < 30; i++) {
    if (isUp) break;
    await wait(500);
  }

  if (!isUp) {
    console.error('❌ Server failed to start within 15 seconds.');
    server.kill('SIGKILL');
    process.exit(1);
  }

  console.log('✅ Server booted successfully. Running Healthchecks...');

  let success = true;
  try {
    console.log('➡️ Testing /api/health/live...');
    const live = await checkEndpoint('http://127.0.0.1:3001/api/health/live');
    if (live.statusCode !== 200) throw new Error(`Live endpoint failed with status ${live.statusCode}`);
    console.log('   ✅ Live OK');
    
    console.log('➡️ Testing /api/health/ready...');
    const ready = await checkEndpoint('http://127.0.0.1:3001/api/health/ready');
    if (ready.statusCode !== 200) throw new Error(`Ready endpoint failed with status ${ready.statusCode}`);
    console.log('   ✅ Ready OK');

    console.log('🎉 Production bundle Smoke Test passed successfully!');
  } catch (err) {
    console.error('❌ Smoke test failed:', err.message);
    success = false;
  } finally {
    console.log('🛑 Shutting down server gracefully...');
    server.kill('SIGTERM');
    await wait(1000); // Give it a second to shutdown gracefully
    process.exit(success ? 0 : 1);
  }
}

runSmokeTest();
