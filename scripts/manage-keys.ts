#!/usr/bin/env tsx
import { systemKeysService } from '../src/server/services/systemKeys.service.js';
import dotenv from 'dotenv';
dotenv.config();

function run() {
  const args = process.argv.slice(2);
  const shouldGenerate = args.includes('--generate') || args.includes('-g') || args.includes('generate');

  console.log('\n==============================================================================');
  console.log('  NexusNode IoT — Sistem Güvenlik Anahtarları Yönetim Konsolu (VPS CLI)');
  console.log('==============================================================================\n');

  if (shouldGenerate) {
    console.log('[+] Eksik anahtarlar taranıyor ve güvenle üretiliyor (Mevcut anahtarlar korunur)...');
    const genResult = systemKeysService.generateMissingKeys();
    if (genResult.preservedKeys.jwtSecret) {
      console.log('  ℹ️  JWT_SECRET zaten mevcut (Korundu).');
    } else if (genResult.newlyGenerated.jwtSecret) {
      console.log('  ✨ Yeni JWT_SECRET üretildi.');
    }

    if (genResult.preservedKeys.encryptionKey) {
      console.log('  ℹ️  ENCRYPTION_KEY zaten mevcut (Korundu).');
    } else if (genResult.newlyGenerated.encryptionKey) {
      console.log('  ✨ Yeni ENCRYPTION_KEY üretildi.');
    }

    if (genResult.preservedKeys.otaSigningKey) {
      console.log('  ℹ️  OTA_SIGNING_KEY zaten mevcut (Korundu).');
    } else if (genResult.newlyGenerated.otaSigningKey) {
      console.log('  ✨ Yeni Ed25519 OTA imzalama anahtarı üretildi.');
    }
    console.log('\n');
  }

  const details = systemKeysService.getFullExportDetails();
  const statuses = systemKeysService.getKeyStatuses();

  console.log('--- AKTİF SİSTEM ANAHTARLARI DURUMU ---');
  console.log(`1. JWT_SECRET / SESSION_SECRET:`);
  console.log(`   - Durum:   ${details.jwtSecret.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:  ${details.jwtSecret.source}`);
  if (details.jwtSecret.value) {
    console.log(`   - Değer:   ${details.jwtSecret.value}`);
  }

  console.log(`\n2. ENCRYPTION_KEY (Vault Kasa Şifreleme):`);
  console.log(`   - Durum:   ${details.encryptionKey.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:  ${details.encryptionKey.source}`);
  if (details.encryptionKey.value) {
    console.log(`   - Değer:   ${details.encryptionKey.value}`);
  }

  console.log(`\n3. OTA_SIGNING_KEY (Firmware İmzası):`);
  console.log(`   - Durum:   ${details.otaSigningKey.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:  ${details.otaSigningKey.source}`);

  console.log('\n------------------------------------------------------------------------------');
  console.log('  .ENV FORMATINDA KOPYALANABİLİR BLOK:');
  console.log('------------------------------------------------------------------------------');
  console.log(details.envSnippet);
  console.log('------------------------------------------------------------------------------\n');

  if (!statuses.allConfigured) {
    console.log('⚠️  DİKKAT: Bazı kritik anahtarlar eksik! Otomatik üretmek için şu komutu çalıştırın:');
    console.log('   npm run show-keys -- --generate\n');
  } else {
    console.log('✅ Tüm kritik üretim güvenlik anahtarları hazır ve güvendedir.\n');
  }
}

run();
