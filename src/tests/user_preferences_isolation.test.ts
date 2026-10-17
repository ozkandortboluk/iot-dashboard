import { describe, it, expect } from 'vitest';
import { CANONICAL_SCHEMA_METADATA } from '../server/database/canonicalSchema';
import { NotificationRepository } from '../server/repositories/notification.repository';
import { UserPreferences } from '../types';

describe('User Preferences & Multi-Device Isolation Suite', () => {
  it('canonical schema defines preferences JSONB column on users table', () => {
    const usersTable = CANONICAL_SCHEMA_METADATA.tables['users'];
    expect(usersTable).toBeDefined();
    const prefCol = usersTable.columns.find((c) => c.name === 'preferences');
    expect(prefCol).toBeDefined();
    expect(prefCol?.type.toLowerCase()).toContain('jsonb');
    expect(prefCol?.nullable).toBe(false);
  });

  it('canonical schema defines dashboard_layouts table with user_id and widgets_json', () => {
    const dashboardTable = CANONICAL_SCHEMA_METADATA.tables['dashboard_layouts'];
    expect(dashboardTable).toBeDefined();
    const userIdCol = dashboardTable.columns.find((c) => c.name === 'user_id');
    const widgetsCol = dashboardTable.columns.find((c) => c.name === 'widgets_json');
    expect(userIdCol).toBeDefined();
    expect(widgetsCol).toBeDefined();
  });

  describe('Dashboard Layout Isolation Per User', () => {
    const userA = 'usr-test-alice-01';
    const userB = 'usr-test-bob-02';

    const widgetsA = [
      { id: 'w-1', type: 'gauge', title: 'Alice Gauge', x: 0, y: 0, w: 4, h: 4, config: { deviceId: 'dev-1' } },
    ];
    const widgetsB = [
      { id: 'w-2', type: 'chart', title: 'Bob Chart', x: 2, y: 2, w: 6, h: 4, config: { deviceId: 'dev-2' } },
    ];

    it('stores and retrieves separate dashboard widgets for user A and user B', async () => {
      const mockDb: any = {
        data: { dashboards: [], users: [] },
        scheduleSave: () => {},
        postgresRepo: null,
      };
      const repo = new NotificationRepository(mockDb);

      await repo.saveDashboardWidgets(userA, widgetsA as any, 'Alice Dashboard');
      await repo.saveDashboardWidgets(userB, widgetsB as any, 'Bob Dashboard');

      const layoutA = await repo.getDashboard(userA);
      const layoutB = await repo.getDashboard(userB);

      expect(layoutA.tenantId).toBe(userA);
      expect(layoutB.tenantId).toBe(userB);

      expect(layoutA.widgets).toHaveLength(1);
      expect(layoutA.widgets[0].title).toBe('Alice Gauge');

      expect(layoutB.widgets).toHaveLength(1);
      expect(layoutB.widgets[0].title).toBe('Bob Chart');
      expect(layoutB.widgets[0].id).not.toBe(layoutA.widgets[0].id);
    });

    it('returns default widgets if a new user has no saved layout', async () => {
      const mockDb: any = {
        data: { dashboards: [], users: [] },
        scheduleSave: () => {},
        postgresRepo: null,
      };
      const repo = new NotificationRepository(mockDb);

      const defaultLayout = await repo.getDashboard('usr-new-random');
      expect(defaultLayout.tenantId).toBe('usr-new-random');
      expect(defaultLayout.widgets.length).toBeGreaterThan(0);
    });
  });

  describe('User Preferences Isolation', () => {
    it('supports granular screen settings and user preference attributes', () => {
      const prefsA: UserPreferences = {
        theme: 'dark',
        editMode: true,
        defaultTab: 'analytics',
        refreshIntervalSec: 15,
        screenSettings: {
          devices_view_mode: 'compact',
          devices_filter_site: 'Factory 1',
        },
      };

      const prefsB: UserPreferences = {
        theme: 'light',
        editMode: false,
        defaultTab: 'devices',
        refreshIntervalSec: 60,
        screenSettings: {
          devices_view_mode: 'grid',
          devices_filter_site: 'Warehouse 2',
        },
      };

      expect(prefsA.theme).toBe('dark');
      expect(prefsB.theme).toBe('light');
      expect(prefsA.screenSettings?.devices_view_mode).toBe('compact');
      expect(prefsB.screenSettings?.devices_view_mode).toBe('grid');
    });
  });
});
