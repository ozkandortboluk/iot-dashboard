import type express from 'express';
import { db } from '../db.js';
import type { User, ServiceToken } from '../../types.js';
import { isOriginAllowed } from '../utils/corsOrigins.js';

export interface AuthenticatedRequest extends express.Request {
  user?: User;
  sessionToken?: string;
  authType?: 'user' | 'service';
  serviceToken?: ServiceToken;
  scopes?: string[];
}

function getRequiredScopeForRoute(method: string, path: string): string | null {
  const isRead = method === 'GET' || method === 'HEAD';
  if (
    path.startsWith('/api/devices') ||
    path.startsWith('/api/commands') ||
    path.startsWith('/api/ota') ||
    path.startsWith('/api/firmware') ||
    path.startsWith('/api/network')
  ) {
    return isRead ? 'devices:read' : 'devices:write';
  }
  if (path.startsWith('/api/telemetry') || path.startsWith('/api/timescale')) return isRead ? 'telemetry:read' : 'telemetry:write';
  if (path.startsWith('/api/alarms')) return isRead ? 'alarms:read' : 'alarms:write';
  if (path.startsWith('/api/rules')) return isRead ? 'rules:read' : 'rules:write';
  if (path.startsWith('/api/dashboard')) return 'dashboard:read';
  if (path.startsWith('/api/automations')) return isRead ? 'rules:read' : 'rules:write';
  if (path.startsWith('/api/notifications')) return isRead ? 'alarms:read' : 'alarms:write';
  return null;
}

function hasScope(tokenScopes: string[], required: string): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return false;
  if (tokenScopes.includes('all') || tokenScopes.includes('*')) return true;
  if (tokenScopes.includes(required)) return true;
  const category = required.split(':')[0];
  if (tokenScopes.includes(`${category}:*`)) return true;
  return false;
}

// Authentication Middleware: Verifies authorization token from cookies (HttpOnly) or headers (Bearer / Service Token)
export async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = req.headers['x-auth-token'] as string;
  let isFromHeader = Boolean(token);

  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
    isFromHeader = true;
  }

  // Fallback to HttpOnly cookie if header token is absent
  let isCookieAuth = false;
  if (!token && (req as any).cookies?.nexus_session_token) {
    token = (req as any).cookies.nexus_session_token;
    isCookieAuth = true;
  }

  if (!token || !token.trim()) {
    return res.status(401).json({
      error: 'Erişim Engellendi (401): Kimlik doğrulama jetonu (Authorization Token) eksik. Lütfen sisteme giriş yapın.',
    });
  }

  const cleanToken = token.trim();

  // 1. Service Token Authentication (Starts with 'nxs_srv_')
  if (cleanToken.startsWith('nxs_srv_')) {
    const reqPath = req.originalUrl || req.path;
    const isSensitiveEndpoint =
      reqPath.startsWith('/api/setup') ||
      reqPath.startsWith('/api/database') ||
      reqPath.startsWith('/api/system/secrets') ||
      reqPath.startsWith('/api/admin') ||
      reqPath.startsWith('/api/server');

    if (isSensitiveEndpoint) {
      return res.status(403).json({
        error: 'Yetkisiz İşlem (403): Servis jetonları ile bu hassas yönetim uç noktalarına erişim kesinlikle engellenmiştir.',
      });
    }

    const verifiedService = await db.verifyServiceTokenAsync(cleanToken);
    if (!verifiedService) {
      return res.status(401).json({
        error: 'Erişim Engellendi (401): Geçersiz, iptal edilmiş veya süresi dolmuş servis jetonu.',
      });
    }

    // Strict Default-Deny Allowlist Check for Service Tokens
    const requiredScope = getRequiredScopeForRoute(req.method, reqPath);
    if (!requiredScope) {
      return res.status(403).json({
        error: `Yetkisiz İşlem (403): Servis jetonları için '${reqPath}' uç noktası izin verilenler listesinde (allowlist) kayıtlı değildir.`,
      });
    }

    if (!hasScope(verifiedService.serviceToken.scopes, requiredScope)) {
      return res.status(403).json({
        error: `Yetkisiz İşlem (403): Bu işlem için '${requiredScope}' yetkisi (scope) gereklidir.`,
      });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.user = verifiedService.user;
    authReq.authType = 'service';
    authReq.serviceToken = verifiedService.serviceToken;
    authReq.scopes = verifiedService.serviceToken.scopes;
    return next();
  }

  // 2. Browser Cookie Session Strict CSRF Validation for State-Changing Requests
  if (isCookieAuth && !isFromHeader && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originHeader = req.headers.origin || req.headers.referer;
    if (!originHeader) {
      return res.status(403).json({
        error: 'CSRF Koruması (403): Çerez tabanlı durum değiştiren isteklerde Origin veya Referer başlığı zorunludur.',
      });
    }

    const origin = originHeader.toString();
    const isAllowed = isOriginAllowed(origin);
    if (!isAllowed) {
      return res.status(403).json({
        error: 'CSRF Koruması (403): Yetkisiz Origin/Referer üzerinden gelen çerez tabanlı istek engellendi.',
      });
    }
  }

  // 3. Standard User Session Authentication
  const verified = await db.verifySessionAsync(cleanToken);
  if (!verified) {
    return res.status(401).json({
      error: 'Erişim Engellendi (401): Geçersiz veya süresi dolmuş oturum jetonu. Lütfen yeniden giriş yapın.',
    });
  }

  const authReq = req as AuthenticatedRequest;
  authReq.user = verified.user;
  authReq.sessionToken = cleanToken;
  authReq.authType = 'user';
  return next();
}

// Authorization Middleware: Admin Role Enforcement
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authReq = req as AuthenticatedRequest;
  if (authReq.authType === 'service') {
    return res.status(403).json({
      error: 'Yetkisiz İşlem (403): Servis jetonları yönetici (Admin) işlemlerini gerçekleştiremez.',
    });
  }
  const user = authReq.user;
  const role = user?.role?.toLowerCase();
  if (!user || role !== 'admin') {
    return res.status(403).json({
      error: 'Yetkisiz İşlem (403): Bu işlemi gerçekleştirmek için Yönetici (Admin) yetkisine sahip olmalısınız.',
    });
  }
  next();
}

// Authorization Middleware: Staff (Admin, Operator, Analyst) Enforcement
export function requireAdminOrStaff(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authReq = req as AuthenticatedRequest;
  if (authReq.authType === 'service') {
    return res.status(403).json({
      error: 'Yetkisiz İşlem (403): Servis jetonları yetkili personel alanlarına erişemez.',
    });
  }
  const user = authReq.user;
  const role = user?.role?.toLowerCase();
  if (!user || (role !== 'admin' && role !== 'operator' && role !== 'analyst')) {
    return res.status(403).json({
      error: 'Yetkisiz İşlem (403): Bu işlem için Yönetici veya Personel (Operatör/Analist) yetkisi gereklidir.',
    });
  }
  next();
}
