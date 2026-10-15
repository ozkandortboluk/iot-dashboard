import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isScannerOrProbingPath,
  isCandidateSpaRoute,
  spaRouteGuardMiddleware,
  createSpaFallbackHandler,
} from '../server/utils/spaFallbackGuard.js';
import { isWebSocketUpgradePath } from '../server/utils/wsUpgradePath.js';

describe('SPA Fallback & Scanner Probe Guard Test Suite', () => {
  let tempDir: string;
  let distDir: string;
  let testApp: express.Express;
  const mockHtmlContent = '<!DOCTYPE html><html><head><title>NexusNode IoT</title></head><body><div id="root">App</div></body></html>';

  beforeAll(() => {
    // Create an isolated temporary test directory simulating production dist/
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-spa-test-'));
    distDir = path.join(tempDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });

    // Write index.html and a valid static asset
    fs.writeFileSync(path.join(distDir, 'index.html'), mockHtmlContent, 'utf-8');
    fs.writeFileSync(path.join(distDir, 'favicon.ico'), 'MOCK_FAVICON', 'utf-8');
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'assets', 'index.js'), 'console.log("nexus");', 'utf-8');

    // Build express application replicating exact server.ts middleware order
    testApp = express();

    // 1. API routes mounted before static/SPA handlers
    testApp.get('/api/health/live', (_req, res) => {
      res.status(200).json({ status: 'alive' });
    });
    testApp.get('/api/devices', (_req, res) => {
      res.status(200).json([{ id: 'dev_01', name: 'Test Device' }]);
    });
    testApp.all('/api/*', (req, res) => {
      res.status(404).json({ error: `API uç noktası bulunamadı (404): ${req.method} ${req.originalUrl}` });
    });

    // 2. SPA Route Guard Middleware
    testApp.use(spaRouteGuardMiddleware);

    // 3. Static Assets Handler
    testApp.use(express.static(distDir));

    // 4. SPA Fallback Handler
    testApp.get('*', createSpaFallbackHandler(distDir));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Unit functions verification', () => {
    it('detects WordPress probe paths', () => {
      expect(isScannerOrProbingPath('/xmlrpc.php')).toBe(true);
      expect(isScannerOrProbingPath('/wp-includes/wlwmanifest.xml')).toBe(true);
      expect(isScannerOrProbingPath('/wp-admin')).toBe(true);
      expect(isScannerOrProbingPath('/wp-admin/')).toBe(true);
      expect(isScannerOrProbingPath('/wp-login.php')).toBe(true);
      expect(isScannerOrProbingPath('/wp-content/plugins/test.php')).toBe(true);
    });

    it('detects sensitive dotfiles and common scanner probes', () => {
      expect(isScannerOrProbingPath('/.env')).toBe(true);
      expect(isScannerOrProbingPath('/.git/config')).toBe(true);
      expect(isScannerOrProbingPath('/.htaccess')).toBe(true);
      expect(isScannerOrProbingPath('/phpmyadmin/index.php')).toBe(true);
      expect(isScannerOrProbingPath('/adminer.php')).toBe(true);
      expect(isScannerOrProbingPath('/cgi-bin/test.cgi')).toBe(true);
      expect(isScannerOrProbingPath('/actuator/health')).toBe(true);
    });

    it('detects dangerous and forbidden file extensions', () => {
      expect(isScannerOrProbingPath('/test.php')).toBe(true);
      expect(isScannerOrProbingPath('/shell.jsp')).toBe(true);
      expect(isScannerOrProbingPath('/app.asp')).toBe(true);
      expect(isScannerOrProbingPath('/backup.sql')).toBe(true);
      expect(isScannerOrProbingPath('/data.db')).toBe(true);
      expect(isScannerOrProbingPath('/config.bak')).toBe(true);
    });

    it('allows legitimate SPA routes and benign assets', () => {
      expect(isScannerOrProbingPath('/')).toBe(false);
      expect(isScannerOrProbingPath('/dashboard')).toBe(false);
      expect(isScannerOrProbingPath('/devices')).toBe(false);
      expect(isScannerOrProbingPath('/devices/dev_01')).toBe(false);
      expect(isScannerOrProbingPath('/login')).toBe(false);
      expect(isScannerOrProbingPath('/setup')).toBe(false);
      expect(isScannerOrProbingPath('/recovery')).toBe(false);
      expect(isScannerOrProbingPath('/maintenance')).toBe(false);
      expect(isScannerOrProbingPath('/favicon.ico')).toBe(false);
      expect(isScannerOrProbingPath('/assets/index.js')).toBe(false);
    });

    it('identifies candidates for SPA HTML fallback correctly', () => {
      expect(isCandidateSpaRoute({ method: 'GET', path: '/' } as any)).toBe(true);
      expect(isCandidateSpaRoute({ method: 'GET', path: '/dashboard' } as any)).toBe(true);
      expect(isCandidateSpaRoute({ method: 'GET', path: '/login' } as any)).toBe(true);
      expect(isCandidateSpaRoute({ method: 'GET', path: '/devices/dev-123' } as any)).toBe(true);

      // Rejects non-GET
      expect(isCandidateSpaRoute({ method: 'POST', path: '/dashboard' } as any)).toBe(false);
      expect(isCandidateSpaRoute({ method: 'DELETE', path: '/devices' } as any)).toBe(false);

      // Rejects scanner / probe paths
      expect(isCandidateSpaRoute({ method: 'GET', path: '/xmlrpc.php' } as any)).toBe(false);
      expect(isCandidateSpaRoute({ method: 'GET', path: '/wp-includes/wlwmanifest.xml' } as any)).toBe(false);

      // Rejects missing files with extensions
      expect(isCandidateSpaRoute({ method: 'GET', path: '/assets/nonexistent.js' } as any)).toBe(false);
      expect(isCandidateSpaRoute({ method: 'GET', path: '/missing.png' } as any)).toBe(false);
    });
  });

  describe('2. HTTP Endpoints Verification (User Requirement 3)', () => {
    it('serves root "/" with HTTP 200 and index.html', async () => {
      const res = await request(testApp).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toBe(mockHtmlContent);
    });

    it('rejects "/xmlrpc.php" with HTTP 404 (does NOT return HTML)', async () => {
      const res = await request(testApp).get('/xmlrpc.php');
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('<div id="root">');
      expect(res.text).toBe('Not Found');
    });

    it('rejects "/wp-includes/wlwmanifest.xml" with HTTP 404 (does NOT return HTML)', async () => {
      const res = await request(testApp).get('/wp-includes/wlwmanifest.xml');
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('<div id="root">');
      expect(res.text).toBe('Not Found');
    });

    it('confirms SHA-256 of "/" and "/xmlrpc.php" are completely different (Fix Verification)', async () => {
      const rootRes = await request(testApp).get('/');
      const xmlRpcRes = await request(testApp).get('/xmlrpc.php');
      const wlwRes = await request(testApp).get('/wp-includes/wlwmanifest.xml');

      const rootHash = crypto.createHash('sha256').update(rootRes.text).digest('hex');
      const xmlRpcHash = crypto.createHash('sha256').update(xmlRpcRes.text).digest('hex');
      const wlwHash = crypto.createHash('sha256').update(wlwRes.text).digest('hex');

      expect(rootRes.status).toBe(200);
      expect(xmlRpcRes.status).toBe(404);
      expect(wlwRes.status).toBe(404);

      expect(xmlRpcHash).not.toBe(rootHash);
      expect(wlwHash).not.toBe(rootHash);
    });

    it('blocks general WordPress scanner paths with HTTP 404', async () => {
      const paths = [
        '/wp-admin',
        '/wp-admin/',
        '/wp-login.php',
        '/wp-content/themes/twentytwenty/style.css',
        '/wp-config.php',
        '/wp-json',
      ];

      for (const p of paths) {
        const res = await request(testApp).get(p);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
      }
    });

    it('blocks sensitive dotfile and scanner probes with HTTP 404', async () => {
      const paths = [
        '/.env',
        '/.git/config',
        '/.htaccess',
        '/phpmyadmin',
        '/cgi-bin/status',
        '/test.php',
        '/shell.cgi',
        '/dump.sql',
      ];

      for (const p of paths) {
        const res = await request(testApp).get(p);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
      }
    });

    it('returns HTTP 404 for non-existent static assets with extensions', async () => {
      const paths = [
        '/assets/nonexistent.js',
        '/assets/missing.css',
        '/images/logo-missing.png',
        '/unknown.xyz',
      ];

      for (const p of paths) {
        const res = await request(testApp).get(p);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
      }
    });

    it('preserves genuine existing static assets', async () => {
      const faviconRes = await request(testApp).get('/favicon.ico');
      expect(faviconRes.status).toBe(200);
      expect((faviconRes.text || faviconRes.body.toString())).toBe('MOCK_FAVICON');

      const assetRes = await request(testApp).get('/assets/index.js');
      expect(assetRes.status).toBe(200);
      expect(assetRes.text).toBe('console.log("nexus");');
    });

    it('preserves real SPA page routes with HTTP 200 and index.html', async () => {
      const spaRoutes = [
        '/dashboard',
        '/devices',
        '/devices/dev_01',
        '/login',
        '/setup',
        '/recovery',
        '/maintenance',
        '/alarms',
        '/rules',
        '/customers',
        '/analytics',
        '/settings',
        '/account',
      ];

      for (const route of spaRoutes) {
        const res = await request(testApp).get(route);
        expect(res.status).toBe(200);
        expect(res.text).toBe(mockHtmlContent);
      }
    });

    it('rejects POST / PUT on SPA routes with HTTP 404', async () => {
      const postRes = await request(testApp).post('/dashboard');
      expect(postRes.status).toBe(404);

      const putRes = await request(testApp).put('/devices');
      expect(putRes.status).toBe(404);
    });

    it('preserves API routes behavior without hitting SPA fallback', async () => {
      const liveRes = await request(testApp).get('/api/health/live');
      expect(liveRes.status).toBe(200);
      expect(liveRes.body).toEqual({ status: 'alive' });

      const devRes = await request(testApp).get('/api/devices');
      expect(devRes.status).toBe(200);
      expect(devRes.body).toEqual([{ id: 'dev_01', name: 'Test Device' }]);

      const unknownApiRes = await request(testApp).get('/api/unknown-endpoint');
      expect(unknownApiRes.status).toBe(404);
      expect(unknownApiRes.body.error).toContain('API uç noktası bulunamadı (404)');
      expect(unknownApiRes.text).not.toContain('<div id="root">');
    });

    it('preserves WebSocket upgrade routing rules', () => {
      expect(isWebSocketUpgradePath('/ws')).toBe(true);
      expect(isWebSocketUpgradePath('/api/ws')).toBe(true);
      expect(isWebSocketUpgradePath('/xmlrpc.php')).toBe(false);
      expect(isWebSocketUpgradePath('/wp-includes/wlwmanifest.xml')).toBe(false);
    });

    it('blocks system file probes and diagnostic scanner paths with HTTP 404', async () => {
      const probePaths = [
        '/Dockerfile',
        '/proc/self/environ',
        '/etc/passwd',
        '/etc/environment',
        '/phpinfo',
        '/_profiler/phpinfo',
        '/server-status',
        '/server-info',
        '/kubeconfig',
        '/yonetim/giris',
        '/mudur/login',
        '/administrator/login',
        '/credentials',
      ];
      for (const p of probePaths) {
        const res = await request(testApp).get(p);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
      }
    });

    it('blocks directory traversal attacks in query strings or paths with HTTP 404', async () => {
      const attackUrls = [
        '/userfiles/x?path=../../../../etc/passwd',
        '/xstoremgwt/cheetahImages?imageId=..\..\win.ini',
        '/api/test?query=groovy:println("cat /etc/passwd")',
      ];
      for (const u of attackUrls) {
        const res = await request(testApp).get(u);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
      }
    });

    it('recognizes legitimate crawler and brand assets as non-scanner routes', () => {
      expect(isScannerOrProbingPath('/robots.txt')).toBe(false);
      expect(isScannerOrProbingPath('/sitemap.xml')).toBe(false);
      expect(isScannerOrProbingPath('/favicon.ico')).toBe(false);
      expect(isScannerOrProbingPath('/favicon.svg')).toBe(false);
      expect(isScannerOrProbingPath('/site.webmanifest')).toBe(false);
      expect(isScannerOrProbingPath('/logos/logo-mark-transparent.png')).toBe(false);
    });
  });
});
