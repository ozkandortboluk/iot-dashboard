import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
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
    const user = this.db.data.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
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

  public registerUser(name: string, email: string, pass: string, role: User['role'] = 'customer', companyName?: string): User {
    const existing = this.db.data.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) throw new Error('Bu e-posta adresi zaten kayıtlı.');

    const newUser: User = {
      id: `usr_${Date.now()}`,
      name,
      email,
      role,
      created_at: new Date().toISOString(),
    };
    
    // Multi-tenant setup: If companyName is provided, create a Tenant and a Membership
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
    this.db.data.passwords[newUser.id] = hashPassword(pass);
    this.db.data.dashboards.push({
      id: `dash_${newUser.id}`,
      userId: newUser.id,
      title: `${companyName || name} Özel Dashboard`,
      widgets: [...defaultWidgets],
      updatedAt: new Date().toISOString(),
    });
    this.db.addAuditLog(newUser.id, name, `Yeni Kullanıcı Kaydı Yapıldı: ${email} (${role})`, 'low');
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveUser(newUser, hashPassword(pass)).catch(() => {});
    
    if (this.db.data.dashboards.length > 0) {
      const userDash = this.db.data.dashboards[this.db.data.dashboards.length - 1];
      this.db.postgresRepo.saveDashboard(userDash).catch(() => {});
    }
    return newUser;
  }

  public changePassword(userId: string, oldPass: string, newPass: string): void {
    const user = this.db.data.users.find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    const currentHash = this.db.data.passwords[userId];
    if (!currentHash || !verifyPassword(oldPass, currentHash)) {
      this.addAuditLog(userId, user.name, 'Başarısız Şifre Değiştirme Denemesi (Eski Şifre Hatalı)', 'high');
      throw new Error('Mevcut şifreniz hatalı.');
    }

    if (!newPass || newPass.trim().length < 6) {
      throw new Error('Yeni şifre en az 6 karakter olmalıdır.');
    }

    const newHash = hashPassword(newPass.trim());
    this.db.data.passwords[userId] = newHash;
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveUser(user, newHash).catch(() => {});
    this.addAuditLog(userId, user.name, 'Kullanıcı Şifresini Başarıyla Güncelledi', 'low');
  }

  public updateUserRole(userId: string, newRole: User['role']): User {
    const user = this.db.data.users.find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');
    const oldRole = user.role;
    user.role = newRole;
    this.db.addAuditLog('system', 'Admin', `Kullanıcı Rolü Güncellendi: ${user.name} (${oldRole} -> ${newRole})`, 'high');
    this.db.saveData(this.db.data);
    this.db.postgresRepo.saveUser(user).catch(() => {});
    return user;
  }

  public deleteUser(userId: string) {
    const index = this.db.data.users.findIndex((u: any) => u.id === userId);
    if (index !== -1) {
      const removed = this.db.data.users.splice(index, 1)[0];
      delete this.db.data.passwords[userId];
      this.db.addAuditLog('system', 'Admin', `Müşteri Hesabı Kalıcı Olarak Silindi: ${removed.name} (${removed.email})`, 'high');
      this.db.saveData(this.db.data);
      this.db.postgresRepo.deleteUser(userId).catch(() => {});
    }
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
      userId,
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
