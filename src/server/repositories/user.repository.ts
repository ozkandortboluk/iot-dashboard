import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { normalizeEmail, validateEmail, validatePassword } from '../utils/validation.js';
import { defaultWidgets } from '../initialData.js';
import type { User, UserSession } from '../../types.js';

export class UserRepository {
  constructor(private db: any) {}

  private isPgReady(): boolean {
    return typeof this.db?.postgresRepo?.isReady === 'function' && Boolean(this.db.postgresRepo.isReady());
  }

  public getUsers(): User[] {
    return this.db.data.users || [];
  }

  public async getUsersAsync(): Promise<User[]> {
    if (this.isPgReady()) {
      return await this.db.postgresRepo.getUsers();
    }
    return this.getUsers();
  }

  public async createSession(user: User): Promise<string> {
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

    if (this.isPgReady()) {
      await this.db.postgresRepo.saveSession(session).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      return token;
    }

    if (!this.db.data.sessions) {
      this.db.data.sessions = [];
    }
    this.db.data.sessions = this.db.data.sessions.filter(
      (s: any) => new Date(s.expiresAt).getTime() > Date.now()
    );
    this.db.data.sessions.push(session);
    this.db.saveData(this.db.data, true);
    return token;
  }

  public async deleteSession(token: string): Promise<boolean> {
    if (!token) return false;
    const cleanToken = token.trim();

    if (this.isPgReady()) {
      await this.db.postgresRepo.deleteSession(cleanToken).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      return true;
    }

    const initialLength = (this.db.data.sessions || []).length;
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.token !== cleanToken);
    const removed = (this.db.data.sessions || []).length < initialLength;
    if (removed) {
      this.db.saveData(this.db.data, true);
    }
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

  public async verifySessionAsync(token: string): Promise<{ user: User; session: UserSession } | null> {
    if (!token) return null;
    const cleanToken = token.trim();

    if (this.isPgReady()) {
      return await this.db.postgresRepo.verifySession(cleanToken);
    }

    return this.verifySession(cleanToken);
  }

  public async authenticate(email: string, pass: string): Promise<{ user: User; token: string } | null> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. PostgreSQL Production Mode: PostgreSQL is the SOLE source of truth
    if (this.isPgReady()) {
      const record = await this.db.postgresRepo.getUserWithPassword(cleanEmail);
      if (!record) {
        this.addAuditLog('unknown', email, 'Hatalı Giriş Denemesi (Kullanıcı Bulunamadı)', 'high');
        return null;
      }
      const { user, passwordHash: storedHash } = record;
      if (storedHash && verifyPassword(pass, storedHash)) {
        if (!storedHash.startsWith('$2')) {
          const newHashed = hashPassword(pass);
          await this.db.postgresRepo.updateUserPassword(user.id, newHashed).catch((e: any) =>
            console.warn('[PG Error]', e?.message || e)
          );
        }
        const token = await this.createSession(user);
        this.addAuditLog(user.id, user.name, 'Giriş Başarılı (PostgreSQL Bcrypt Verified)', 'low');
        return { user, token };
      }
      this.addAuditLog(user.id, email, 'Hatalı Giriş Denemesi (Şifre Hatalı)', 'high');
      return null;
    }

    // Fallback for non-postgres local/test mode
    const user = (this.db.data.users || []).find((u: any) => u.email.toLowerCase() === cleanEmail);
    if (!user) return null;
    const storedHash = (this.db.data.passwords || {})[user.id];
    if (storedHash && verifyPassword(pass, storedHash)) {
      if (!storedHash.startsWith('$2')) {
        this.db.data.passwords[user.id] = hashPassword(pass);
        this.db.saveData(this.db.data, true);
      }
      const token = await this.createSession(user);
      this.addAuditLog(user.id, user.name, 'Giriş Başarılı (Bcrypt Verified)', 'low');
      return { user, token };
    }
    this.addAuditLog(user ? user.id : 'unknown', email, 'Hatalı Giriş Denemesi', 'high');
    return null;
  }

  public async registerUser(
    name: string,
    email: string,
    pass: string,
    role: User['role'] = 'customer',
    companyName?: string
  ): Promise<User> {
    const emailRes = validateEmail(email);
    if (!emailRes.valid) throw new Error(emailRes.error || 'Geçersiz e-posta adresi.');
    const cleanEmail = emailRes.normalized;

    const passRes = validatePassword(pass);
    if (!passRes.valid) throw new Error(passRes.error || 'Geçersiz şifre.');

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

    // 1. PostgreSQL is the SOLE source of truth in production
    if (this.isPgReady()) {
      const existingPgUser = await this.db.postgresRepo.getUserByEmail(cleanEmail);
      if (existingPgUser) {
        throw new Error('Bu e-posta adresi zaten kayıtlı.');
      }
      try {
        await this.db.postgresRepo.saveUser(newUser, hashedPassword);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes('unique constraint') || errMsg.includes('users_email_key') || err.code === '23505') {
          throw new Error('Bu e-posta adresi zaten kayıtlı.', { cause: err });
        }
        throw err;
      }

      await this.db.postgresRepo.saveDashboard(dashboard).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      await this.db.postgresRepo.saveAuditLog(auditLog).catch((e: any) => console.warn('[PG Error]', e?.message || e));

      return newUser;
    }

    // Fallback for non-postgres local/test mode
    const existing = (this.db.data.users || []).find((u: any) => u.email.toLowerCase() === cleanEmail);
    if (existing) throw new Error('Bu e-posta adresi zaten kayıtlı.');

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
          status: 'active' as const,
        },
        createdAt: new Date().toISOString(),
      };

      const membership = {
        id: `mem_${Date.now()}`,
        userId: newUser.id,
        tenantId: tenant.id,
        role: 'admin' as import('../../types.js').TenantRole,
        createdAt: new Date().toISOString(),
      };

      this.db.data.tenants.push(tenant);
      this.db.data.tenantMemberships.push(membership);
    }

    if (!this.db.data.users) this.db.data.users = [];
    if (!this.db.data.passwords) this.db.data.passwords = {};
    if (!this.db.data.dashboards) this.db.data.dashboards = [];
    if (!this.db.data.auditLogs) this.db.data.auditLogs = [];

    this.db.data.users.push(newUser);
    this.db.data.passwords[newUser.id] = hashedPassword;
    this.db.data.dashboards.push(dashboard);
    this.db.data.auditLogs.push(auditLog);

    this.db.saveData(this.db.data, true);

    return newUser;
  }

  public async changePassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    const passRes = validatePassword(newPass);
    if (!passRes.valid) {
      throw new Error(passRes.error || 'Yeni şifre güvenlik kriterlerini karşılamıyor.');
    }
    const newHash = hashPassword(newPass.trim());

    if (this.isPgReady()) {
      const record = await this.db.postgresRepo.getUserWithPassword(userId);
      if (!record) throw new Error('Kullanıcı bulunamadı.');
      const { user, passwordHash: currentHash } = record;
      if (!currentHash || !verifyPassword(oldPass, currentHash)) {
        this.addAuditLog(userId, user.name, 'Başarısız Şifre Değiştirme Denemesi (Eski Şifre Hatalı)', 'high');
        throw new Error('Mevcut şifreniz hatalı.');
      }
      await this.db.postgresRepo.updateUserPassword(userId, newHash);
      this.addAuditLog(userId, user.name, 'Kullanıcı Şifresini Başarıyla Güncelledi (PostgreSQL Verified)', 'low');
      return;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    const currentHash = (this.db.data.passwords || {})[userId];
    if (!currentHash || !verifyPassword(oldPass, currentHash)) {
      this.addAuditLog(userId, user.name, 'Başarısız Şifre Değiştirme Denemesi (Eski Şifre Hatalı)', 'high');
      throw new Error('Mevcut şifreniz hatalı.');
    }

    this.db.data.passwords[userId] = newHash;
    this.db.saveData(this.db.data, true);
    this.addAuditLog(userId, user.name, 'Kullanıcı Şifresini Başarıyla Güncelledi', 'low');
  }

  public async updateUserRole(userId: string, newRole: User['role']): Promise<User> {
    if (this.isPgReady()) {
      const user = await this.db.postgresRepo.getUserById(userId);
      if (!user) throw new Error('Kullanıcı bulunamadı.');
      const oldRole = user.role;
      user.role = newRole;
      await this.db.postgresRepo.saveUser(user);
      this.db.addAuditLog('system', 'Admin', `Kullanıcı Rolü Güncellendi: ${user.name} (${oldRole} -> ${newRole})`, 'high');
      return user;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');
    const oldRole = user.role;
    user.role = newRole;

    this.db.addAuditLog('system', 'Admin', `Kullanıcı Rolü Güncellendi: ${user.name} (${oldRole} -> ${newRole})`, 'high');
    this.db.saveData(this.db.data, true);
    return user;
  }

  public deleteUser(userId: string, adminId = 'system', adminName = 'Admin') {
    if (this.isPgReady()) {
      this.db.postgresRepo.deleteUser(userId).catch((err: any) => {
        console.warn('[Postgres deleteUser Error]:', err?.message || err);
      });
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Silindi: ID ${userId}`, 'high');
      return;
    }

    const index = (this.db.data.users || []).findIndex((u: any) => u.id === userId);
    if (index === -1) return;

    const removed = this.db.data.users[index];

    // 1. CİHAZ SAHİPLİĞİNİ KORUMA & KANONİK AKTARIM:
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
    if (this.db.data.passwords) {
      delete this.db.data.passwords[userId];
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Kalıcı Olarak Silindi: ${removed.name} (${removed.email})`, 'high');
    this.db.saveData(this.db.data, true);
  }

  public async advancedDeleteUser(
    userId: string,
    adminId: string,
    adminName: string,
    options: {
      deleteDevices?: boolean;
      deleteDashboards?: boolean;
      deleteAlarms?: boolean;
      deleteTelemetry?: boolean;
    }
  ) {
    if (this.isPgReady()) {
      await this.db.postgresRepo.advancedDeleteUser(userId, options).catch((err: any) => {
        console.warn('[Postgres advancedDeleteUser Error]:', err?.message || err);
      });
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Gelişmiş Silindi: ID ${userId}`, 'high');
      return;
    }

    const index = (this.db.data.users || []).findIndex((u: any) => u.id === userId);
    if (index === -1) return;

    const removed = this.db.data.users[index];

    const ownedDevices = (this.db.data.devices || []).filter(
      (d: any) => d.tenantId === userId || d.userId === userId || d.customerId === userId
    );

    if (options.deleteDevices) {
      this.db.data.devices = (this.db.data.devices || []).filter(
        (d: any) => !(d.tenantId === userId || d.userId === userId || d.customerId === userId)
      );
      this.db.addAuditLog(adminId, adminName, `Müşteri Silindi & ${ownedDevices.length} Cihazı Kalıcı Olarak Silindi: ${removed.name}`, 'high');
    } else {
      const now = new Date().toISOString();
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
        this.db.addAuditLog(adminId, adminName, `Müşteri Silindi, ${ownedDevices.length} Cihazı Merkez'e Devredildi: ${removed.name}`, 'medium');
      }
    }

    const ownedDeviceIds = new Set<string>(ownedDevices.map((d: any) => String(d.id)));

    if (options.deleteTelemetry) {
      this.db.data.telemetry = (this.db.data.telemetry || []).filter(
        (t: any) => !ownedDeviceIds.has(t.deviceId) && t.userId !== userId && t.tenantId !== userId
      );
      if (this.db.data.history) {
        for (const devId of ownedDeviceIds) {
          delete (this.db.data.history as Record<string, any>)[devId];
        }
      }
    }

    if (options.deleteDashboards) {
      this.db.data.dashboards = (this.db.data.dashboards || []).filter(
        (d: any) => d.userId !== userId && d.tenantId !== userId && d.id !== userId
      );
    }

    if (options.deleteAlarms) {
      this.db.data.rules = (this.db.data.rules || []).filter(
        (r: any) => r.userId !== userId && r.tenantId !== userId && !ownedDeviceIds.has(r.deviceId)
      );
      this.db.data.activeAlarms = (this.db.data.activeAlarms || []).filter(
        (a: any) => a.userId !== userId && a.tenantId !== userId && !ownedDeviceIds.has(a.deviceId)
      );
      this.db.data.alarmEvents = (this.db.data.alarmEvents || []).filter(
        (e: any) => e.tenantId !== userId && !ownedDeviceIds.has(e.deviceId)
      );
      this.db.data.notifications = (this.db.data.notifications || []).filter(
        (n: any) => n.userId !== userId && n.tenantId !== userId && !ownedDeviceIds.has(n.deviceId)
      );
      this.db.data.notificationQueue = (this.db.data.notificationQueue || []).filter(
        (q: any) => q.tenantId !== userId && !ownedDeviceIds.has(q.deviceId)
      );
      this.db.data.dispatchLogs = (this.db.data.dispatchLogs || []).filter(
        (l: any) => l.tenantId !== userId && !ownedDeviceIds.has(l.deviceId)
      );
    }

    // Kullanıcıyı ve oturumları kaldır
    this.db.data.users.splice(index, 1);
    if (this.db.data.passwords) {
      delete this.db.data.passwords[userId];
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    this.db.saveData(this.db.data, true);

    // Real-time broadcast updates
    this.db.notifyNotificationListeners('devices:updated', this.db.data.devices);
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    this.db.notifyNotificationListeners('notifications:updated', this.db.data.notifications);
    this.db.notifyNotificationListeners('notification-queue:updated', this.db.data.notificationQueue);
    this.db.notifyNotificationListeners('dispatch-logs:updated', this.db.data.dispatchLogs);
  }

  public async terminateUserSessions(userId: string) {
    if (this.isPgReady()) {
      await this.db.postgresRepo.deleteUserSessions(userId).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      return;
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
    this.db.saveData(this.db.data, true);
  }

  public async softDeleteUser(userId: string, adminId: string, adminName: string) {
    if (this.isPgReady()) {
      await this.db.postgresRepo.softDeleteUser(userId).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      await this.db.postgresRepo.deleteUserSessions(userId).catch(() => {});
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Askıya Alındı (Soft Delete): ID ${userId}`, 'high');
      return;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı');

    user.status = 'suspended';
    user.deletedAt = new Date().toISOString();

    // Remove active sessions
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Askıya Alındı (Soft Delete): ${user.name} (${user.email})`, 'high');
    this.db.saveData(this.db.data, true);
  }

  public getAuditLogs(): import('../../types.js').AuditLog[] {
    return (this.db.data.auditLogs || []).slice(-100).reverse();
  }

  public async addAuditLog(
    userId: string,
    userName: string,
    action: string,
    severity: import('../../types.js').AuditLog['severity'] = 'low'
  ) {
    const logItem: import('../../types.js').AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      tenantId: userId,
      userName,
      action,
      ip: '127.0.0.1',
      severity,
    };

    if (this.isPgReady()) {
      await this.db.postgresRepo.saveAuditLog(logItem).catch((e: any) => console.warn('[PG Error]', e?.message || e));
      return;
    }

    if (!this.db.data.auditLogs) this.db.data.auditLogs = [];
    this.db.data.auditLogs.push(logItem);
    this.db.saveData(this.db.data);
  }
}
