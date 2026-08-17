import type express from 'express';
import { db } from '../db.js';
import type { User } from '../../types.js';

export interface AuthenticatedRequest extends express.Request {
  user?: User;
  sessionToken?: string;
}

// Authentication Middleware: Verifies authorization token from headers or query
export function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = (req.headers['x-auth-token'] as string) || (req.query.token as string);

  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Erişim Engellendi (401): Kimlik doğrulama jetonu (Authorization Token) eksik. Lütfen sisteme giriş yapın.',
    });
  }

  const verified = db.verifySession(token);
  if (!verified) {
    return res.status(401).json({
      error: 'Erişim Engellendi (401): Geçersiz veya süresi dolmuş oturum jetonu. Lütfen yeniden giriş yapın.',
    });
  }

  (req as AuthenticatedRequest).user = verified.user;
  (req as AuthenticatedRequest).sessionToken = token;
  next();
}

// Authorization Middleware: Admin Role Enforcement
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      error: 'Yetkisiz İşlem (403): Bu işlemi gerçekleştirmek için Yönetici (Admin) yetkisine sahip olmalısınız.',
    });
  }
  next();
}
