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
    if (genResult.preservedKeys.encryptionKey) {
      console.log('  ℹ️  ENCRYPTION_KEY zaten mevcut (Korundu).');
    } else if (genResult.generatedItems.encryptionKey) {
      console.log('  ✨ Yeni ENCRYPTION_KEY üretildi.');
    }
    console.log('\n');
  }

  const statuses = systemKeysService.getKeyStatuses();
  const dbPass = systemSecretsService.getDatabasePassword();

  console.log('--- AKTİF SİSTEM GÜVENLİK DURUMU (YALNIZCA METADATA / MASKELİ) ---');
  console.log(`1. ENCRYPTION_KEY (Tek Root Master Anahtar):`);
  console.log(`   - Durum:    ${statuses.keys.encryptionKey.isConfigured ? '✅ YAPILANDIRILMIŞ' : '❌ EKSİK'}`);
  console.log(`   - Kaynak:   ${statuses.keys.encryptionKey.source}`);
  console.log(`   - Maskeli:  ${statuses.keys.encryptionKey.maskedValue || '(Yok)'}`);

  console.log(`\n2. Central Security Vault (AES-256-GCM):`);
  console.log(`   - Durum:    ${statuses.allConfigured ? '✅ AKTİF & KİLİTLİ' : '⚠️  YAPILANDIRILMAMIŞ'}`);
  console.log(`   - Veritabanı Parolası: ${dbPass ? '✅ Vault Kasasında Korumada' : '❌ Tanımlanmamış'}`);

  console.log('\n------------------------------------------------------------------------------');
  console.log('  GÜVENLİK POLİTİKASI:');
  console.log('  Kullanıcının yönettiği tek anahtar ENCRYPTION_KEY root anahtarıdır.');
  console.log('  Veritabanı parolası ve dahili sırlar Central Security Vault içinde saklanır.');
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
