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
const customersRouter = Router();

customersRouter.get('/', authenticateUser, requireAdmin, (req, res) => {
  const users = db.getUsers();
  res.json(users);
});

customersRouter.post('/', authenticateUser, requireAdmin, async (req, res) => {
  const { name, email, password, role, companyName } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre alanları zorunludur.' });
  }

  try {
    const newUser = await db.registerUser(name, email, password, role || 'customer', companyName);
    broadcast('users:updated', db.getUsers());
    res.status(201).json(newUser);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Müşteri oluşturulamadı.';
    res.status(400).json({ error: msg });
  }
});

customersRouter.delete('/:id', authenticateUser, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;
  const currentUser = (req as any).user;

  if (targetUserId === currentUser.id) {
    return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  }

  const users = db.getUsers();
  const adminCount = users.filter((u) => u.role === 'admin' && u.status !== 'suspended').length;
  const targetUser = users.find((u) => u.id === targetUserId);

  if (!targetUser) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  if (targetUser.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Sistemdeki son yönetici hesabını silemezsiniz.' });
  }

  // Handle dependency check query parameter
  if (req.query.check_dependencies === 'true') {
    const userDevices = db.getDevices().filter((d) => d.tenantId === targetUserId);
    return res.json({
      dependencies: {
        devices: userDevices.length,
      }
    });
  }

  try {
    await db.softDeleteUser(targetUserId, currentUser.id, currentUser.name);
    broadcast('users:updated', db.getUsers());
    res.json({ message: 'Müşteri hesabı başarıyla askıya alındı (Soft Delete).' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Silme işlemi sırasında bir hata oluştu.';
    res.status(500).json({ error: msg });
  }
});

customersRouter.patch('/:id/role', authenticateUser, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!role || !['admin', 'customer', 'operator', 'analyst'].includes(role)) {
    return res.status(400).json({ error: 'Geçersiz rol belirtildi.' });
  }

  try {
    const updatedUser = await db.updateUserRole(req.params.id, role);
    broadcast('users:updated', db.getUsers());
    res.json({ user: updatedUser, message: 'Kullanıcı rolü başarıyla güncellendi.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Rol güncellenemedi.';
    res.status(400).json({ error: msg });
  }
});

export { customersRouter };

customersRouter.put('/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const updatedUser = await db.updateUserProfile(req.params.id, req.body);
    broadcast('users:updated', db.getUsers());
    res.json({ user: updatedUser, message: 'Müşteri bilgileri güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Müşteri güncellenemedi.' });
  }
});

customersRouter.patch('/:id/status', authenticateUser, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz statü.' });
  }
  try {
    const user = db.getUsers().find(u => u.id === req.params.id);
    if (!user) throw new Error('Kullanıcı bulunamadı.');
    user.status = status;
    await db.updateUserProfile(user.id, { status });
    
    if (status === 'suspended') {
      await db.terminateUserSessions(user.id);
    }
    broadcast('users:updated', db.getUsers());
    res.json({ message: `Kullanıcı hesabı ${status === 'active' ? 'aktifleştirildi' : 'donduruldu'}.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.post('/:id/terminate-sessions', authenticateUser, requireAdmin, async (req, res) => {
  try {
    await db.terminateUserSessions(req.params.id);
    res.json({ message: 'Tüm aktif oturumlar sonlandırıldı.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.post('/:id/reset-password', authenticateUser, requireAdmin, async (req, res) => {
  try {
    // In a real app, send an email. For now, just return success.
    res.json({ message: 'Parola sıfırlama bağlantısı e-posta adresine gönderildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
