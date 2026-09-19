import { type Request, type Response, type NextFunction } from 'express';
import { setupService } from '../services/setup.service.js';

/**
 * Extracts setup token from various HTTP request vectors:
 * 1. Header: X-Setup-Token
 * 2. Header: Authorization: Bearer <token>
 * 3. Cookie: nexus_setup_session / nexus_setup_token
 * 4. Request Body: setupToken
 * 5. Query Parameter: setupToken
 */
export function extractSetupToken(req: Request): string | null {
  // 1. X-Setup-Token header
  const headerToken = req.headers['x-setup-token'] as string;
  if (headerToken && typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  // 2. Authorization header Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }

  // 3. Setup session cookie
  const cookieToken = req.cookies?.['nexus_setup_session'] || req.cookies?.['nexus_setup_token'];
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  // 4. Request body
  if (req.body && typeof req.body === 'object' && req.body.setupToken) {
    return String(req.body.setupToken).trim();
  }

  // 5. Query parameter (useful for headless initializers)
  if (req.query?.setupToken && typeof req.query.setupToken === 'string') {
    return req.query.setupToken.trim();
  }

  return null;
}

/**
 * Checks if the current request is authenticated with a valid setup token
 */
export function isRequestSetupAuthenticated(req: Request): boolean {
  const token = extractSetupToken(req);
  if (!token) return false;
  return setupService.validateSetupToken(token);
}

/**
 * Middleware that guards First Run Setup Wizard APIs.
 * 
 * 1. Checks if setup is completed:
 *    If completed, returns HTTP 403 Forbidden with code 'SETUP_LOCKED'.
 * 
 * 2. If setup is in progress:
 *    Verifies that the request provides a valid Setup Security Token.
 *    If invalid or missing, returns HTTP 401 Unauthorized with code 'SETUP_TOKEN_REQUIRED'.
 */
export function requireSetupAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Check permanent setup lockout
  if (setupService.isSetupCompleted()) {
    res.status(403).json({
      success: false,
      code: 'SETUP_LOCKED',
      error: 'Kurulum kilitlendi.',
      message: 'NexusNode IoT kurulumu zaten tamamlanmış ve kilitlenmiştir. Güvenlik nedeniyle kurulum uç noktaları erişime kapatılmıştır.',
    });
    return;
  }

  // 2. Verify setup token
  const token = extractSetupToken(req);
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
