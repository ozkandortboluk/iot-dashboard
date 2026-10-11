import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const config = fs.readFileSync(path.resolve(process.cwd(), 'docker/nginx/nginx.conf'), 'utf8');

describe('Nginx scanner probe protection', () => {
  it('blocks dotfiles using a literal dot matcher', () => {
    expect(config).toContain(String.raw`location ~ (^|/)\.(?!well-known(?:/|$)) {`);
    expect(config).not.toContain(String.raw`location ~ (^|/)\\.(?!well-known(?:/|$)) {`);
  });

  it('preserves the ACME challenge exception', () => {
    expect(config).toContain('location /.well-known/acme-challenge/ {');
    expect(config).toContain('try_files $uri =404;');
  });

  it('blocks wp-config probes with a literal extension dot', () => {
    expect(config).toContain(String.raw`wp-config\.php`);
    expect(config).not.toContain(String.raw`wp-config\\.php`);
  });

  it('blocks composer and package metadata probes', () => {
    expect(config).toContain(String.raw`composer\.(?:json|lock)`);
    expect(config).toContain(String.raw`package(?:-lock)?\.json`);
  });

  it('defines a bounded per-IP request rate zone', () => {
    expect(config).toContain('limit_req_zone $binary_remote_addr zone=nexus_api:10m rate=20r/s;');
    expect(config).toContain('limit_req_status 429;');
  });

  it('enforces connection limits for WebSocket clients', () => {
    expect(config).toContain('limit_conn_zone $binary_remote_addr zone=nexus_conn:10m;');
    expect(config).toContain('limit_conn nexus_conn 30;');
  });

  it('enforces request throttling on regular HTTP routes', () => {
    expect(config).toContain('limit_req zone=nexus_api burst=80 nodelay;');
    expect(config).toContain('limit_conn nexus_conn 60;');
  });

  it('enforces WebSocket upgrade throttling', () => {
    expect(config).toContain('limit_req zone=nexus_api burst=30 nodelay;');
  });

  it('blocks docker compose metadata probes', () => {
    expect(config).toContain(String.raw`docker-compose\.ya?ml`);
    expect(config).toMatch(/location ~\* \^\/\(\?:wp-config/);
  });
});
