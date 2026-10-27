import { type Request, type Response, type NextFunction } from 'express';
import { setupService } from '../services/setup.service.js';
import { db } from '../db.js';

/**
 * Extracts setup token from secure HTTP request vectors only (Header or HttpOnly cookie).
 * Query parameters and request body vectors are explicitly rejected to prevent token leakage in Nginx/access logs.
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

  return null;
}

export function isRequestSetupAuthenticated(req: Request): boolean {
  // Test exception is ONLY allowed when strictly running in test mode with VITEST
  if (process.env.NODE_ENV === 'test' && process.env.VITEST === 'true' && process.env.DISABLE_SETUP_TOKEN === 'true') {
    return true;
  }
  if (setupService.isSetupCompleted()) {
    return false;
  }
  const token = extractSetupToken(req);
  if (!token) return false;
  return setupService.validateSetupToken(token);
}

/**
 * Guards setup APIs.
 * During initial installation, strictly requires valid setup token.
 * After setup completion, setup token is invalidated; disaster recovery (/reset, /resume)
 * strictly requires active admin authentication or server-side recovery token.
 */
export async function requireSetupAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  // Recovery requests (/reset, /resume)
  if (isRecoveryRequest) {
    if (isCompleted) {
      // Setup was completed: setup token is destroyed and cannot be used.
      // Recovery operations (/reset, /resume) strictly require active admin authentication OR recovery token.
      const isRecoveryTokenValid = token ? setupService.validateRecoveryToken(token) : false;

      let isAdmin = false;
      const userToken =
        (req.headers['authorization']?.startsWith('Bearer ')
          ? req.headers['authorization'].slice(7).trim()
          : (req.headers['x-auth-token'] as string)?.trim()) ||
        (req as any).cookies?.nexus_session_token;

      if (userToken) {
        try {
          const verified = (await db.verifySessionAsync(userToken).catch(() => null)) || db.verifySession(userToken);
          if (verified && (verified.user.role === 'admin' || verified.user.role === 'superadmin')) {
            isAdmin = true;
          }
        } catch {}
      }

      if (!isRecoveryTokenValid && !isAdmin) {
        res.status(401).json({
          success: false,
          code: 'SETUP_RECOVERY_AUTH_REQUIRED',
          error: 'Yetkisiz kurulum kurtarma isteği.',
          message: 'Kurulum tamamlandıktan sonra sıfırlama veya devam ettirme işlemleri geçerli yönetici oturumu veya kurtarma anahtarı (recovery token) gerektirir.',
          hint: 'Yönetici olarak giriş yapınız veya data/.recovery_token içindeki anahtarı X-Setup-Token başlığı ile gönderiniz.',
        });
        return;
      }
      next();
      return;
    } else {
      // Initial setup in progress: requires valid setup token
      if (!token || !setupService.validateSetupToken(token)) {
        res.status(401).json({
          success: false,
          code: 'SETUP_TOKEN_REQUIRED',
          error: 'Yetkisiz kurulum kurtarma isteği.',
          message: 'Kurulumu sıfırlamak veya devam ettirmek için sunucudaki geçerli Setup Token gereklidir.',
          hint: 'Anahtar data/.setup_token dosyasında veya sunucu başlangıç günlüğünde bulunur.',
        });
        return;
      }
      next();
      return;
    }
  }

  // When setup is completed and locked, reject all other setup endpoints
  if (isCompleted) {
    res.status(403).json({
      success: false,
      code: 'SETUP_LOCKED',
      error: 'Kurulum kilitlendi.',
      message: 'NexusNode IoT kurulumu zaten tamamlanmış ve kilitlenmiştir. Güvenlik nedeniyle kurulum uç noktaları erişime kapatılmıştır.',
    });
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
