import { handlePostgresAsyncError } from '../database/connection.js';
import crypto from 'crypto';
import { hashPassword, verifyPassword, verifyAndMigratePassword } from '../utils/crypto.js';
import { normalizeEmail, validateEmail, validatePassword } from '../utils/validation.js';
import { defaultWidgets } from '../initialData.js';
import type { User, UserSession } from '../../types.js';

function safeTerminateUserSockets(userId: string, code = 1008, reason = 'Session terminated') {
  try {
    import('../services/websocket.js').then((wsMod) => {
      if (typeof wsMod.terminateUserSockets === 'function') {
        wsMod.terminateUserSockets(userId, code, reason);
      }
    }).catch(() => {});
  } catch {}
}

function safeTerminateUserOtherSockets(userId: string, keepTokenOrId: string, code = 1008, reason = 'Other sessions revoked') {
  try {
    import('../services/websocket.js').then((wsMod) => {
      if (typeof wsMod.terminateUserOtherSockets === 'function') {
        wsMod.terminateUserOtherSockets(userId, keepTokenOrId, code, reason);
      }
    }).catch(() => {});
  } catch {}
}

function safeTerminateSessionSocket(sessionToken: string, code = 1008, reason = 'Session deleted') {
  try {
    import('../services/websocket.js').then((wsMod) => {
      if (typeof wsMod.terminateSessionSocket === 'function') {
        wsMod.terminateSessionSocket(sessionToken, code, reason);
      }
    }).catch(() => {});
  } catch {}
}

function safeBroadcast(event: string, payload: any) {
  try {
    import('../services/websocket.js').then((wsMod) => {
      if (typeof wsMod.broadcast === 'function') {
        wsMod.broadcast(event, payload);
      }
    }).catch(() => {});
  } catch {}
}

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
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenPrefix = rawToken.substring(0, 10);

    const session: UserSession = {
      token: rawToken, // Used by saveSession to hash & persist
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      userName: user.name,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // In-memory cache stores tokenHash for resilient zero-plaintext verification
    const inMemorySession: any = {
      ...session,
      tokenHash,
      tokenPrefix,
      token: undefined, // Wipe plaintext token
    };

    if (!this.db.data.sessions) {
      this.db.data.sessions = [];
    }
    this.db.data.sessions = this.db.data.sessions.filter(
      (s: any) => new Date(s.expiresAt).getTime() > Date.now()
    );
    this.db.data.sessions.push(inMemorySession);
    try {
      this.db.saveData(this.db.data, true);
    } catch {}

    if (this.isPgReady()) {
      await this.db.postgresRepo.saveSession(session).catch((e: any) => console.warn('[PG Error saveSession]', e?.message || e));
    }
    return rawToken;
  }

  public async deleteSession(token: string): Promise<boolean> {
    if (!token) return false;
    const cleanToken = token.trim();
    safeTerminateSessionSocket(cleanToken, 1008, 'Session logged out');
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    if (this.isPgReady()) {
      await this.db.postgresRepo.deleteSession(cleanToken).catch((e: any) => {
        console.warn('[PG Error deleteSession]', e?.message || e);
        throw e;
      });
    }

    const initialLength = (this.db.data.sessions || []).length;
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.tokenHash !== tokenHash && s.token !== cleanToken);
    const removed = (this.db.data.sessions || []).length < initialLength;
    if (removed) {
      try {
        this.db.saveData(this.db.data, true);
      } catch {}
    }
    return removed;
  }

  public verifySession(token: string): { user: User; session: UserSession } | null {
    if (!token) return null;
    const cleanToken = token.trim();
    if (!this.db.data.sessions || this.db.data.sessions.length === 0) {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const session = this.db.data.sessions.find((s: any) => (s.tokenHash && s.tokenHash === tokenHash) || s.token === cleanToken);
    if (!session) {
      return null;
    }

    // Check expiration strictly - no automatic renewal for expired sessions
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    let user = (this.db.data.users || []).find(
      (u: any) =>
        u.id === session.userId ||
        (session.userEmail && u.email && u.email.toLowerCase() === session.userEmail.toLowerCase())
    );

    if (!user && session.userEmail) {
      user = {
        id: session.userId || `usr_${Date.now()}`,
        name: session.userName || 'Yönetici',
        email: session.userEmail,
        role: session.userRole || 'admin',
        createdAt: session.createdAt || new Date().toISOString(),
      } as unknown as User;
    }

    if (!user) {
      return null;
    }

    return {
      user,
      session: {
        ...session,
        token: session.token || cleanToken,
      },
    };
  }

  public async verifySessionAsync(token: string): Promise<{ user: User; session: UserSession } | null> {
    if (!token) return null;
    const cleanToken = token.trim();
    const isProduction = process.env.NODE_ENV === 'production';

    if (this.isPgReady()) {
      const pgResult = await this.db.postgresRepo.verifySession(cleanToken).catch(() => null);
      if (pgResult) {
        return pgResult;
      }
      // In non-production, fallback to in-memory session if PostgreSQL doesn't have it
      if (!isProduction) {
        return this.verifySession(cleanToken);
      }
      return null;
    }

    // Fail-Closed: When in real production, reject session verification if PostgreSQL is down
    if (isProduction) {
      return null;
    }

    // In non-production (local/test/aistudio), verify session against in-memory store
    return this.verifySession(cleanToken);
  }

  public async authenticate(email: string, pass: string): Promise<{ user: User; token: string } | null> {
    const cleanEmail = email.trim().toLowerCase();
    const isPgConfigured = Boolean(this.db?.getPostgresUrl?.()?.trim());
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. PostgreSQL Mode: PostgreSQL is the authoritative single source of truth
    if (this.isPgReady()) {
      const record = await this.db.postgresRepo.getUserWithPassword(cleanEmail);
      if (record) {
        const { user, passwordHash: storedHash } = record;
        if (user.status !== 'active' || user.deletedAt) {
          this.addAuditLog(user.id, email, 'Askıya Alınmış / Silinmiş Hesap Giriş Denemesi Engellendi', 'high');
          return null;
        }
        const authCheck = verifyAndMigratePassword(pass, storedHash);
        if (storedHash && authCheck.isValid) {
          if (authCheck.needsMigration) {
            const newHashed = hashPassword(pass);
            await this.db.postgresRepo.updateUserPassword(user.id, newHashed).catch(handlePostgresAsyncError);
          }
          // Sync with in-memory store
          if (this.db.data.users) {
            const idx = this.db.data.users.findIndex((u: any) => u.id === user.id || u.email.toLowerCase() === cleanEmail);
            if (idx >= 0) this.db.data.users[idx] = user;
            else this.db.data.users.push(user);
          }
          if (this.db.data.passwords) {
            this.db.data.passwords[user.id] = storedHash.startsWith('$2') ? storedHash : hashPassword(pass);
          }

          const token = await this.createSession(user);
          this.addAuditLog(user.id, user.name, 'Giriş Başarılı (PostgreSQL Bcrypt Verified)', 'low');
          return { user, token };
        }
        this.addAuditLog(user.id, email, 'Hatalı Giriş Denemesi (Şifre Hatalı)', 'high');
        return null;
      }
      this.addAuditLog('unknown', email, 'Hatalı Giriş Denemesi (Kullanıcı Bulunamadı)', 'high');
      return null;
    }

    // 2. Fail-Closed Enforcement:
    // In production or when PostgreSQL is configured, NEVER fall back to local in-memory authentication!
    // In automated CI test runner (vitest), allow in-memory auth testing when PostgreSQL is unprovisioned.
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (!isTest && (isProduction || isPgConfigured)) {
      throw new Error('PostgreSQL ana veritabanı bağlantısı aktif değil. Güvenlik nedeniyle yerel kimlik doğrulamaya izin verilmez.');
    }

    // 3. Explicit Standalone Non-Production Local Dev Mode (No PostgreSQL configured)
    const user = (this.db.data.users || []).find(
      (u: any) => u.email.toLowerCase() === cleanEmail && (u.status === 'active' || !u.status) && !u.deletedAt
    );
    if (!user) {
      this.addAuditLog('unknown', email, 'Hatalı Giriş Denemesi (Kullanıcı Bulunamadı veya Askıya Alınmış)', 'high');
      return null;
    }
    const storedHash = (this.db.data.passwords || {})[user.id];
    const authCheck = verifyAndMigratePassword(pass, storedHash);
    if (storedHash && authCheck.isValid) {
      if (authCheck.needsMigration) {
        const newHashed = hashPassword(pass);
        this.db.data.passwords[user.id] = newHashed;
        this.db.saveData(this.db.data, true);
      }
      const token = await this.createSession(user);
      this.addAuditLog(user.id, user.name, 'Giriş Başarılı (Local Dev Verified)', 'low');
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
      status: 'active',
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

      await this.db.postgresRepo.saveDashboard(dashboard).catch(handlePostgresAsyncError);
      await this.db.postgresRepo.saveAuditLog(auditLog).catch(handlePostgresAsyncError);

      // Also sync to in-memory store for instant cache retrieval
      if (!this.db.data.users) this.db.data.users = [];
      if (!this.db.data.passwords) this.db.data.passwords = {};
      const existingIdx = this.db.data.users.findIndex((u: any) => u.id === newUser.id || u.email.toLowerCase() === cleanEmail);
      if (existingIdx >= 0) {
        this.db.data.users[existingIdx] = newUser;
      } else {
        this.db.data.users.push(newUser);
      }
      this.db.data.passwords[newUser.id] = hashedPassword;
      try {
        this.db.saveData(this.db.data, true);
      } catch {}

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
      const authCheck = verifyAndMigratePassword(oldPass, currentHash);
      if (!currentHash || !authCheck.isValid) {
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
    const authCheck = verifyAndMigratePassword(oldPass, currentHash);
    if (!currentHash || !authCheck.isValid) {
      this.addAuditLog(userId, user.name, 'Başarısız Şifre Değiştirme Denemesi (Eski Şifre Hatalı)', 'high');
      throw new Error('Mevcut şifreniz hatalı.');
    }

    this.db.data.passwords[userId] = newHash;
    this.db.saveData(this.db.data, true);
    this.addAuditLog(userId, user.name, 'Kullanıcı Şifresini Başarıyla Güncelledi', 'low');
  }

  public async resetPasswordDirect(userId: string, newPass: string): Promise<void> {
    const passRes = validatePassword(newPass);
    if (!passRes.valid) {
      throw new Error(passRes.error || 'Yeni şifre güvenlik kriterlerini karşılamıyor.');
    }
    const newHash = hashPassword(newPass.trim());

    if (this.isPgReady()) {
      await this.db.postgresRepo.updateUserPassword(userId, newHash);
      return;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    if (!user) throw new Error('Kullanıcı bulunamadı.');

    if (!this.db.data.passwords) {
      this.db.data.passwords = {};
    }
    this.db.data.passwords[userId] = newHash;
    this.db.saveData(this.db.data, true);
  }

  public async updateUserRole(userId: string, newRole: User['role']): Promise<User> {
    safeTerminateUserSockets(userId, 1008, 'User role updated');
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

  public async deleteUser(userId: string, adminId = 'system', adminName = 'Admin') {
    safeTerminateUserSockets(userId, 1008, 'User deleted');
    if (this.isPgReady()) {
      await this.db.postgresRepo.deleteUser(userId).catch((err: any) => {
        console.warn('[Postgres deleteUser Error]:', err?.message || err);
      });
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Silindi: ID ${userId}`, 'high');
    }

    const index = (this.db.data.users || []).findIndex((u: any) => u.id === userId);
    const removed = index >= 0 ? this.db.data.users[index] : null;

    // 1. CİHAZ SAHİPLİĞİNİ KORUMA & KANONİK AKTARIM:
    const ownedDevices = (this.db.data.devices || []).filter(
      (d: any) => d.tenantId === userId || d.userId === userId || d.customerId === userId
    );

    for (const dev of ownedDevices) {
      dev.tenantId = 'usr_admin';
      dev.userId = 'usr_admin';
      if (!dev.location || dev.location === 'Varsayılan') {
        dev.location = `Merkez Depo (Eski Müşteri: ${removed?.name || userId})`;
      }
    }

    if (ownedDevices.length > 0) {
      this.db.addAuditLog(
        adminId,
        adminName,
        `Müşteri Silinirken Cihazlar Korundu & Devredildi: "${removed?.name || userId}" kullanıcısına ait ${ownedDevices.length} adet cihaz Sistem Yöneticisine devredildi.`,
        'medium'
      );
    }

    // 2. Kullanıcıya ait özel dashboard'u temizle (Admin dashboard'unu bozmasını engelle)
    if (this.db.data.dashboards) {
      this.db.data.dashboards = this.db.data.dashboards.filter(
        (d: any) => d.id !== `dash_${userId}` && d.tenantId !== userId && (d as any).userId !== userId
      );
    }

    // 3. Kullanıcıyı ve oturumları kaldır
    if (index >= 0) {
      this.db.data.users.splice(index, 1);
    }
    if (this.db.data.passwords) {
      delete this.db.data.passwords[userId];
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    if (removed) {
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Kalıcı Olarak Silindi: ${removed.name} (${removed.email})`, 'high');
    }
    this.db.saveData(this.db.data, true);

    // 4. Canlı Senkronizasyon & WebSocket Bildirimleri
    safeBroadcast('user:deleted', { id: userId });
    safeBroadcast('users:updated', this.db.data.users);
    safeBroadcast('devices:updated', this.db.data.devices);
    this.db.notifyNotificationListeners('devices:updated', this.db.data.devices);
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
    safeTerminateUserSockets(userId, 1008, 'User deleted');
    if (this.isPgReady()) {
      await this.db.postgresRepo.advancedDeleteUser(userId, options).catch((err: any) => {
        console.warn('[Postgres advancedDeleteUser Error]:', err?.message || err);
      });
      this.db.addAuditLog(adminId, adminName, `Müşteri Hesabı Gelişmiş Silindi: ID ${userId}`, 'high');
    }

    const index = (this.db.data.users || []).findIndex((u: any) => u.id === userId);
    const removed = index >= 0 ? this.db.data.users[index] : null;

    const ownedDevices = (this.db.data.devices || []).filter(
      (d: any) => d.tenantId === userId || d.userId === userId || d.customerId === userId
    );

    if (options.deleteDevices) {
      this.db.data.devices = (this.db.data.devices || []).filter(
        (d: any) => !(d.tenantId === userId || d.userId === userId || d.customerId === userId)
      );
      this.db.addAuditLog(adminId, adminName, `Müşteri Silindi & ${ownedDevices.length} Cihazı Kalıcı Olarak Silindi: ${removed?.name || userId}`, 'high');
    } else {
      for (const dev of ownedDevices) {
        dev.tenantId = 'usr_admin';
        dev.userId = 'usr_admin';
        if (!dev.location || dev.location === 'Varsayılan') {
          dev.location = `Merkez Depo (Eski Müşteri: ${removed?.name || userId})`;
        }
      }
      if (ownedDevices.length > 0) {
        this.db.addAuditLog(adminId, adminName, `Müşteri Silindi, ${ownedDevices.length} Cihazı Merkez'e Devredildi: ${removed?.name || userId}`, 'medium');
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
        (d: any) => d.userId !== userId && d.tenantId !== userId && d.id !== userId && d.id !== `dash_${userId}`
      );
    } else if (this.db.data.dashboards) {
      // Transfer dashboard to usr_admin as archive so it never stays orphaned
      for (const dash of this.db.data.dashboards) {
        if (dash.id === `dash_${userId}` || dash.tenantId === userId || (dash as any).userId === userId) {
          dash.tenantId = 'usr_admin';
          dash.title = `Arşiv: ${removed?.name || userId} Paneli`;
        }
      }
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
    if (index >= 0) {
      this.db.data.users.splice(index, 1);
    }
    if (this.db.data.passwords) {
      delete this.db.data.passwords[userId];
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);

    this.db.saveData(this.db.data, true);

    // Real-time broadcast updates
    safeBroadcast('user:deleted', { id: userId });
    safeBroadcast('users:updated', this.db.data.users);
    safeBroadcast('devices:updated', this.db.data.devices);
    this.db.notifyNotificationListeners('devices:updated', this.db.data.devices);
    this.db.notifyNotificationListeners('rules:updated', this.db.data.rules);
    this.db.notifyNotificationListeners('alarms:updated', this.db.data.activeAlarms);
    this.db.notifyNotificationListeners('notifications:updated', this.db.data.notifications);
    this.db.notifyNotificationListeners('notification-queue:updated', this.db.data.notificationQueue);
    this.db.notifyNotificationListeners('dispatch-logs:updated', this.db.data.dispatchLogs);
  }

  public async terminateUserSessions(userId: string) {
    safeTerminateUserSockets(userId, 1008, 'Session terminated');
    if (this.isPgReady()) {
      await this.db.postgresRepo.deleteUserSessions(userId).catch((e: any) => {
        console.warn('[PG Error terminateUserSessions]', e?.message || e);
        throw e;
      });
      // Synchronize in-memory sessions cache
      this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
      return;
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
    this.db.saveData(this.db.data, true);
  }

  public async terminateUserOtherSessions(userId: string, currentToken: string) {
    safeTerminateUserOtherSockets(userId, currentToken, 1008, 'Other sessions revoked');
    const currentHash = crypto.createHash('sha256').update(currentToken.trim()).digest('hex');
    if (this.isPgReady()) {
      await this.db.postgresRepo.query(
        `DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2 AND token <> $3;`,
        [userId, currentHash, currentToken]
      ).catch((e: any) => {
        console.warn('[PG Error terminateOtherSessions]', e?.message || e);
        throw e;
      });
    }
    this.db.data.sessions = (this.db.data.sessions || []).filter(
      (s: any) => s.userId !== userId || s.tokenHash === currentHash || s.token === currentToken
    );
    this.db.saveData(this.db.data, true);
  }

  public async getUserSessions(userId: string): Promise<any[]> {
    if (this.isPgReady()) {
      const res = await this.db.postgresRepo.query(
        `SELECT id, token_prefix, created_at, expires_at FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC;`,
        [userId]
      ).catch(() => null);
      if (res && res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id || 'sess',
          token: r.token_prefix ? `${r.token_prefix}...` : 'sess_***',
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        }));
      }
    }
    return (this.db.data.sessions || [])
      .filter((s: any) => s.userId === userId && new Date(s.expiresAt).getTime() > Date.now())
      .map((s: any) => ({
        id: s.id || (s.tokenPrefix ? s.tokenPrefix : 'sess'),
        token: s.tokenPrefix ? `${s.tokenPrefix}...` : 'sess_***',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }));
  }

  public async softDeleteUser(userId: string, adminId: string, adminName: string) {
    safeTerminateUserSockets(userId, 1008, 'User account suspended');
    if (this.isPgReady()) {
      await this.db.postgresRepo.softDeleteUser(userId).catch((e: any) => {
        console.warn('[PG Error softDeleteUser]', e?.message || e);
        throw e;
      });
      await this.db.postgresRepo.deleteUserSessions(userId).catch((e: any) => {
        console.warn('[PG Error deleteUserSessions during softDelete]', e?.message || e);
        throw e;
      });
      // Synchronize in-memory user status
      const cached = (this.db.data?.users || []).find((u: any) => u.id === userId);
      if (cached) {
        cached.status = 'suspended';
        cached.deletedAt = new Date().toISOString();
      }
      this.db.data.sessions = (this.db.data.sessions || []).filter((s: any) => s.userId !== userId);
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
      await this.db.postgresRepo.saveAuditLog(logItem).catch(handlePostgresAsyncError);
      return;
    }

    if (!this.db.data.auditLogs) this.db.data.auditLogs = [];
    this.db.data.auditLogs.push(logItem);
    this.db.saveData(this.db.data);
  }
}
