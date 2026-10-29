import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('DevicesView Header, Navigation and Dynamic Selection Action Suite', () => {
  const devicesViewPath = path.resolve(process.cwd(), 'src/components/DevicesView.tsx');
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');

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

  it('3. DevicesView.tsx has "Cihaz Sağlığı & Bakım" and "Otomasyon & Senaryolar" buttons in the right corner', () => {
    const content = fs.readFileSync(devicesViewPath, 'utf-8');

    // Right corner buttons
    expect(content).toContain('Cihaz Sağlığı & Bakım');
    expect(content).toContain('Otomasyon & Senaryolar');
    expect(content).toContain('handleGoToHealth');
    expect(content).toContain('handleGoToAutomations');
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

  it('6. App.tsx passes navigation handlers (health and automations) to DevicesView', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');

    expect(appContent).toContain("onNavigateToHealth={() => setActiveTab('device_health')}");
    expect(appContent).toContain("onNavigateToAutomations={() => setActiveTab('automations')}");
  });
});

