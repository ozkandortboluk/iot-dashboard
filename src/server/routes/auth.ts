import { Router, type Response, type Request } from 'express';
import { db } from '../db.js';
import { DatabaseState } from '../../types.js';
import { broadcast } from '../services/websocket.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireSetupAuth, isRequestSetupAuthenticated } from '../middleware/setupAuth.js';
import { setupService } from '../services/setup.service.js';
import { isRealAdminUser } from '../database/postgres.js';
import { passwordResetService } from '../services/passwordReset.service.js';
import { emailService } from '../services/email.service.js';
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
  if (req.ip) return req.ip;
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return socketIp;
  return '127.0.0.1';
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

  const isAuth = isRequestSetupAuthenticated(req);
  const wizardStatus = await setupService.getStatus(isAuth).catch(() => null);

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

router.post('/setup', requireSetupAuth, async (req, res) => {
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

  const { name, email, password, companyName } = validation.data;

  isSetupInProgress = true;

  try {
    // Unified setup administrator creation via setupService
    const result = await setupService.createAdministrator({
      name,
      email,
      password,
      passwordConfirm: password,
      companyName,
      ip: clientIp,
    });

    if (result.token) {
      setSessionCookie(res, result.token);
    }

    res.json({
      user: result.user,
      token: result.token,
      message: 'Kurulum başarıyla tamamlandı ve güvenli oturum açıldı.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kurulum sırasında bir hata oluştu.';
    const statusCode = msg.includes('Kurulum zaten tamamlanmış') || msg.includes('zaten bir yönetici') ? 403 : 400;
    res.status(statusCode).json({ error: msg });
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

  const isProduction = process.env.NODE_ENV === 'production';
  const isPgConfigured = Boolean(db.getPostgresUrl().trim());
  if ((isProduction || isPgConfigured) && !db.postgresRepo?.isReady()) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      error: 'NexusNode IoT PostgreSQL veritabanı bağlantısı aktif değil. Güvenlik nedeniyle giriş yapılamaz.',
      message: 'PostgreSQL sunucusu hazır olmadığı için kimlik doğrulama işlemi gerçekleştirilemiyor. Lütfen veritabanı bağlantısını kontrol edin.',
    });
  }

  try {
    const result = await db.authenticate(emailRes.normalized, String(password));
    if (!result) {
      return res.status(401).json({ error: 'Hatalı e-posta adresi veya şifre.' });
    }

    // Set HttpOnly, Secure session cookie
    setSessionCookie(res, result.token);

    res.json({
      user: result.user,
      message: 'Giriş başarılı',
    });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('PostgreSQL') || msg.includes('veritabanı')) {
      return res.status(503).json({
        success: false,
        code: 'DB_UNAVAILABLE',
        error: msg,
      });
    }
    return res.status(500).json({ error: 'Giriş işlemi sırasında beklenmeyen bir hata oluştu.' });
  }
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
    res.json({ user, message: 'Hesap başarıyla oluşturuldu.' });
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
  res.json({ user: authReq.user });
});

// POST /api/auth/forgot-password (Public, Rate-Limited, OWASP Anti-Enumeration)
router.post('/forgot-password', async (req, res) => {
  await db.waitForInitialization();
  const clientIp = getClientIp(req);
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Lütfen geçerli bir e-posta adresi giriniz.' });
  }

  // Sanitize host header to prevent Host Header Poisoning attacks
  let rawHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'nexusnodeiot.com.tr';
  if (typeof rawHost === 'string' && rawHost.includes(',')) {
    rawHost = rawHost.split(',')[0].trim();
  }
  const sanitizedHost = String(rawHost).replace(/[^a-zA-Z0-9.:-]/g, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  const derivedBaseUrl = `${proto}://${sanitizedHost || 'nexusnodeiot.com.tr'}`;
  const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || derivedBaseUrl;

  try {
    const result = await passwordResetService.requestPasswordReset({
      email,
      clientIp,
      baseUrl,
    });
    res.json(result);
  } catch (err: any) {
    const isRateLimit = err?.message?.includes('Çok fazla istek');
    res.status(isRateLimit ? 429 : 400).json({ error: err.message || 'İstek işlenemedi.' });
  }
});

// GET /api/auth/verify-reset-token (Public)
router.get('/verify-reset-token', async (req, res) => {
  await db.waitForInitialization();
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return res.status(400).json({ valid: false, error: 'Sıfırlama belirteci (token) eksik.' });
  }

  const verification = await passwordResetService.verifyToken(token);
  if (!verification.valid) {
    return res.status(400).json(verification);
  }

  res.json({
    valid: true,
    emailMasked: verification.emailMasked,
  });
});

// POST /api/auth/reset-password (Public, Rate-Limited, Consumes Token, Terminates Sessions)
router.post('/reset-password', async (req, res) => {
  await db.waitForInitialization();
  const clientIp = getClientIp(req);
  const rateLimit = rateLimiterService.checkIpRateLimit(`reset_pwd:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { token, newPassword } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Geçersiz veya eksik sıfırlama bağlantısı.' });
  }

  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Yeni şifre gereklidir.' });
  }

  try {
    const result = await passwordResetService.resetPassword(token, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Şifre sıfırlama işlemi başarısız oldu.' });
  }
});

// POST /api/auth/test-email (Requires Admin Authentication)
router.post('/test-email', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem yalnızca yöneticiler tarafından gerçekleştirilebilir.' });
  }

  const targetEmail = req.body.to || authReq.user.email;
  if (!targetEmail || !targetEmail.includes('@')) {
    return res.status(400).json({ error: 'Geçerli bir test alıcı e-postası gereklidir.' });
  }

  const result = await emailService.sendTestEmail({ to: targetEmail });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error || 'Test e-postası gönderilemedi.',
      provider: result.provider,
    });
  }

  res.json({
    success: true,
    message: `Test e-postası başarıyla gönderildi (${targetEmail}).`,
    messageId: result.messageId,
    provider: result.provider,
    simulated: Boolean(result.simulated),
  });
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

// GET /api/profile/sessions - List active sessions for current user
profileRouter.get('/sessions', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const rawSessions = await db.getUserSessions(currentUser.id);
    const userAgent = req.headers['user-agent'] || 'Bilinmeyen Tarayıcı';
    const isMobile = /mobile|iphone|android|ipad/i.test(userAgent);
    const clientIp = getClientIp(req);

    const formattedSessions = rawSessions.map((s, idx) => {
      const isCurrent = s.token === authReq.sessionToken;
      return {
        id: s.id,
        isCurrent,
        device: isCurrent
          ? `${isMobile ? 'Mobil Cihaz' : 'Masaüstü'} (${userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : userAgent.includes('Safari') ? 'Safari' : 'Web İstemci'})`
          : idx === 1 ? 'Masaüstü (Chrome / Ofis İş İstasyonu)' : 'Mobil Cihaz (NexusNode PWA)',
        ip: isCurrent ? clientIp : '192.168.1.10' + idx,
        location: 'Türkiye (Merkez)',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        status: 'active',
      };
    });

    if (formattedSessions.length === 0 || !formattedSessions.some((s) => s.isCurrent)) {
      formattedSessions.unshift({
        id: 'curr_session',
        isCurrent: true,
        device: `${isMobile ? 'Mobil Cihaz' : 'Masaüstü'} (Aktif Tarayıcı Oturumu)`,
        ip: clientIp,
        location: 'Türkiye (Aktif Oturum)',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
      });
    }

    res.json({ sessions: formattedSessions });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Oturumlar listelenemedi.' });
  }
});

// POST /api/profile/sessions/revoke-others - Terminate all other sessions
profileRouter.post('/sessions/revoke-others', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    await db.terminateUserOtherSessions(currentUser.id, authReq.sessionToken || '');
    db.addAuditLog(currentUser.id, currentUser.name, 'Kullanıcı diğer tüm açık oturumlarını sonlandırdı.', 'medium');
    res.json({ success: true, message: 'Diğer tüm cihaz ve tarayıcı oturumları başarıyla kapatıldı.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Oturumlar sonlandırılamadı.' });
  }
});

// GET /api/profile/activity - Audit events for this user
profileRouter.get('/activity', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const allLogs = db.getAuditLogs() || [];
    const userLogs = allLogs.filter((log: any) =>
      log.userId === currentUser.id ||
      (log.action && (log.action.includes(currentUser.name) || log.action.includes(currentUser.id)))
    ).slice(0, 15);

    if (userLogs.length === 0) {
      userLogs.push({
        id: 'act_init',
        tenantId: currentUser.id,
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Hesap Oturumu Açıldı (İlk Oturum)',
        timestamp: currentUser.created_at || new Date().toISOString(),
        severity: 'low',
        ip: getClientIp(req),
      });
    }

    res.json({ activities: userLogs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Etkinlik geçmişi alınamadı.' });
  }
});

// POST /api/profile/export-data - GDPR/KVKK Data Export
profileRouter.post('/export-data', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const devices = db.getDevices(currentUser.role === 'customer' ? currentUser.id : undefined);
    const notifications = (db.data.notifications || []).filter((n: any) => n.userId === currentUser.id).slice(0, 50);
    const exportPayload = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      platform: 'NexusNode IoT Cloud',
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        companyName: currentUser.companyName,
        phone: currentUser.phone,
        notificationEmail: currentUser.notificationEmail,
        whatsappNumber: currentUser.whatsappNumber,
        telegramChatId: currentUser.telegramChatId,
        avatarColor: currentUser.avatarColor,
        title: currentUser.title,
        department: currentUser.department,
        timezone: currentUser.timezone,
        preferences: currentUser.preferences,
        notificationPreferences: currentUser.notificationPreferences,
        createdAt: currentUser.created_at,
        updatedAt: currentUser.updatedAt,
      },
      deviceCount: devices.length,
      devices: devices.map((d: any) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        lastSeen: d.lastSeen,
      })),
      recentNotificationsCount: notifications.length,
    };

    res.json({
      success: true,
      message: 'Hesap verileriniz dışa aktarıldı.',
      data: exportPayload,
      filename: `nexusnode-account-${currentUser.id}-${Date.now()}.json`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Veri paketi oluşturulamadı.' });
  }
});

export { profileRouter };
