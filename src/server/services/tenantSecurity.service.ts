import type { Device } from '../../types.js';

export class TenantSecurityService {
  /**
   * Kural 1: Müşteriler diğer müşterilerin verilerine ve cihazlarına erişemezler,
   * verilerini okuyamazlar ya da değiştiremezler. Sadece yönetici tüm müşteri cihazlarına
   * ve verilerine ulaşabilir.
   */
  public canUserAccessDevice(
    user: { id: string; role?: string } | undefined | null,
    dev: Device | undefined | null,
    tenantMemberships: any[] = []
  ): boolean {
    if (!user || !dev) return false;

    // 1. Sistem yöneticisi (admin) tüm müşteri cihazlarına ve verilerine tam erişim yetkisine sahiptir
    if (user.role === 'admin' || user.id === 'usr_admin' || user.id === 'admin') {
      return true;
    }

    // 2. Cihazın doğrudan sahibi kontrolü (tenantId, customerId veya userId)
    if (dev.tenantId && (dev.tenantId === user.id || dev.tenantId === (user as any).tenantId)) {
      return true;
    }
    if ((dev as any).customerId && (dev as any).customerId === user.id) {
      return true;
    }
    if ((dev as any).userId && (dev as any).userId === user.id) {
      return true;
    }

    // 3. Çoklu üyelik / Tenant Memberships kontrolü
    if (Array.isArray(tenantMemberships) && dev.tenantId) {
      const isMember = tenantMemberships.some(
        (m: any) =>
          (m.userId === user.id || m.memberId === user.id) &&
          m.tenantId === dev.tenantId
      );
      if (isMember) return true;
    }

    // Diğer tüm durumlarda erişim KESİNLİKLE ENGELLENİR
    return false;
  }

  /**
   * Cihaz listesini kullanıcının yetkisine göre filtreler.
   */
  public filterDevicesForUser(
    user: { id: string; role?: string } | undefined | null,
    devices: Device[],
    tenantMemberships: any[] = []
  ): Device[] {
    if (!user) return [];
    if (user.role === 'admin' || user.id === 'usr_admin' || user.id === 'admin') {
      return devices;
    }
    return devices.filter((dev) => this.canUserAccessDevice(user, dev, tenantMemberships));
  }

  /**
   * Kural 1: Sanal cihaz ve veri işleme işi SADECE YÖNETİCİYE aittir.
   * Müşteriler sanal simülatör cihazı oluşturamaz, çalıştıramaz veya düzenleyemez.
   */
  public isSimulatorAllowed(user: { id: string; role?: string } | undefined | null): boolean {
    return Boolean(user && (user.role === 'admin' || user.id === 'usr_admin' || user.id === 'admin'));
  }

  public canUserPerformSimulation(user: { id: string; role?: string } | undefined | null): boolean {
    return this.isSimulatorAllowed(user);
  }

  public filterAccessibleDevices(
    user: { id: string; role?: string } | undefined | null,
    devices: Device[],
    tenantMemberships: any[] = []
  ): Device[] {
    return this.filterDevicesForUser(user, devices, tenantMemberships);
  }
}

export const tenantSecurityService = new TenantSecurityService();
