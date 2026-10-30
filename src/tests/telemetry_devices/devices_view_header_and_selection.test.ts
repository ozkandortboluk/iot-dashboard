import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('DevicesView Header, Navigation and Dynamic Selection Action Suite', () => {
  const devicesViewPath = path.resolve(process.cwd(), 'src/components/DevicesView.tsx');
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const sidebarPath = path.resolve(process.cwd(), 'src/components/Sidebar.tsx');
  const customerMgmtPath = path.resolve(process.cwd(), 'src/components/CustomerManagement.tsx');
  const deviceHealthPath = path.resolve(process.cwd(), 'src/components/DeviceHealthView.tsx');

  it('1. DevicesView.tsx exists and is readable', () => {
    expect(fs.existsSync(devicesViewPath)).toBe(true);
  });

  it('2. DevicesView.tsx contains the standard system header matching dashboard conventions', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Standard header container
    expect(content).toContain('bg-white dark:bg-slate-900/80 backdrop-blur-md');
    expect(content).toContain('text-lg sm:text-xl font-bold');
    expect(content).toContain('Tüm Saha Cihazları');
    expect(content).toContain('Cihazlarım & Sensör Verileri');
    expect(content).toContain('Endüstriyel Saha Filosu');
  });

  it('3. DevicesView.tsx has "Sanal Veri Üreteci", "Cihaz Sağlığı & Bakım" and "Otomasyon & Senaryolar" buttons in the right corner', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Right corner buttons
    expect(content).toContain('Sanal Veri Üreteci');
    expect(content).toContain('Cihaz Sağlığı & Bakım');
    expect(content).toContain('Otomasyon & Senaryolar');
    expect(content).toContain('handleGoToGenerator');
    expect(content).toContain('handleGoToHealth');
    expect(content).toContain('handleGoToAutomations');
    expect(content).toContain('isAdmin &&');
  });

  it('4. DevicesView.tsx dynamically transforms "Yeni Cihaz Ekle" into "Seçilenleri Sil (X)" when checkbox is checked', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Dynamic button transformation condition
    expect(content).toContain('selectedDeviceIds.size > 0 ?');
    expect(content).toContain('Seçilenleri Sil ({selectedDeviceIds.size})');
    expect(content).toContain('Yeni');
    expect(content).toContain('Cihaz');
    expect(content).toContain('Ekle');
  });

  it('5. DevicesView.tsx no longer renders the redundant selection banner ("cihaz seçildi" bar)', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Old selection bar has been removed
    expect(content).not.toContain('cihaz seçildi.');
    expect(content).not.toContain('Tüm Filtrelenenleri Seç');
  });

  it('6. App.tsx passes navigation handlers (health, automations and generator) to DevicesView', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');

    expect(appContent).toContain("onNavigateToHealth={() => setActiveTab('device_health')}");
    expect(appContent).toContain("onNavigateToAutomations={() => setActiveTab('automations')}");
    expect(appContent).toContain("onNavigateToGenerator={() => setActiveTab('generator')}");
  });

  it('7. DevicesView prevents layout shift on selection by maintaining persistent border-l-4', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Verify border-l-4 is persistent and border-l-transparent is used when unselected
    expect(content).toContain('border-l-4');
    expect(content).toContain("isSelected");
    expect(content).toContain("border-l-indigo-500");
    expect(content).toContain("border-l-transparent");
  });

  it('8. Sidebar has removed "generator" from the sidebar menu groups', () => {
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    expect(sidebarContent).not.toContain("id: 'generator'");
  });

  it('9. CustomerManagement and DeviceHealthView also eliminate layout shift with persistent borders', () => {
    const custContent = fs.readFileSync(customerMgmtPath, 'utf-8');
    const healthContent = fs.readFileSync(deviceHealthPath, 'utf-8');

    expect(custContent).toContain('border-l-2');
    expect(custContent).toContain('border-l-indigo-500');
    expect(custContent).toContain('border-l-transparent');

    expect(healthContent).toContain('border-l-4');
    expect(healthContent).toContain('border-l-amber-500');
    expect(healthContent).toContain('border-l-transparent');
  });
});
