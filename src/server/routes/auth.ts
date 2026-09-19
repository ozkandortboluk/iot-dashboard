import { Router, type Response, type Request } from 'express';
import { db } from '../db.js';
import { DatabaseState } from '../../types.js';
import { broadcast } from '../services/websocket.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth.js';
import { setupService } from '../services/setup.service.js';
import { isRealAdminUser } from '../database/postgres.js';
import {
  validateSetupInput,
  validateRegistrationInput,
  validatePassword,
  validateEmail,
} from '../utils/validation.js';

const router = Router();

// Atomic in-memory setup lock to prevent concurrent first-admin initialization race conditions
let isSetupInProgress = false;

// Helper to reliably extract client IP with Express proxy trust support
function getClientIp(req: Request): string {
  return req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
}

// Cookie helper: Set secure, HttpOnly, SameSite session cookie
export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('nexus_session_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
}

// Cookie helper: Clear session cookie
export function clearSessionCookie(res: Response) {
  res.clearCookie('nexus_session_token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

// Setup/Onboarding Endpoints
router.get('/setup-status', async (req, res) => {
  // 1. Ensure database has completed initial hydration from PostgreSQL / disk cache
  await db.waitForInitialization().catch(() => {});

  const wizardStatus = await setupService.getStatus().catch(() => null);

  let hasAdmin = false;
  let isDbReady = false;
  let needSetup = true;

  if (wizardStatus) {
    hasAdmin = Boolean(wizardStatus.hasAdmin);
    isDbReady = Boolean(wizardStatus.isDbReady);
    needSetup = Boolean(wizardStatus.setupRequired || !wizardStatus.hasAdmin || !wizardStatus.isDbReady);
  } else {
    const users = await db.getUsersAsync();
    hasAdmin = users.some(isRealAdminUser);
    needSetup = !hasAdmin;
  }

  res.json({
    needSetup,
    hasAdmin,
    isDbReady,
    isDbConnected: Boolean(wizardStatus?.isDbConnected),
    isTimescaleAvailable: Boolean(wizardStatus?.isTimescaleAvailable),
    inProgress: isSetupInProgress,
    setupDetails: wizardStatus || undefined,
  });
});

router.post('/setup', async (req, res) => {
  await db.waitForInitialization();
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  // Pre-check: Ensure admin account does not already exist
  const users = await db.getUsersAsync();
  const hasAdmin = users.some(isRealAdminUser);
  if (hasAdmin) {
    return res.status(400).json({ error: 'Kurulum zaten tamamlanmış. Sistemde en az bir yönetici bulunmaktadır.' });
  }

  // Optional Setup Secret Verification (if configured in environment)
  const envSetupSecret = process.env.SETUP_SECRET || process.env.SETUP_ADMIN_TOKEN;
  if (envSetupSecret) {
    const providedSecret = req.headers['x-setup-secret'] || req.body?.setupSecret;
    if (providedSecret !== envSetupSecret) {
      return res.status(403).json({ error: 'Geçersiz ilk kurulum güvenlik anahtarı (Setup Secret).' });
    }
  }

  // Atomic mutex lock: Prevent concurrent race conditions
  if (isSetupInProgress) {
    return res.status(409).json({
      error: 'Sistem kurulumu şu anda başka bir işlem tarafından gerçekleştiriliyor. Lütfen birkaç saniye bekleyin.',
    });
  }

  // Comprehensive schema & input validation
  const validation = validateSetupInput(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ error: validation.error || 'Geçersiz kurulum verisi.' });
  }

  const { name, email, password, companyName, seedDemoData } = validation.data;

  isSetupInProgress = true;

  try {
    // Re-verify inside lock to guarantee mutual exclusion
    const currentUsers = await db.getUsersAsync();
    if (currentUsers.some(isRealAdminUser)) {
      throw new Error('Kurulum zaten başka bir oturum tarafından tamamlandı.');
    }

    const adminUser = await db.registerUser(name, email, password, 'admin', companyName);

    if (seedDemoData) {
      db.seedDemoDataForUser(adminUser.id, name, companyName, email);
    }

    const token = await db.createSession(adminUser);

    // Mark setup as permanently completed and transition DB state to READY
    setupService.markSetupCompleted();
    db.setDatabaseState(DatabaseState.READY);

    // Set HttpOnly, Secure cookie
    setSessionCookie(res, token);

    res.json({
      user: adminUser,
      token,
      message: 'Kurulum başarıyla tamamlandı ve güvenli oturum açıldı.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kurulum sırasında bir hata oluştu.';
    res.status(400).json({ error: msg });
  } finally {
    isSetupInProgress = false;
  }
});

// Auth Endpoints (Public)
router.post('/login', async (req, res) => {
  await db.waitForInitialization();
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`login:${clientIp}`, 20);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla başarısız veya hızlı giriş denemesi. Lütfen bir dakika bekleyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre gereklidir.' });
  }

  const emailRes = validateEmail(email);
  if (!emailRes.valid) {
    return res.status(400).json({ error: emailRes.error || 'Geçersiz e-posta biçimi.' });
  }

  const result = await db.authenticate(emailRes.normalized, String(password));
  if (!result) {
    return res.status(401).json({ error: 'Hatalı e-posta adresi veya şifre.' });
  }

  // Set HttpOnly, Secure session cookie
  setSessionCookie(res, result.token);

  res.json({
    user: result.user,
    token: result.token,
    message: 'Giriş başarılı',
  });
});

router.post('/register', async (req, res) => {
  await db.waitForInitialization();
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`reg:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla kayıt denemesi. Lütfen bir süre sonra tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  // Guard: If system setup is not completed yet, prevent public registration to enforce admin onboarding first
  const users = await db.getUsersAsync();
  const hasAdmin = users.some(isRealAdminUser);
  if (!hasAdmin || isSetupInProgress) {
    return res.status(403).json({
      error: 'Sistem ilk kurulum aşamasındadır. Önce sistem yöneticisi hesabı oluşturulmalıdır.',
    });
  }

  const validation = validateRegistrationInput(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ error: validation.error || 'Geçersiz kayıt bilgileri.' });
  }

  const { name, email, password, companyName } = validation.data;

  try {
    // Public registration ALWAYS assigns 'customer' role. Escalation to 'admin' via public API is forbidden.
    const user = await db.registerUser(name, email, password, 'customer', companyName);
    const token = await db.createSession(user);
    setSessionCookie(res, token);
    res.json({ user, token, message: 'Hesap başarıyla oluşturuldu.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kayıt oluşturulamadı.';
    res.status(400).json({ error: msg });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  const token = (req as any).cookies?.nexus_session_token || req.headers['x-auth-token'];
  if (token && typeof token === 'string') {
    db.deleteSession(token.trim());
  }
  res.json({ success: true, message: 'Başarıyla çıkış yapıldı ve oturum sunucuda sonlandırıldı.' });
});

router.post('/revoke-all-sessions', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    await db.terminateUserSessions(currentUser.id);
    clearSessionCookie(res);
    res.json({ success: true, message: 'Tüm aktif oturumlarınız başarıyla sonlandırıldı.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Oturumlar sonlandırılamadı.' });
  }
});

router.get('/me', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({ user: authReq.user, token: authReq.sessionToken });
});

export const authRouter = router;

// Profile Router
const profileRouter = Router();

profileRouter.get('/', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const users = await db.getUsersAsync();
  const user = users.find((u) => u.id === currentUser.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(user);
});

profileRouter.put('/', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const updatedUser = await db.updateUserProfile(currentUser.id, req.body);
    
    // Broadcast scoped update instead of broad users list to avoid leaking customer details
    broadcast('user:profile:updated', {
      userId: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      companyName: updatedUser.companyName,
    });

    res.json({ user: updatedUser, message: 'Profil ve hesap ayarları güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Profil güncellenemedi.' });
  }
});

profileRouter.post('/change-password', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre alanları zorunludur.' });
  }

  const passValidation = validatePassword(newPassword);
  if (!passValidation.valid) {
    return res.status(400).json({ error: passValidation.error || 'Yeni şifre güvenlik kriterlerini karşılamıyor.' });
  }

  try {
    await db.changePassword(currentUser.id, currentPassword, newPassword);
    res.json({ success: true, message: 'Şifreniz başarıyla değiştirildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Şifre değiştirme işlemi başarısız oldu.' });
  }
});

export { profileRouter };
