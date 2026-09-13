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

  public async addNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): Promise<NotificationItem> {
    if (!this.db.data.notifications) this.db.data.notifications = [];
    const fullNotif: NotificationItem = {
      ...notif,
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
    const userDash = this.db.data.dashboards.find(
      (d: any) => d.tenantId === effectiveUserId || (d as any).userId === effectiveUserId || d.id === `dash_${effectiveUserId}`
    );
    if (userDash) {
      if (!userDash.widgets || !Array.isArray(userDash.widgets) || userDash.widgets.length === 0) {
        userDash.widgets = [...defaultWidgets];
        this.db.scheduleSave();
      }
      return userDash;
    }

    const user = (this.db.data.users || []).find((u: any) => u.id === effectiveUserId);
    const title = user
      ? `${user.companyName || user.name} Özel Dashboard`
      : (effectiveUserId === 'usr_admin' ? 'Ana Analitik & Saha İzleme Dashboard' : 'Sistem Dashboard');

    const newDash: DashboardLayout = {
      id: `dash_${effectiveUserId}`,
      tenantId: effectiveUserId,
      title,
      widgets: [...defaultWidgets],
      updatedAt: new Date().toISOString(),
    };
    this.db.data.dashboards.push(newDash);
    this.db.scheduleSave();
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDashboard(newDash).catch((e) => console.warn('[PG Error]', e.message)); }
    return newDash;
  }

  public async saveDashboardWidgets(userId: string, widgets: WidgetConfig[], title?: string): Promise<DashboardLayout> {
    const effectiveUserId = (!userId || userId === 'all') ? 'usr_admin' : userId;
    if (!this.db.data.dashboards) this.db.data.dashboards = [];
    let userDash = this.db.data.dashboards.find(
      (d: any) => d.tenantId === effectiveUserId || (d as any).userId === effectiveUserId || d.id === `dash_${effectiveUserId}`
    );
    if (!userDash) {
      userDash = await this.getDashboard(effectiveUserId);
    }
    const sanitized = validateAndSanitizeWidgets(widgets);
    userDash.widgets = sanitized.length > 0 ? sanitized : [...defaultWidgets];
    if (title) userDash.title = title;
    userDash.updatedAt = new Date().toISOString();
    this.db.scheduleSave();
    if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.saveDashboard(userDash).catch((e) => console.warn('[PG Error]', e.message)); }
    return userDash;
  }

  public async resetDashboard(userId: string): Promise<DashboardLayout> {
    const effectiveUserId = (!userId || userId === 'all') ? 'usr_admin' : userId;
    const user = (this.db.data.users || []).find((u: any) => u.id === effectiveUserId);
    const title = user
      ? `${user.companyName || user.name} Özel Dashboard`
      : (effectiveUserId === 'usr_admin' ? 'Ana Analitik & Saha İzleme Dashboard' : 'Varsayılan Sistem Dashboard');
    return await this.saveDashboardWidgets(effectiveUserId, defaultWidgets, title);
  }
}
