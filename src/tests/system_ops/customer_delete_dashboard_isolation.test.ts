import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../server/db.js';
import type { DashboardLayout } from '../../types.js';

describe('Customer Deletion & Dashboard Isolation Integrity', () => {
  const testCustomerId = 'usr_delete_test_999';
  const testCustomerEmail = 'deletetest@example.com';

  beforeEach(async () => {
    // Ensure clean state
    if (!db.data.users) db.data.users = [];
    if (!db.data.dashboards) db.data.dashboards = [];
    if (!db.data.devices) db.data.devices = [];

    // Ensure admin dashboard exists with customized title
    let adminDash = db.data.dashboards.find((d: any) => d.id === 'dash_usr_admin');
    if (!adminDash) {
      adminDash = {
        id: 'dash_usr_admin',
        tenantId: 'usr_admin',
        title: 'Özel Merkez Yönetim Paneli',
        widgets: [
          { id: 'w1', type: 'devices_status', title: 'Özel Durum', span: 2, colorScheme: '#6366f1' }
        ],
        updatedAt: new Date().toISOString(),
      };
      db.data.dashboards.push(adminDash);
    } else {
      adminDash.title = 'Özel Merkez Yönetim Paneli';
    }
  });

  it('preserves admin dashboard when a customer is deleted', async () => {
    // 1. Create a customer
    const user = {
      id: testCustomerId,
      name: 'Silinecek Müşteri',
      email: testCustomerEmail,
      role: 'customer' as const,
      status: 'active' as const,
      created_at: new Date().toISOString()
    };
    db.data.users.push(user);

    // 2. Create customer dashboard
    const customerDash: DashboardLayout = {
      id: `dash_${testCustomerId}`,
      tenantId: testCustomerId,
      title: 'Silinecek Müşteri Paneli',
      widgets: [
        { id: 'w_cust_1', type: 'quick_access', title: 'Müşteri Aksiyon', span: 2, colorScheme: '#6366f1' }
      ],
      updatedAt: new Date().toISOString()
    };
    db.data.dashboards.push(customerDash);

    // 3. Add customer device
    const device = {
      id: 'dev_cust_test_99',
      tenantId: testCustomerId,
      userId: testCustomerId,
      name: 'Müşteri Sayacı',
      type: 'power_meter',
      status: 'online' as const,
      metrics: { voltage: 230 }
    };
    db.data.devices.push(device as any);

    expect(db.data.users.some((u: any) => u.id === testCustomerId)).toBe(true);
    expect(db.data.dashboards.some((d: any) => d.id === `dash_${testCustomerId}`)).toBe(true);

    // 4. Delete customer
    await db.userRepository.deleteUser(testCustomerId, 'usr_admin', 'Admin');

    // 5. Assertions:
    // Customer must be removed from users
    expect(db.data.users.some((u: any) => u.id === testCustomerId)).toBe(false);

    // Customer dashboard must NOT remain in dashboards
    expect(db.data.dashboards.some((d: any) => d.id === `dash_${testCustomerId}`)).toBe(false);
    expect(db.data.dashboards.some((d: any) => d.tenantId === testCustomerId)).toBe(false);

    // Admin dashboard must be intact and NOT overwritten
    const adminDashboard = await db.getDashboard('usr_admin');
    expect(adminDashboard).toBeDefined();
    expect(adminDashboard.id).toBe('dash_usr_admin');
    expect(adminDashboard.tenantId).toBe('usr_admin');
    expect(adminDashboard.title).toBe('Özel Merkez Yönetim Paneli');

    // Devices must be transferred to usr_admin without data loss
    const dev = db.data.devices.find((d: any) => d.id === 'dev_cust_test_99');
    expect(dev).toBeDefined();
    expect(dev?.tenantId).toBe('usr_admin');
    expect(dev?.location).toContain('Eski Müşteri: Silinecek Müşteri');
  });

  it('handles advancedDeleteUser with deleteDashboards: true cleanly', async () => {
    const advCustomerId = 'usr_adv_delete_888';
    db.data.users.push({
      id: advCustomerId,
      name: 'Gelişmiş Silinecek',
      email: 'adv@test.com',
      role: 'customer',
      status: 'active',
      created_at: new Date().toISOString()
    });

    db.data.dashboards.push({
      id: `dash_${advCustomerId}`,
      tenantId: advCustomerId,
      title: 'Gelişmiş Panel',
      widgets: [],
      updatedAt: new Date().toISOString()
    });

    await db.userRepository.advancedDeleteUser(advCustomerId, 'usr_admin', 'Admin', {
      deleteDevices: false,
      deleteDashboards: true,
      deleteAlarms: true,
      deleteTelemetry: true
    });

    expect(db.data.users.some((u: any) => u.id === advCustomerId)).toBe(false);
    expect(db.data.dashboards.some((d: any) => d.id === `dash_${advCustomerId}`)).toBe(false);

    // Admin dashboard still unchanged
    const adminDashboard = await db.getDashboard('usr_admin');
    expect(adminDashboard.id).toBe('dash_usr_admin');
    expect(adminDashboard.tenantId).toBe('usr_admin');
  });
});
