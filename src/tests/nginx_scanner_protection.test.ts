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

  it('blocks docker compose metadata probes', () => {
    expect(config).toContain(String.raw`docker-compose\.ya?ml`);
    expect(config).toMatch(/location ~\* \^\/\(\?:wp-config/);
  });
});
