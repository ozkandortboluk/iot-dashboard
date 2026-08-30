import type { Role } from '../types';

export type PermissionAction =
  | 'manage_customers'      // Müşteri oluşturma/düzenleme/silme (Sadece Admin)
  | 'assign_devices'       // Cihaz atama (Admin: Tam, Operatör: Sınırlı, Analist: Hayır, Müşteri: Hayır)
  | 'control_devices'      // Cihaz kontrolü / Röle-Komut tetikleme (Admin: Evet, Operatör: Evet, Analist: Hayır, Müşteri: İzinliyse)
  | 'view_reports'         // Rapor görüntüleme & Analiz (Admin: Evet, Operatör: Evet, Analist: Evet, Müşteri: Kendi Verisi)
  | 'manage_ota'           // OTA Firmware yönetimi & Dağıtım (Admin: Evet, Operatör: İzinliyse, Analist: Hayır, Müşteri: Hayır)
  | 'manage_database'      // Veritabanı yönetimi (Sadece Admin)
  | 'manage_security'      // Güvenlik & Audit logları (Sadece Admin)
  | 'manage_deployment'    // Sunucu & DB Kurulum rehberi (Sadece Admin)
  | 'manage_simulation'    // Sanal veri & telemetri üreteci (Sadece Admin - Kural 1)
  | 'view_devices'         // Cihaz izleme & sensör verileri (Admin: Tümü, Operatör: Tümü, Analist: Tümü, Müşteri: Kendi Cihazları)
  | 'create_devices'       // Cihaz ekleme/düzenleme (Admin: Tam, Operatör: Sınırlı, Analist: Hayır, Müşteri: Hayır)
  | 'view_notifications'   // Bildirimler (Tüm roller)
  | 'view_discovery'       // Ağ tarayıcısı & Keşif (Admin: Evet, Operatör: Evet, Analist: İzleme, Müşteri: Evet)
  | 'manage_account';      // Hesap ayarları (Tüm roller)

export interface PermissionDetail {
  action: PermissionAction;
  label: string;
  description: string;
  admin: boolean | string;
  operator: boolean | string;
  analyst: boolean | string;
  customer: boolean | string;
}

export const PERMISSION_MATRIX: PermissionDetail[] = [
  {
    action: 'manage_customers',
    label: 'Müşteri oluşturma/silme',
    description: 'Müşteri hesapları oluşturma, güncelleme ve silme işlemleri',
    admin: true,
    operator: false,
    analyst: false,
    customer: false,
  },
  {
    action: 'assign_devices',
    label: 'Cihaz atama',
    description: 'Cihazların müşterilere veya lokasyonlara zimmetlenmesi / atanması',
    admin: true,
    operator: 'Sınırlı',
    analyst: false,
    customer: false,
  },
  {
    action: 'control_devices',
    label: 'Cihaz kontrolü',
    description: 'Röle, PWM ve uzaktan komut çalıştırma',
    admin: true,
    operator: true,
    analyst: false,
    customer: 'İzinliyse',
  },
  {
    action: 'view_reports',
    label: 'Rapor görüntüleme',
    description: 'Analitik metrikler, telemetri grafikleri ve veri export',
    admin: true,
    operator: true,
    analyst: true,
    customer: 'Kendi verisi',
  },
  {
    action: 'manage_ota',
    label: 'OTA yönetimi',
    description: 'Firmware binary yükleme ve uzaktan güncelleme tetikleme',
    admin: true,
    operator: 'İzinliyse',
    analyst: false,
    customer: false,
  },
  {
    action: 'manage_database',
    label: 'Veritabanı yönetimi',
    description: 'PostgreSQL & TimescaleDB şemaları, ham SQL ve tablo bakımı',
    admin: true,
    operator: false,
    analyst: false,
    customer: false,
  },
  {
    action: 'manage_security',
    label: 'Güvenlik & Audit Logları',
    description: 'Sistem güvenlik logları, IP beyaz listesi ve denetim kayıtları',
    admin: true,
    operator: false,
    analyst: false,
    customer: false,
  },
  {
    action: 'manage_deployment',
    label: 'Sunucu & DB Kurulum Rehberi',
    description: 'Docker, Nginx ve sistem altyapı dağıtım kılavuzu',
    admin: true,
    operator: false,
    analyst: false,
    customer: false,
  },
  {
    action: 'manage_simulation',
    label: 'Sanal Veri & Telemetri Üreteci',
    description: 'Sanal cihazlar ve sentetik telemetri test laboratuvarı (Kural 1: Sadece Yönetici)',
    admin: true,
    operator: false,
    analyst: false,
    customer: false,
  },
];

// Helper functions for evaluating permissions
export function hasPermission(
  role: Role | undefined | null,
  action: PermissionAction,
  options?: { isOwner?: boolean; isDeviceAllowed?: boolean; hasOtaGrant?: boolean }
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;

  switch (action) {
    case 'manage_customers':
    case 'manage_database':
    case 'manage_security':
    case 'manage_deployment':
    case 'manage_simulation':
      return false; // Strictly Admin only

    case 'assign_devices':
      return role === 'operator'; // Operator has limited device assignment

    case 'create_devices':
      return role === 'operator'; // Operator can register physical devices

    case 'control_devices':
      if (role === 'operator') return true;
      if (role === 'customer') return !!options?.isDeviceAllowed;
      return false; // Analyst cannot control devices

    case 'view_reports':
      if (role === 'operator' || role === 'analyst') return true;
      if (role === 'customer') return !!options?.isOwner;
      return false;

    case 'manage_ota':
      if (role === 'operator') return options?.hasOtaGrant !== false;
      return false; // Analyst and Customer cannot manage OTA

    case 'view_devices':
      return true; // All roles can view devices (customers filtered to own devices)

    case 'view_discovery':
      return true; // All roles can view discovery

    case 'view_notifications':
    case 'manage_account':
      return true;

    default:
      return false;
  }
}

// Allowed Navigation Tabs per Role
export const ROLE_ALLOWED_TABS: Record<Role, string[]> = {
  admin: [
    'dashboard',
    'devices',
    'device_health',
    'customers',
    'firmware_ota',
    'network_discovery',
    'generator',
    'analytics',
    'notifications',
    'database_data',
    'security',
    'deployment',
    'account_settings',
    'help',
  ],
  operator: [
    'dashboard',
    'devices',
    'device_health',
    'firmware_ota',
    'network_discovery',
    'analytics',
    'notifications',
    'account_settings',
    'help',
  ],
  analyst: [
    'dashboard',
    'devices',
    'device_health',
    'network_discovery',
    'analytics',
    'notifications',
    'account_settings',
    'help',
  ],
  customer: [
    'dashboard',
    'devices',
    'device_health',
    'network_discovery',
    'notifications',
    'account_settings',
    'help',
  ],
};

export function canAccessTab(role: Role | undefined | null, tab: string): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  const allowed = ROLE_ALLOWED_TABS[role];
  return allowed ? allowed.includes(tab) : false;
}

export function getRoleBadgeInfo(role: Role | undefined | null): {
  label: string;
  colorClass: string;
  badgeClass: string;
} {
  switch (role) {
    case 'admin':
      return {
        label: 'Sistem Yöneticisi (Admin)',
        colorClass: 'text-indigo-600 dark:text-indigo-400',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
      };
    case 'operator':
      return {
        label: 'Saha Operatörü',
        colorClass: 'text-amber-600 dark:text-amber-400',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
      };
    case 'analyst':
      return {
        label: 'Veri Analisti',
        colorClass: 'text-sky-600 dark:text-sky-400',
        badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20',
      };
    case 'customer':
      return {
        label: 'Müşteri Portalı',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
      };
    default:
      return {
        label: 'Kullanıcı',
        colorClass: 'text-slate-600 dark:text-slate-400',
        badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20',
      };
  }
}
