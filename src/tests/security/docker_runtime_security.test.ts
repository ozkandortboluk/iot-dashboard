import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const compose = fs.readFileSync('docker-compose.yml', 'utf8').replace(/\r\n/g, '\n');
const app = compose.split('\n  app:\n')[1]?.split('\n  proxy:\n')[0] ?? '';
const proxy = compose.split('\n  proxy:\n')[1]?.split('\n  adminer:\n')[0] ?? '';
describe('Docker runtime least privilege', () => {
  it('prevents app privilege escalation', () => expect(app).toContain('no-new-privileges:true'));
  it('drops all app Linux capabilities', () => expect(app).toContain('cap_drop:\n      - ALL'));
  it('bounds app process count', () => expect(app).toContain('pids_limit: 256'));
  it('uses an init process for the app', () => expect(app).toContain('init: true'));
  it('prevents proxy privilege escalation', () => expect(proxy).toContain('no-new-privileges:true'));
  it('drops default proxy capabilities', () => expect(proxy).toContain('cap_drop:\n      - ALL'));
  it('retains proxy low-port binding capability', () => expect(proxy).toContain('- NET_BIND_SERVICE'));
  it('bounds proxy process count', () => expect(proxy).toContain('pids_limit: 128'));
});
