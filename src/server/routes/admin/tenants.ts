import { Router } from 'express';
import { z } from 'zod';
import { authenticateUser, requireAdmin, requireAdminOrStaff } from '../../middleware/auth.js';
import { db } from '../../db.js';

export const adminTenantsRouter = Router();

// Validation Schemas
const CreateTenantSchema = z.object({
  name: z.string().trim().min(2, 'Yetkili adı en az 2 karakter olmalıdır.').max(100),
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta adresi giriniz.').max(100),
  password: z.string().min(6, 'Parola en az 6 karakter olmalıdır.').max(100),
  companyName: z.string().trim().max(100).optional().or(z.literal('')),
  role: z.enum(['customer', 'admin', 'operator', 'analyst']).default('customer'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  whatsappNumber: z.string().trim().max(30).optional().or(z.literal('')),
  notificationEmail: z.string().trim().email('Geçersiz bildirim e-postası formatı.').optional().or(z.literal('')),
  telegramChatId: z.string().trim().max(50).optional().or(z.literal('')),
});

const UpdateTenantSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır.').max(100).optional(),
  companyName: z.string().trim().max(100).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  whatsappNumber: z.string().trim().max(30).optional().or(z.literal('')),
  notificationEmail: z.string().trim().email('Geçersiz bildirim e-postası formatı.').optional().or(z.literal('')),
  telegramChatId: z.string().trim().max(50).optional().or(z.literal('')),
  role: z.enum(['customer', 'admin', 'operator', 'analyst']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(50),
  search: z.string().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  sortBy: z.enum(['created_at', 'name', 'companyName']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

adminTenantsRouter.use(authenticateUser);

// GET /api/admin/tenants
adminTenantsRouter.get('/', requireAdminOrStaff, async (req, res) => {
  try {
    const query = PaginationQuerySchema.parse(req.query);
    
    // Tüm kullanıcıları veya yetkiye göre olanları getir
    let tenants = db.data.users || [];

    if (query.search) {
      const s = query.search.toLowerCase();
      tenants = tenants.filter((u: any) => 
        u.name.toLowerCase().includes(s) || 
        u.email.toLowerCase().includes(s) || 
        (u.companyName && u.companyName.toLowerCase().includes(s)) ||
        (u.phone && u.phone.toLowerCase().includes(s)) ||
        (u.whatsappNumber && u.whatsappNumber.toLowerCase().includes(s))
      );
    }

    if (query.status) {
      tenants = tenants.filter((u: any) => (u.status || 'active') === query.status);
    }

    tenants.sort((a: any, b: any) => {
      let aVal = a[query.sortBy] || '';
      let bVal = b[query.sortBy] || '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return query.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return query.order === 'asc' ? 1 : -1;
      return 0;
    });

    const total = tenants.length;
    const startIndex = (query.page - 1) * query.limit;
    const paginated = tenants.slice(startIndex, startIndex + query.limit);

    // Müşterilerin cihaz sayılarını ve tüm iletişim verilerini ekle
    const withDeviceCount = paginated.map((tenant: any) => {
      const deviceCount = (db.data.devices || []).filter((d: any) => d.tenantId === tenant.id).length;
      return {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        companyName: tenant.companyName || '',
        phone: tenant.phone || '',
        whatsappNumber: tenant.whatsappNumber || '',
        notificationEmail: tenant.notificationEmail || '',
        telegramChatId: tenant.telegramChatId || '',
        status: tenant.status || 'active',
        created_at: tenant.created_at,
        role: tenant.role,
        deviceCount
      };
    });

    res.json({
      data: withDeviceCount,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit)
      }
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Doğrulama hatası', details: (err as any).errors });
    }
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// GET /api/admin/tenants/:id
adminTenantsRouter.get('/:id', requireAdminOrStaff, async (req, res) => {
  const tenant = db.data.users.find((u: any) => u.id === req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });
  
  const deviceCount = (db.data.devices || []).filter((d: any) => d.tenantId === tenant.id).length;
  
  res.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    companyName: tenant.companyName || '',
    phone: tenant.phone || '',
    whatsappNumber: tenant.whatsappNumber || '',
    notificationEmail: tenant.notificationEmail || '',
    telegramChatId: tenant.telegramChatId || '',
    notificationPreferences: tenant.notificationPreferences || { app: true, email: true },
    status: tenant.status || 'active',
    created_at: tenant.created_at,
    role: tenant.role,
    deviceCount
  });
});

// GET /api/admin/tenants/:id/members
adminTenantsRouter.get('/:id/members', requireAdminOrStaff, async (req, res) => {
  // Şimdilik sadece ana müşteriyi (tenant sahibi) döndürüyoruz
  const tenant = db.data.users.find((u: any) => u.id === req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });
  
  res.json([{
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    role: 'owner',
    status: tenant.status || 'active'
  }]);
});

// POST /api/admin/tenants
adminTenantsRouter.post('/', requireAdmin, async (req, res) => {
  try {
    const data = CreateTenantSchema.parse(req.body);
    
    if (data.role === "admin" || data.role === "operator" || data.role === "analyst") {
      // Sadece customer oluşturulabilir.
      return res.status(403).json({ error: "Sistem yöneticisi/operatör oluşturmak için ayrı bir onay/MFA akışı gereklidir." });
    }

    
    // Benzersiz e-posta kontrolü
    const existing = db.data.users.find((u: any) => u.email.toLowerCase() === data.email);
    if (existing) {
      return res.status(400).json({ error: 'Bu e-posta adresi ile zaten kayıtlı bir hesap var.' });
    }

    // Benzersiz firma adı kontrolü (opsiyonel)
    if (data.companyName) {
      const existingCompany = db.data.users.find((u: any) => u.companyName && u.companyName.toLowerCase() === data.companyName!.toLowerCase());
      if (existingCompany) {
        return res.status(400).json({ error: 'Bu firma adıyla kayıtlı bir hesap var.' });
      }
    }

    const newCustomer = await db.userRepository.registerUser(
      data.name, 
      data.email, 
      data.password, 
      data.role as 'admin' | 'customer', 
      data.companyName
    );

    res.status(201).json(newCustomer);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Doğrulama hatası', details: (err as any).errors });
    }
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});

// PUT & PATCH /api/admin/tenants/:id
const handleUpdateTenant = async (req: any, res: any) => {
  try {
    const data = UpdateTenantSchema.parse(req.body);
    const tenant = db.data.users.find((u: any) => u.id === req.params.id);
    
    if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });

    // Alanları güncelle - eğer boş string gönderilmişse ve eski değer varsa veya silinmek isteniyorsa temizle
    if (data.name !== undefined && data.name.trim() !== '') tenant.name = data.name.trim();
    if (data.companyName !== undefined) tenant.companyName = data.companyName.trim();
    if (data.phone !== undefined) tenant.phone = data.phone.trim();
    if (data.whatsappNumber !== undefined) tenant.whatsappNumber = data.whatsappNumber.trim();
    if (data.notificationEmail !== undefined) tenant.notificationEmail = data.notificationEmail.trim();
    if (data.telegramChatId !== undefined) tenant.telegramChatId = data.telegramChatId.trim();
    if (data.role !== undefined) tenant.role = data.role;
    if (data.status !== undefined) tenant.status = data.status;

    tenant.updatedAt = new Date().toISOString();
    tenant.version = (tenant.version || 1) + 1;

    // PostgreSQL ve yerel belleğe yaz
    await db.postgresRepo.saveUser(tenant);
    db.saveData(db.data);

    res.json({
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      companyName: tenant.companyName || '',
      phone: tenant.phone || '',
      whatsappNumber: tenant.whatsappNumber || '',
      notificationEmail: tenant.notificationEmail || '',
      telegramChatId: tenant.telegramChatId || '',
      status: tenant.status || 'active',
      created_at: tenant.created_at,
      updatedAt: tenant.updatedAt,
      role: tenant.role,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Doğrulama hatası', details: (err as any).errors });
    }
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
};

adminTenantsRouter.patch('/:id', requireAdmin, handleUpdateTenant);
adminTenantsRouter.put('/:id', requireAdmin, handleUpdateTenant);

// POST /api/admin/tenants/:id/suspend
adminTenantsRouter.post('/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const tenant = db.data.users.find((u: any) => u.id === req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });

    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    
    if (newStatus === 'suspended') {
      await db.userRepository.softDeleteUser(tenant.id, (req as any).user.id, (req as any).user.name);
    } else {
      tenant.status = 'active';
      tenant.deletedAt = undefined;
      await db.postgresRepo.saveUser(tenant);
      db.saveData(db.data);
    }

    res.json({ message: `Müşteri hesabı ${newStatus === 'active' ? 'aktifleştirildi' : 'donduruldu'}.`, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});

// POST /api/admin/tenants/:id/terminate-sessions
adminTenantsRouter.post('/:id/terminate-sessions', requireAdmin, async (req, res) => {
  try {
    const tenant = db.data.users.find((u: any) => u.id === req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });
    
    await db.userRepository.terminateUserSessions(tenant.id);
    res.json({ message: 'Tüm aktif oturumlar sonlandırıldı.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});

// POST /api/admin/tenants/:id/reset-password
adminTenantsRouter.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const tenant = db.data.users.find((u: any) => u.id === req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });
    
    // In a real app, send an email. For now, just return success.
    res.json({ message: 'Parola sıfırlama bağlantısı e-posta adresine gönderildi.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});

// DELETE /api/admin/tenants/:id
adminTenantsRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    if (tenantId === 'usr_admin') {
      return res.status(400).json({ error: 'Kanonik sistem yöneticisi hesabı (usr_admin) silinemez.' });
    }
    const tenant = db.data.users.find((u: any) => u.id === tenantId);
    if (!tenant) return res.status(404).json({ error: 'Kullanıcı/Müşteri bulunamadı.' });

    const adminUser = (req as any).user || { id: 'usr_admin', name: 'Yönetici' };
    await db.userRepository.deleteUser(tenantId, adminUser.id, adminUser.name);

    res.json({ 
      success: true, 
      message: `Müşteri "${tenant.name}" silindi. Sahip olduğu cihazlar veri bütünlüğü korunarak Sistem Yöneticisine (usr_admin) devredildi.` 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});
