import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { normalizeEmail, validateEmail, validatePassword } from '../utils/validation.js';
import { defaultWidgets } from '../initialData.js';
import type { User, UserSession } from '../../types.js';

export class UserRepository {
  constructor(private db: any) {}

  public getUsers(): User[] {
    return this.db.data.users;
  }

  public createSession(user: User): string {
    if (!this.db.data.sessions) {
      this.db.data.sessions = [];
    }
    const token = crypto.randomBytes(32).toString('hex');
    const session: UserSession = {
      token,
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      userName: user.name,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.db.data.sessions = this.db.data.sessions.filter(
      (s: any) => new Date(s.expiresAt).getTime() > Date.now()
    );
    this.db.data.sessions.push(session);
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveSession(session).catch(() => {});
    return token;
  }

  public deleteSession(token: string): boolean {
    if (!token) return false;
    const cleanToken = token.trim();
    const initialLength = (this.db.data.sessions || []).length;
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.token !== cleanToken);
    const removed = (this.db.data.sessions || []).length < initialLength;
    if (removed) {
      this.db.saveData(this.db.data);
    }
    this.db.postgresRepo.deleteSession(cleanToken).catch(() => {});
    return removed;
  }

  public verifySession(token: string): { user: User; session: UserSession } | null {
    if (!token) return null;
    const cleanToken = token.trim();
    if (!this.db.data.sessions || this.db.data.sessions.length === 0) {
      return null;
    }

    const session = this.db.data.sessions.find((s: any) => s.token === cleanToken);
    if (!session) {
      return null;
    }

    // Check expiration strictly - no automatic renewal for expired sessions
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === session.userId);
    if (!user) {
      return null;
    }

    return { user, session };
  }

  public authenticate(email: string, pass: string): { user: User; token: string } | null {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.db.data.users.find((u: any) => u.email.toLowerCase() === cleanEmail);
    if (!user) return null;
    const storedHash = this.db.data.passwords[user.id];
    if (storedHash && verifyPassword(pass, storedHash)) {
      if (!storedHash.startsWith('$2')) {
        this.db.data.passwords[user.id] = hashPassword(pass);
        this.db.saveData(this.db.data);
      }
      const token = this.createSession(user);
      this.db.addAuditLog(user.id, user.name, 'Giriş Başarılı (Bcrypt Verified)', 'low');
      return { user, token };
    }
    this.db.addAuditLog(user ? user.id : 'unknown', email, 'Hatalı Giriş Denemesi', 'high');
    return null;
  }

  public async registerUser(name: string, email: string, pass: string, role: User['role'] = 'customer', companyName?: string): Promise<User> {
    const emailRes = validateEmail(email);
    if (!emailRes.valid) throw new Error(emailRes.error || 'Geçersiz e-posta adresi.');
    const cleanEmail = emailRes.normalized;

    const passRes = validatePassword(pass);
    if (!passRes.valid) throw new Error(passRes.error || 'Geçersiz şifre.');

    const existing = this.db.data.users.find((u: any) => u.email.toLowerCase() === cleanEmail);
    if (existing) throw new Error('Bu e-posta adresi zaten kayıtlı.');

    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      role,
      companyName: companyName || undefined,
      created_at: new Date().toISOString(),
    };
    
    const dashboard = {
      id: `dash_${newUser.id}`,
      tenantId: newUser.id,
      title: `${companyName || name} Özel Dashboard`,
      widgets: [...defaultWidgets],
      updatedAt: new Date().toISOString(),
    };

    const auditLog: import('../../types.js').AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      tenantId: newUser.id,
      userName: name,
      action: `Yeni Kullanıcı Kaydı Yapıldı: ${email} (${role})`,
      ip: '127.0.0.1',
      severity: 'low',
    };

    const hashedPassword = hashPassword(pass);

    // 1. Yazma önceliği: PostgreSQL
    try {
      await this.db.postgresRepo.saveUser(newUser, hashedPassword);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('unique constraint') || errMsg.includes('users_email_key') || err.code === '23505') {
        throw new Error('Bu e-posta adresi zaten kayıtlı.', { cause: err });
      }
      throw err;
    }
    
    await this.db.postgresRepo.saveDashboard(dashboard);
    await this.db.postgresRepo.saveAuditLog(auditLog);

    // 2. Local cache güncellemesi (Postgres başarılı olduktan sonra)
    if (companyName) {
      if (!this.db.data.tenants) this.db.data.tenants = [];
      if (!this.db.data.tenantMemberships) this.db.data.tenantMemberships = [];
      
      const tenant = {
        id: `tnt_${Date.now()}`,
        name: companyName,
        contactEmail: email,
        subscription: {
          id: `sub_${Date.now()}`,
          plan: 'basic' as const,
          maxDevices: 50,
          maxUsers: 5,
          status: 'active' as const
        },
        createdAt: new Date().toISOString()
      };
      
      const membership = {
        id: `mem_${Date.now()}`,
        userId: newUser.id,
        tenantId: tenant.id,
        role: 'admin' as import('../../types.js').TenantRole,
        createdAt: new Date().toISOString()
      };
      
      this.db.data.tenants.push(tenant);
      this.db.data.tenantMemberships.push(membership);
    }

    this.db.data.users.push(newUser);
    this.db.data.passwords[newUser.id] = hashedPassword;
    this.db.data.dashboards.push(dashboard);
    this.db.data.auditLogs.push(auditLog);
    
    this.db.saveData(this.db.data);
    
    return newUser;
  }

  public async changePassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    const user = this.db.data.users.find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    const currentHash = this.db.data.passwords[userId];
    if (!currentHash || !verifyPassword(oldPass, currentHash)) {
      this.addAuditLog(userId, user.name, 'Başarısız Şifre Değiştirme Denemesi (Eski Şifre Hatalı)', 'high');
      throw new Error('Mevcut şifreniz hatalı.');
    }

    const passRes = validatePassword(newPass);
    if (!passRes.valid) {
      throw new Error(passRes.error || 'Yeni şifre güvenlik kriterlerini karşılamıyor.');
    }

    const newHash = hashPassword(newPass.trim());
    
    // Postgres'e yazılmasını bekle
    await this.db.postgresRepo.saveUser(user, newHash);
    
    this.db.data.passwords[userId] = newHash;
    this.db.saveData(this.db.data);
    this.addAuditLog(userId, user.name, 'Kullanıcı Şifresini Başarıyla Güncelledi', 'low');
  }

  public async updateUserRole(userId: string, newRole: User['role']): Promise<User> {
    const user = this.db.data.users.find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');
    const oldRole = user.role;
    user.role = newRole;

    await this.db.postgresRepo.saveUser(user);

    this.db.addAuditLog('system', 'Admin', `Kullanıcı Rolü Güncellendi: ${user.name} (${oldRole} -> ${newRole})`, 'high');
    this.db.saveData(this.db.data);
    return user;
  }

  public deleteUser(userId: string, adminId = 'system', adminName = 'Admin') {
    const index = this.db.data.users.findIndex((u: any) => u.id === userId);
    if (index === -1) return;

    const removed = this.db.data.users[index];

    // 1. CİHAZ SAHİPLİĞİNİ KORUMA & KANONİK AKTARIM:
    // Kullanıcı silindiğinde cihaz korunur; kimsesiz veya sahipsiz kalmaması için
    // kanonik olarak 'usr_admin' (Merkez Yönetim) hesabına devredilir ve geçmiş kayıtları saklanır.
    const now = new Date().toISOString();
    const ownedDevices = (this.db.data.devices || []).filter(
      (d: any) => d.tenantId === userId || d.userId === userId || d.customerId === userId
    );

    for (const dev of ownedDevices) {
      dev.previousTenantId = userId;
      dev.previousTenantName = removed.name;
      dev.ownershipTransferredAt = now;
      dev.tenantId = 'usr_admin';
      dev.userId = 'usr_admin';
      if (!dev.location || dev.location === 'Varsayılan') {
        dev.location = `Merkez Depo (Eski Müşteri: ${removed.name})`;
      }
    }

    if (ownedDevices.length > 0) {
      this.db.addAuditLog(
        adminId,
        adminName,
        `Müşteri Silinirken Cihazlar Korundu & Devredildi: "${removed.name}" kullanıcısına ait ${ownedDevices.length} adet cihaz Sistem Yöneticisine devredildi.`,
        'medium'
      );
    }

    // 2. Kullanıcıyı ve oturumları kaldır
    this.db.data.users.splice(index, 1);
    delete this.db.data.passwords[userId];
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Kalıcı Olarak Silindi: ${removed.name} (${removed.email})`, 'high');
    this.db.saveData(this.db.data);

    // 3. PostgreSQL Transaction: Cihazları güncelle ve kullanıcıyı sil
    this.db.postgresRepo?.deleteUser(userId).catch((err: any) => {
      console.warn('[Postgres deleteUser Error]:', err?.message || err);
    });
  }

  public async terminateUserSessions(userId: string) {
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
    this.db.saveData(this.db.data);
    await this.db.postgresRepo.deleteUserSessions(userId).catch(() => {});
  }

  public async softDeleteUser(userId: string, adminId: string, adminName: string) {
    const user = this.db.data.users.find((u: any) => u.id === userId);
    if (!user) throw new Error("Kullanıcı bulunamadı");
    
    // Postgres Transaction
    await this.db.postgresRepo.softDeleteUser(userId);
    
    // In-memory update
    user.status = 'suspended';
    user.deletedAt = new Date().toISOString();
    
    // Remove active sessions
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
    
    this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Askıya Alındı (Soft Delete): ${user.name} (${user.email})`, 'high');
    this.db.saveData(this.db.data);
  }


  public getAuditLogs(): import('../../types.js').AuditLog[] {
    return this.db.data.auditLogs.slice(-100).reverse();
  }

  public addAuditLog(userId: string, userName: string, action: string, severity: import('../../types.js').AuditLog['severity'] = 'low') {
    const logItem: import('../../types.js').AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      tenantId: userId,
      userName,
      action,
      ip: '127.0.0.1',
      severity,
    };
    this.db.data.auditLogs.push(logItem);
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveAuditLog(logItem).catch(() => {});
  }
}
