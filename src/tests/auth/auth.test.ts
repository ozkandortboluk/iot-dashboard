import { describe, it, expect } from 'vitest';
import { hasPermission, canAccessTab } from '../../lib/permissions';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface TestUser {
  id: string;
  email: string;
  role: UserRole;
  assignedDeviceIds: string[];
}

export function canAccessDevice(user: TestUser, deviceId: string): boolean {
  if (user.role === 'admin') {
    return true; // Admin has universal access
  }
  return user.assignedDeviceIds.includes(deviceId);
}

export function canModifyDeviceSettings(user: TestUser): boolean {
  return user.role === 'admin' || user.role === 'operator';
}

export function canManageUsers(user: TestUser): boolean {
  return user.role === 'admin';
}

export function canAcknowledgeAlarms(user: TestUser): boolean {
  return user.role === 'admin' || user.role === 'operator';
}

describe('Role-Based Access Control & Authorization Test Suite', () => {
  const adminUser: TestUser = {
    id: 'usr-admin',
    email: 'admin@iot.local',
    role: 'admin',
    assignedDeviceIds: [],
  };

  const operatorUser: TestUser = {
    id: 'usr-operator',
    email: 'operator@iot.local',
    role: 'operator',
    assignedDeviceIds: ['dev-motor-01', 'dev-pump-02'],
  };

  const viewerUser: TestUser = {
    id: 'usr-viewer',
    email: 'viewer@iot.local',
    role: 'viewer',
    assignedDeviceIds: ['dev-motor-01'],
  };

  describe('Device Access Permissions', () => {
    it('Admin should have access to any device regardless of assignment list', () => {
      expect(canAccessDevice(adminUser, 'dev-random-999')).toBe(true);
    });

    it('Operator and Viewer should only access devices explicitly assigned to them', () => {
      expect(canAccessDevice(operatorUser, 'dev-motor-01')).toBe(true);
      expect(canAccessDevice(operatorUser, 'dev-unauthorized-09')).toBe(false);

      expect(canAccessDevice(viewerUser, 'dev-motor-01')).toBe(true);
      expect(canAccessDevice(viewerUser, 'dev-pump-02')).toBe(false);
    });
  });

  describe('Privilege Elevation & Management Permissions', () => {
    it('Only Admin can manage users and system configuration', () => {
      expect(canManageUsers(adminUser)).toBe(true);
      expect(canManageUsers(operatorUser)).toBe(false);
      expect(canManageUsers(viewerUser)).toBe(false);
    });

    it('Admin and Operator can adjust device parameters and acknowledge alarms', () => {
      expect(canModifyDeviceSettings(adminUser)).toBe(true);
      expect(canModifyDeviceSettings(operatorUser)).toBe(true);
      expect(canModifyDeviceSettings(viewerUser)).toBe(false);

      expect(canAcknowledgeAlarms(adminUser)).toBe(true);
      expect(canAcknowledgeAlarms(operatorUser)).toBe(true);
      expect(canAcknowledgeAlarms(viewerUser)).toBe(false);
    });
  });

  describe('Centralized Permissions Matrix (src/lib/permissions.ts)', () => {
    it('Customer creation and deletion is strictly Admin only', () => {
      expect(hasPermission('admin', 'manage_customers')).toBe(true);
      expect(hasPermission('operator', 'manage_customers')).toBe(false);
      expect(hasPermission('analyst', 'manage_customers')).toBe(false);
      expect(hasPermission('customer', 'manage_customers')).toBe(false);
    });

    it('Database management is strictly Admin only', () => {
      expect(hasPermission('admin', 'manage_database')).toBe(true);
      expect(hasPermission('operator', 'manage_database')).toBe(false);
      expect(hasPermission('analyst', 'manage_database')).toBe(false);
      expect(hasPermission('customer', 'manage_database')).toBe(false);
    });

    it('Device Assignment is Admin and limited Operator', () => {
      expect(hasPermission('admin', 'assign_devices')).toBe(true);
      expect(hasPermission('operator', 'assign_devices')).toBe(true);
      expect(hasPermission('analyst', 'assign_devices')).toBe(false);
      expect(hasPermission('customer', 'assign_devices')).toBe(false);
    });

    it('Device Control permissions check', () => {
      expect(hasPermission('admin', 'control_devices')).toBe(true);
      expect(hasPermission('operator', 'control_devices')).toBe(true);
      expect(hasPermission('analyst', 'control_devices')).toBe(false);
      expect(hasPermission('customer', 'control_devices', { isDeviceAllowed: false })).toBe(false);
      expect(hasPermission('customer', 'control_devices', { isDeviceAllowed: true })).toBe(true);
    });

    it('Report Viewing permissions check', () => {
      expect(hasPermission('admin', 'view_reports')).toBe(true);
      expect(hasPermission('operator', 'view_reports')).toBe(true);
      expect(hasPermission('analyst', 'view_reports')).toBe(true);
      expect(hasPermission('customer', 'view_reports', { isOwner: false })).toBe(false);
      expect(hasPermission('customer', 'view_reports', { isOwner: true })).toBe(true);
    });

    it('OTA Management permissions check', () => {
      expect(hasPermission('admin', 'manage_ota')).toBe(true);
      expect(hasPermission('operator', 'manage_ota')).toBe(true);
      expect(hasPermission('analyst', 'manage_ota')).toBe(false);
      expect(hasPermission('customer', 'manage_ota')).toBe(false);
    });

    it('Tab navigation access check for Operator, Analyst, Customer, and Admin', () => {
      // Operator should NOT access customer management or database tabs
      expect(canAccessTab('operator', 'customers')).toBe(false);
      expect(canAccessTab('operator', 'database_data')).toBe(false);
      expect(canAccessTab('operator', 'security')).toBe(false);
      expect(canAccessTab('operator', 'deployment')).toBe(false);
      expect(canAccessTab('operator', 'generator')).toBe(false);
      expect(canAccessTab('operator', 'devices')).toBe(true);
      expect(canAccessTab('operator', 'analytics')).toBe(true);

      // Analyst should NOT access customer management, OTA or database tabs
      expect(canAccessTab('analyst', 'customers')).toBe(false);
      expect(canAccessTab('analyst', 'firmware_ota')).toBe(false);
      expect(canAccessTab('analyst', 'database_data')).toBe(false);
      expect(canAccessTab('analyst', 'analytics')).toBe(true);

      // Admin has universal tab access
      expect(canAccessTab('admin', 'customers')).toBe(true);
      expect(canAccessTab('admin', 'database_data')).toBe(true);
      expect(canAccessTab('admin', 'security')).toBe(true);
      expect(canAccessTab('admin', 'deployment')).toBe(true);
      expect(canAccessTab('admin', 'generator')).toBe(true);
    });
  });
});
