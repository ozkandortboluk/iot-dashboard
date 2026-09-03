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

  /**
   * Cihaz sahipliğini ve kanonik tenant_id değerini doğrular.
   * - Kural 1: Müşteriler başka müşterilere ait cihaz oluşturamaz, değiştiremez veya devredemez.
   * - Boş veya geçersiz tenantId'leri kanonik olarak 'usr_admin'e yönlendirir.
   * - Hedef kiracının sistemde kayıtlı olduğunu teyit eder.
   */
  public validateAndResolveDeviceOwnership(
    targetTenantId: string | undefined | null,
    requestingUser?: { id: string; role?: string } | null,
    existingUsers: { id: string }[] = []
  ): { canonicalTenantId: string; error?: string } {
    const rawTenant = (targetTenantId || '').trim();

    // 1. Yetkisiz müşteri kontrolü (Kural 1)
    if (requestingUser && requestingUser.role !== 'admin' && requestingUser.id !== 'usr_admin') {
      // Normal müşteri yalnızca kendi adına cihaz oluşturabilir veya yönetebilir
      return { canonicalTenantId: requestingUser.id };
    }

    // 2. Yönetici isteği: Belirtilen kiracının geçerliliği
    if (!rawTenant || rawTenant === 'usr_admin' || rawTenant === 'admin') {
      return { canonicalTenantId: 'usr_admin' };
    }

    const exists = existingUsers.some((u) => u.id === rawTenant);
    if (!exists) {
      return {
        canonicalTenantId: 'usr_admin',
        error: `Belirtilen müşteri/kiracı kimliği (${rawTenant}) sistemde bulunamadı. Cihaz kanonik olarak Sistem Yöneticisine devredildi.`
      };
    }

    return { canonicalTenantId: rawTenant };
  }
}

export const tenantSecurityService = new TenantSecurityService();
