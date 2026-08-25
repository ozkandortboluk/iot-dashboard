import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../services/websocket.js';
import { rateLimiterService } from '../services/rateLimiter.service.js';
import { authenticateUser, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Setup/Onboarding Endpoints
router.get('/setup-status', (req, res) => {
  const users = db.getUsers();
  const hasAdmin = users.some((u) => u.role === 'admin');
  res.json({ needSetup: !hasAdmin });
});

router.post('/setup', async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  const rateLimit = rateLimiterService.checkIpRateLimit(`setup:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const users = db.getUsers();
  const hasAdmin = users.some((u) => u.role === 'admin');
  if (hasAdmin) {
    return res.status(400).json({ error: 'Kurulum zaten tamamlanmış.' });
  }

  const { name, email, password, companyName, seedDemoData } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre alanları zorunludur.' });
  }

  try {
    const adminUser = await db.registerUser(name, email, password, 'admin', companyName || 'Merkez Yönetim');

    if (seedDemoData) {
      db.seedDemoDataForUser(adminUser.id, name, companyName || 'Merkez Yönetim', email);
    }

    const token = db.createSession(adminUser);

    res.json({
      user: adminUser,
      token,
      message: 'Kurulum başarıyla tamamlandı ve giriş yapıldı.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kurulum sırasında bir hata oluştu.';
    res.status(400).json({ error: msg });
  }
});

// Auth Endpoints (Public)
router.post('/login', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
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

  const result = db.authenticate(email, password);
  if (!result) {
    return res.status(401).json({ error: 'Hatalı e-posta adresi veya şifre.' });
  }

  res.json({
    user: result.user,
    token: result.token,
    message: 'Giriş başarılı',
  });
});

router.post('/register', async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  const rateLimit = rateLimiterService.checkIpRateLimit(`reg:${clientIp}`, 10);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Çok fazla kayıt denemesi. Lütfen bir süre sonra tekrar deneyin.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Tüm alanları doldurunuz.' });
  }

  try {
    // Public registration ALWAYS assigns 'customer' role. Escalation to 'admin' via public API is forbidden.
    const user = await db.registerUser(name, email, password, 'customer');
    res.json({ user, message: 'Hesap başarıyla oluşturuldu.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kayıt oluşturulamadı.';
    res.status(400).json({ error: msg });
  }
});

router.get('/me', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({ user: authReq.user, token: authReq.sessionToken });
});

export const authRouter = router;

// Profile Router
const profileRouter = Router();

profileRouter.get('/', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  const user = db.getUsers().find((u) => u.id === currentUser.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(user);
});

profileRouter.put('/', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  try {
    const updatedUser = await db.updateUserProfile(currentUser.id, req.body);
    broadcast('users:updated', db.getUsers());
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

  if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'Yeni şifre en az 6 karakter uzunluğunda olmalıdır.' });
  }

  try {
    await db.changePassword(currentUser.id, currentPassword, newPassword);
    res.json({ success: true, message: 'Şifreniz başarıyla değiştirildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Şifre değiştirme işlemi başarısız oldu.' });
  }
});

export { profileRouter };

// Customers Router (Admin only)
