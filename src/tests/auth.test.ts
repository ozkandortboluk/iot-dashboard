import { describe, it, expect } from 'vitest';

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
});
