import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireSetupAuth, isRequestSetupAuthenticated, extractSetupToken } from '../server/middleware/setupAuth.js';
import { setupService } from '../server/services/setup.service.js';

describe('Production Setup Authentication & Token Security', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVitest = process.env.VITEST;
  const originalDisableSetupToken = process.env.DISABLE_SETUP_TOKEN;

  beforeEach(() => {
    // Reset completed state
    (setupService as any).isCompletedState = false;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.VITEST = originalVitest;
    process.env.DISABLE_SETUP_TOKEN = originalDisableSetupToken;
  });

  it('1. should reject legacy/canonical test token in non-test or production environment', () => {
    const fakeToken = 'setup_token_test_canonical_000000000000';
    
    // In production
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
    const isValidProd = setupService.validateSetupToken(fakeToken);
    expect(isValidProd).toBe(false);

    // In development / standard mode
    process.env.NODE_ENV = 'development';
    const isValidDev = setupService.validateSetupToken(fakeToken);
    expect(isValidDev).toBe(false);
  });

  it('2. should reject requests in production if setup token is missing or invalid', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_SETUP_TOKEN;

    const req: any = {
      path: '/configure-database',
      originalUrl: '/api/setup/configure-database',
      headers: {},
      cookies: {},
      query: {},
      body: {},
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    requireSetupAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SETUP_TOKEN_REQUIRED',
      })
    );
  });

  it('3. should allow request when authentic server setup token is provided in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISABLE_SETUP_TOKEN;

    const validToken = setupService.getOrInitSetupToken(true);
    expect(validToken).toBeTruthy();

    const req: any = {
      path: '/configure-database',
      originalUrl: '/api/setup/configure-database',
      headers: {
        'x-setup-token': validToken,
      },
      cookies: {},
      query: {},
      body: {},
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    requireSetupAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('4. should extract token from Bearer auth header and cookies', () => {
    const bearerReq: any = {
      headers: { authorization: 'Bearer secret_token_123' },
      cookies: {},
    };
    expect(extractSetupToken(bearerReq)).toBe('secret_token_123');

    const cookieReq: any = {
      headers: {},
      cookies: { nexus_setup_token: 'cookie_token_456' },
    };
    expect(extractSetupToken(cookieReq)).toBe('cookie_token_456');
  });

  it('5. should reject requests with 403 SETUP_LOCKED if setup is already completed', () => {
    process.env.NODE_ENV = 'production';
    (setupService as any).isCompletedState = true;

    const validToken = setupService.getOrInitSetupToken(true);

    const req: any = {
      path: '/create-admin',
      originalUrl: '/api/setup/create-admin',
      headers: { 'x-setup-token': validToken },
      cookies: {},
      query: {},
      body: {},
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    requireSetupAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SETUP_LOCKED',
      })
    );
  });

  it('6. should allow disaster recovery (/reset, /resume) when setup is completed ONLY if valid token is provided', () => {
    process.env.NODE_ENV = 'production';
    (setupService as any).isCompletedState = true;

    const validToken = setupService.getOrInitSetupToken(true);

    // Unauthenticated recovery request -> 401
    const unauthReq: any = {
      path: '/reset',
      originalUrl: '/api/setup/reset',
      headers: {},
      cookies: {},
      query: {},
      body: {},
    };
    const unauthRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const unauthNext = vi.fn();

    requireSetupAuth(unauthReq, unauthRes, unauthNext);
    expect(unauthNext).not.toHaveBeenCalled();
    expect(unauthRes.status).toHaveBeenCalledWith(401);

    // Authenticated recovery request -> allowed to proceed to reset handler
    const authReq: any = {
      path: '/reset',
      originalUrl: '/api/setup/reset',
      headers: { 'x-setup-token': validToken },
      cookies: {},
      query: {},
      body: {},
    };
    const authRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const authNext = vi.fn();

    requireSetupAuth(authReq, authRes, authNext);
    expect(authNext).toHaveBeenCalledOnce();
    expect(authRes.status).not.toHaveBeenCalled();
  });

  it('7. should reject missing/invalid setup token in development and AI_STUDIO mode (SEC-01 no-bypass)', () => {
    delete process.env.DISABLE_SETUP_TOKEN;
    const testCases = [
      { NODE_ENV: 'development', AI_STUDIO: 'false' },
      { NODE_ENV: 'development', AI_STUDIO: 'true' },
      { NODE_ENV: 'production', AI_STUDIO: 'true' },
    ];

    for (const tc of testCases) {
      process.env.NODE_ENV = tc.NODE_ENV;
      process.env.AI_STUDIO = tc.AI_STUDIO;

      const req: any = {
        path: '/configure-database',
        originalUrl: '/api/setup/configure-database',
        headers: {},
        cookies: {},
        query: {},
        body: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      requireSetupAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SETUP_TOKEN_REQUIRED',
        })
      );
    }
  });
});
