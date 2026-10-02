#!/usr/bin/env tsx
import { systemKeysService } from '../src/server/services/systemKeys.service.js';
import { systemSecretsService } from '../src/server/services/systemSecrets.service.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const args = process.argv.slice(2);
  const shouldGenerate = args.includes('--generate') || args.includes('-g') || args.includes('generate');

  console.log('\n==============================================================================');
  console.log('  NexusNode IoT — Sistem Güvenlik Anahtarları Yönetim Konsolu (VPS CLI)');
  console.log('==============================================================================\n');

  // 1. Automatically migrate and preserve any existing production keys into Central Security Vault
  try {
    const migration = await systemSecretsService.migrateLegacySecrets();
    if (migration.migratedCount > 0) {
      console.log(`[+] Mevcut üretim anahtarları tespit edildi ve Vault kasasına aktarılarak korundu (${migration.keys.join(', ')}).\n`);
    }
  } catch {}

  if (shouldGenerate) {
    console.log('[+] Eksik anahtarlar taranıyor ve güvenle üretiliyor (Mevcut anahtarlar korunur)...');
    const genResult = await systemKeysService.generateMissingKeys();
    if (genResult.preservedKeys.jwtSecret) {
      console.log('  ℹ️  JWT_SECRET zaten mevcut (Korundu).');
    } else if (genResult.generatedItems.jwtSecret) {
      console.log('  ✨ Yeni JWT_SECRET üretildi ve Vault kasasına kaydedildi.');
    }

    if (genResult.preservedKeys.encryptionKey) {
      console.log('  ℹ️  ENCRYPTION_KEY zaten mevcut (Korundu).');
    } else if (genResult.generatedItems.encryptionKey) {
      console.log('  ✨ Yeni ENCRYPTION_KEY üretildi.');
    }

    if (genResult.preservedKeys.otaSigningKey) {
      console.log('  ℹ️  OTA_SIGNING_KEY zaten mevcut (Korundu).');
    } else if (genResult.generatedItems.otaSigningKey) {
      console.log('  ✨ Yeni Ed25519 OTA imzalama anahtarı üretildi ve Vault kasasına kaydedildi.');
    }
    console.log('\n');
  }

  const statuses = systemKeysService.getKeyStatuses();

  console.log('--- AKTİF SİSTEM ANAHTARLARI DURUMU (YALNIZCA METADATA / MASKELİ) ---');
  console.log(`1. JWT_SECRET / SESSION_SECRET:`);
  console.log(`   - Durum:    ${statuses.keys.jwtSecret.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:   ${statuses.keys.jwtSecret.source}`);
  console.log(`   - Maskeli:  ${statuses.keys.jwtSecret.maskedValue || '(Yok)'}`);

  console.log(`\n2. ENCRYPTION_KEY (Vault Kasa Şifreleme):`);
  console.log(`   - Durum:    ${statuses.keys.encryptionKey.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:   ${statuses.keys.encryptionKey.source}`);
  console.log(`   - Maskeli:  ${statuses.keys.encryptionKey.maskedValue || '(Yok)'}`);

  console.log(`\n3. OTA_SIGNING_KEY (Firmware İmzası):`);
  console.log(`   - Durum:    ${statuses.keys.otaSigningKey.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:   ${statuses.keys.otaSigningKey.source}`);
  console.log(`   - Maskeli:  ${statuses.keys.otaSigningKey.maskedValue || '(Yok)'}`);

  console.log('\n------------------------------------------------------------------------------');
  console.log('  GÜVENLİK POLİTİKASI:');
  console.log('  Tüm uygulama anahtarları AES-256-GCM Central Security Vault içinde saklanır.');
  console.log('  Hiçbir düz metin parola veya anahtar terminale ya da diske dökülmez.');
  console.log('------------------------------------------------------------------------------\n');

  if (!statuses.allConfigured) {
    console.log('⚠️  DİKKAT: Bazı kritik anahtarlar eksik! Otomatik üretmek için şu komutu çalıştırın:');
    console.log('   npm run show-keys -- --generate\n');
  } else {
    console.log('✅ Tüm kritik üretim güvenlik anahtarları hazır ve güvendedir.\n');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('[!] Hata:', err?.message || err);
  process.exit(1);
});
