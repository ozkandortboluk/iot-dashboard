import crypto from 'node:crypto';
import type { NotificationItem, DashboardLayout, WidgetConfig } from '../../types.js';
import { defaultWidgets } from '../initialData.js';
import { validateAndSanitizeWidgets } from '../../lib/widgetValidation.js';

export class NotificationRepository {
  constructor(private db: any) {}

  public getNotifications(requestingUserId = 'usr_admin', targetCustomerId?: string): NotificationItem[] {
    if (!this.db.data.notifications) this.db.data.notifications = [];
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    if (reqUser && reqUser.role === 'customer') {
      // Customer ONLY sees notifications addressed specifically to their account
      return this.db.data.notifications.filter((n: any) => n.tenantId === requestingUserId);
    }
    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return this.db.data.notifications.filter((n: any) => n.tenantId === targetCustomerId);
    }
    return this.db.data.notifications;
  }

  public async addNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'> & { id?: string; eventKey?: string }): Promise<NotificationItem> {
    if (!this.db.data.notifications) this.db.data.notifications = [];

    // Deduplication check: if eventKey is provided, check if already present
    if (notif.eventKey) {
      const existing = this.db.data.notifications.find((n: any) => n.eventKey === notif.eventKey);
      if (existing) {
        return existing;
      }
    }

    const deterministicId = notif.id || (notif.eventKey
      ? `notif_evk_${crypto.createHash('sha256').update(notif.eventKey).digest('hex').substring(0, 24)}`
      : `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

    const existingById = this.db.data.notifications.find((n: any) => n.id === deterministicId);
    if (existingById) {
      return existingById;
    }

    const fullNotif: NotificationItem = {
      ...notif,
      id: deterministicId,
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.db.data.notifications.unshift(fullNotif);
    if (this.db.data.notifications.length > 500) {
      this.db.data.notifications = this.db.data.notifications.slice(0, 500);
    }
    this.db.scheduleSave();
    this.db.notifyNotificationListeners('notification:new', fullNotif);

    const dev = fullNotif.deviceId ? (this.db.data.devices || []).find((d: any) => d.id === fullNotif.deviceId) : null;
    const isSimulated = dev?.isSimulated || false;
    const saveSimulatedDataToDb = dev?.saveSimulatedDataToDb || false;

    if (!isSimulated || saveSimulatedDataToDb) {
      if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveNotification(fullNotif).catch((e) => console.warn('[PG Error]', e.message)); }
    }
    return fullNotif;
  }

  public async markNotificationRead(id: string, userId = 'usr_admin') {
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
    const isAdmin = reqUser?.role === 'admin' || userId === 'usr_admin';

    if (!this.db.data.notifications) this.db.data.notifications = [];
    const notif = this.db.data.notifications.find((n: any) => n.id === id);
    if (notif) {
      if (!isAdmin && notif.tenantId !== userId && (notif as any).userId !== userId) {
        return; // Forbidden: Customer cannot mark another user's notification
      }
      notif.read = true;
      this.db.scheduleSave();
    }

    if (this.db.postgresRepo?.isReady()) {
      await this.db.postgresRepo.markNotificationRead(id, userId, isAdmin).catch((e: any) => console.warn('[PG Error markNotificationRead]', e.message));
    }

    const remaining = await this.db.getNotifications(userId);
    this.db.notifyNotificationListeners('notifications:updated', remaining);
  }

  public async markAllNotificationsRead(userId = 'usr_admin') {
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
    const isAdmin = reqUser?.role === 'admin' || userId === 'usr_admin';

    if (!this.db.data.notifications) this.db.data.notifications = [];
    let updated = false;
    this.db.data.notifications.forEach((n: any) => {
      if (!n.read && (isAdmin || n.tenantId === userId || (n as any).userId === userId)) {
        n.read = true;
        updated = true;
      }
    });
    if (updated) {
      this.db.scheduleSave();
    }

    if (this.db.postgresRepo?.isReady()) {
      await this.db.postgresRepo.markAllNotificationsRead(isAdmin ? undefined : userId).catch((e: any) => console.warn('[PG Error markAllNotificationsRead]', e.message));
    }

    const remaining = await this.db.getNotifications(userId);
    this.db.notifyNotificationListeners('notifications:updated', remaining);
  }

  public async getDashboard(userId: string): Promise<DashboardLayout> {
    const effectiveUserId = (!userId || userId === 'all') ? 'usr_admin' : userId;
    if (!this.db.data.dashboards) this.db.data.dashboards = [];

    // 0. Check PostgreSQL first if ready
    if (this.db.postgresRepo?.isReady()) {
      try {
        const pgDash = await this.db.postgresRepo.getDashboard(effectiveUserId);
        if (pgDash && Array.isArray(pgDash.widgets) && pgDash.widgets.length > 0) {
          const cachedIdx = this.db.data.dashboards.findIndex((d: any) => d.id === pgDash.id || d.tenantId === effectiveUserId);
          if (cachedIdx >= 0) {
            this.db.data.dashboards[cachedIdx] = pgDash;
          } else {
            this.db.data.dashboards.push(pgDash);
          }
          return pgDash;
        }
      } catch (err: any) {
        console.warn('[getDashboard PG check error]:', err?.message);
      }
    }

    // 1. First priority: Exact ID match (dash_usr_admin or dash_<userId>)
    const targetDashId = `dash_${effectiveUserId}`;
    let userDash = this.db.data.dashboards.find((d: any) => d.id === targetDashId);

    // 2. Second priority: If not found by ID and NOT admin, match tenantId (excluding dash_default and dash_usr_admin)
    if (!userDash && effectiveUserId !== 'usr_admin') {
      userDash = this.db.data.dashboards.find(
        (d: any) => (d.tenantId === effectiveUserId || (d as any).userId === effectiveUserId) && d.id !== 'dash_default' && d.id !== 'dash_usr_admin'
      );
    }

    if (userDash) {
      if (!userDash.widgets || !Array.isArray(userDash.widgets) || userDash.widgets.length === 0) {
        userDash.widgets = [...defaultWidgets];
        this.db.scheduleSave();
      }
      return userDash;
    }

    // 3. Fallback: If effectiveUserId is 'usr_admin' and dash_default exists, copy widgets from template
    const templateWidgets = (this.db.data.dashboards.find((d: any) => d.id === 'dash_default')?.widgets) || defaultWidgets;

    const user = (this.db.data.users || []).find((u: any) => u.id === effectiveUserId);
    const title = user
      ? `${user.companyName || user.name} Özel Dashboard`
      : (effectiveUserId === 'usr_admin' ? 'Merkez Yönetim Ana Dashboard' : 'Sistem Dashboard');

    const newDash: DashboardLayout = {
      id: targetDashId,
      tenantId: effectiveUserId,
      title,
      widgets: [...templateWidgets],
      updatedAt: new Date().toISOString(),
    };
    this.db.data.dashboards.push(newDash);
    this.db.scheduleSave();
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDashboard(newDash).catch((e: any) => console.warn('[PG Error]', e.message)); }
    return newDash;
  }

  public async saveDashboardWidgets(userId: string, widgets: WidgetConfig[], title?: string): Promise<DashboardLayout> {
    const effectiveUserId = (!userId || userId === 'all') ? 'usr_admin' : userId;
    if (!this.db.data.dashboards) this.db.data.dashboards = [];
    const targetDashId = `dash_${effectiveUserId}`;
    let userDash = this.db.data.dashboards.find((d: any) => d.id === targetDashId);
    if (!userDash && effectiveUserId !== 'usr_admin') {
      userDash = this.db.data.dashboards.find(
        (d: any) => (d.tenantId === effectiveUserId || (d as any).userId === effectiveUserId) && d.id !== 'dash_default' && d.id !== 'dash_usr_admin'
      );
    }
    if (!userDash) {
      userDash = await this.getDashboard(effectiveUserId);
    }
    const sanitized = validateAndSanitizeWidgets(widgets);
    userDash.id = targetDashId;
    userDash.tenantId = effectiveUserId;
    userDash.widgets = sanitized.length > 0 ? sanitized : [...defaultWidgets];
    if (title) userDash.title = title;
    userDash.updatedAt = new Date().toISOString();
    this.db.scheduleSave();
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDashboard(userDash).catch((e: any) => console.warn('[PG Error]', e.message)); }
    return userDash;
  }

  public async resetDashboard(userId: string): Promise<DashboardLayout> {
    const effectiveUserId = (!userId || userId === 'all') ? 'usr_admin' : userId;
    const user = (this.db.data.users || []).find((u: any) => u.id === effectiveUserId);
    const title = user
      ? `${user.companyName || user.name} Özel Dashboard`
      : (effectiveUserId === 'usr_admin' ? 'Merkez Yönetim Ana Dashboard' : 'Varsayılan Sistem Dashboard');
    return await this.saveDashboardWidgets(effectiveUserId, defaultWidgets, title);
  }
}
