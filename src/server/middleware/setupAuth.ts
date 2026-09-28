import { type Request, type Response, type NextFunction } from 'express';
import { setupService } from '../services/setup.service.js';

/**
 * Extracts setup token from supported HTTP request vectors.
 */
export function extractSetupToken(req: Request): string | null {
  const headerToken = req.headers['x-setup-token'] as string;
  if (headerToken && typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }

  const cookieToken = req.cookies?.['nexus_setup_session'] || req.cookies?.['nexus_setup_token'];
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  if (req.body && typeof req.body === 'object' && req.body.setupToken) {
    return String(req.body.setupToken).trim();
  }

  if (req.query?.setupToken && typeof req.query.setupToken === 'string') {
    return req.query.setupToken.trim();
  }

  return null;
}

export function isRequestSetupAuthenticated(req: Request, allowIfCompleted: boolean = false): boolean {
  // Test exception is ONLY allowed when strictly running in test mode with VITEST
  if (process.env.NODE_ENV === 'test' && process.env.VITEST === 'true' && process.env.DISABLE_SETUP_TOKEN === 'true') {
    return true;
  }
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  const token = extractSetupToken(req);
  if (!token) return false;
  return setupService.validateSetupToken(token, allowIfCompleted);
}

/**
 * Guards setup APIs. Reset/resume remain available for disaster recovery, but
 * require the server-side setup token when the installation is locked.
 */
export function requireSetupAuth(req: Request, res: Response, next: NextFunction): void {
  // Test exception is ONLY allowed when strictly running in test mode with VITEST
  if (process.env.NODE_ENV === 'test' && process.env.VITEST === 'true' && process.env.DISABLE_SETUP_TOKEN === 'true') {
    next();
    return;
  }

  const isCompleted = setupService.isSetupCompleted();
  const isRecoveryRequest =
    req.path === '/reset' ||
    req.path === '/resume' ||
    req.originalUrl?.endsWith('/reset') ||
    req.originalUrl?.endsWith('/resume');

  const token = extractSetupToken(req);

  // Recovery requests (/reset, /resume) always require a valid setup recovery token
  if (isRecoveryRequest) {
    if (!token || !setupService.validateSetupToken(token, true)) {
      res.status(401).json({
        success: false,
        code: 'SETUP_RECOVERY_TOKEN_REQUIRED',
        error: 'Yetkisiz kurulum kurtarma isteği.',
        message: 'Kurulumu sıfırlamak veya devam ettirmek için sunucudaki geçerli Setup Token gereklidir.',
        hint: 'Anahtar data/.setup_token dosyasında, Docker secret içinde veya sunucu başlangıç günlüğünde bulunur.',
      });
      return;
    }
    next();
    return;
  }

  // When setup is completed and locked, reject other endpoints
  if (isCompleted) {
    res.status(403).json({
      success: false,
      code: 'SETUP_LOCKED',
      error: 'Kurulum kilitlendi.',
      message: 'NexusNode IoT kurulumu zaten tamamlanmış ve kilitlenmiştir. Güvenlik nedeniyle kurulum uç noktaları erişime kapatılmıştır.',
    });
    return;
  }

  // Development environment: allow seamless setup experience for standard wizard steps
  if (process.env.NODE_ENV === 'development') {
    next();
    return;
  }

  if (!token || !setupService.validateSetupToken(token)) {
    res.status(401).json({
      success: false,
      code: 'SETUP_TOKEN_REQUIRED',
      error: 'Yetkisiz kurulum isteği.',
      message: 'Yetkisiz erişim. Kurulum işlemlerini gerçekleştirmek için geçerli bir Kurulum Güvenlik Anahtarı (Setup Token) gereklidir.',
      hint: 'Kurulum güvenlik anahtarı sunucu konsol çıktısında veya data/.setup_token dosyasında yer almaktadır. Lütfen X-Setup-Token başlığı ile gönderiniz.',
    });
    return;
  }

  next();
}
