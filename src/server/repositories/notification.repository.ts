import type { NotificationItem, DashboardLayout, WidgetConfig } from '../../types.js';
import { defaultWidgets } from '../initialData.js';

export class NotificationRepository {
  constructor(private db: any) {}

  public getNotifications(requestingUserId = 'usr_admin', targetCustomerId?: string): NotificationItem[] {
    if (!this.db.data.notifications) this.db.data.notifications = [];
    const reqUser = (this.db.data.users || []).find((u: any) => u.id === requestingUserId);
    if (reqUser && reqUser.role === 'customer') {
      // Customer ONLY sees notifications addressed specifically to their account
      return this.db.data.notifications.filter((n: any) => n.userId === requestingUserId);
    }
    if (reqUser && reqUser.role === 'admin' && targetCustomerId && targetCustomerId !== 'all') {
      return this.db.data.notifications.filter((n: any) => n.userId === targetCustomerId);
    }
    return this.db.data.notifications;
  }

  public addNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): NotificationItem {
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
    this.db.postgresRepo.saveNotification(fullNotif).catch(() => {});
    return fullNotif;
  }

  public markNotificationRead(id: string, userId = 'usr_admin') {
    if (!this.db.data.notifications) this.db.data.notifications = [];
    const notif = this.db.data.notifications.find((n: any) => n.id === id);
    if (notif) {
      const reqUser = (this.db.data.users || []).find((u: any) => u.id === userId);
      if (reqUser && reqUser.role === 'customer' && notif.userId !== userId) {
        return; // Forbidden: Customer cannot mark another user's notification
      }

      notif.read = true;
      this.db.scheduleSave();
      this.db.notifyNotificationListeners('notifications:updated', this.getNotifications());
      this.db.postgresRepo.markNotificationRead(id).catch(() => {});
    }
  }

  public markAllNotificationsRead(userId = 'usr_admin') {
    if (!this.db.data.notifications) this.db.data.notifications = [];
    let updated = false;
    this.db.data.notifications.forEach((n: any) => {
      if (!n.read && (userId === 'usr_admin' || n.userId === userId)) {
        n.read = true;
        updated = true;
      }
    });
    if (updated) {
      this.db.scheduleSave();
      this.db.notifyNotificationListeners('notifications:updated', this.getNotifications());
      this.db.postgresRepo.markAllNotificationsRead(userId === 'usr_admin' ? undefined : userId).catch(() => {});
    }
  }

  public getDashboard(userId: string): DashboardLayout {
    if (!this.db.data.dashboards) this.db.data.dashboards = [];
    const userDash = this.db.data.dashboards.find((d: any) => d.userId === userId);
    if (userDash) return userDash;

    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    const title = user ? `${user.companyName || user.name} Özel Dashboard` : 'Sistem Dashboard';

    const newDash: DashboardLayout = {
      id: `dash_${userId}`,
      userId,
      title,
      widgets: [...defaultWidgets],
      updatedAt: new Date().toISOString(),
    };
    this.db.data.dashboards.push(newDash);
    this.db.scheduleSave();
    this.db.postgresRepo.saveDashboard(newDash).catch(() => {});
    return newDash;
  }

  public saveDashboardWidgets(userId: string, widgets: WidgetConfig[], title?: string): DashboardLayout {
    if (!this.db.data.dashboards) this.db.data.dashboards = [];
    let userDash = this.db.data.dashboards.find((d: any) => d.userId === userId);
    if (!userDash) {
      userDash = this.getDashboard(userId);
    }
    userDash.widgets = widgets;
    if (title) userDash.title = title;
    userDash.updatedAt = new Date().toISOString();
    this.db.scheduleSave();
    this.db.postgresRepo.saveDashboard(userDash).catch(() => {});
    return userDash;
  }

  public resetDashboard(userId: string): DashboardLayout {
    const user = (this.db.data.users || []).find((u: any) => u.id === userId);
    const title = user ? `${user.companyName || user.name} Özel Dashboard` : 'Varsayılan Sistem Dashboard';
    return this.saveDashboardWidgets(userId, defaultWidgets, title);
  }
}
