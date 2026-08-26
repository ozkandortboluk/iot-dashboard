import { describe, it, expect, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret, maskSecret, isMaskedSecret } from '../server/utils/crypto.js';
import { db } from '../server/db.js';
import type { User, NotificationServiceConfig } from '../types.js';

describe('Notification Service Credentials Security & RBAC Test Suite', () => {
  const adminUser: User = {
    id: 'usr_admin_test',
    name: 'Sistem Yöneticisi',
    email: 'admin@iot.local',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  const customerUser: User = {
    id: 'usr_customer_test',
    name: 'Müşteri Kullanıcısı',
    email: 'musteri@enerji.com',
    role: 'customer',
    companyName: 'Müşteri Enerji A.Ş.',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset test config
    db.updateServiceConfig({
      whatsapp: {
        enabled: true,
        phoneNumberId: '10987654321',
        apiToken: 'EAAG999888777RealWhatsAppToken1234',
        provider: 'cloud_api',
      },
      telegram: {
        enabled: true,
        botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_5678',
        botUsername: '@NexusIoTAlarmBot',
      },
      webhook: {
        enabled: true,
        defaultEndpoint: 'https://api.external.com/webhooks/alarms',
        secretHeader: 'super_secret_webhook_signature_key_9999',
      },
    });
  });

  describe('1. AES-256-GCM Cryptographic Vault Operations', () => {
    it('should encrypt sensitive tokens into enc:v1 format and decrypt accurately', () => {
      const plaintext = 'EAAG_Meta_Cloud_Api_Secret_Token_ABCD_5678';
      const encrypted = encryptSecret(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith('enc:v1:')).toBe(true);
      expect(encrypted.split(':')).toHaveLength(5); // enc, v1, iv, tag, cipher

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle already encrypted strings idempotently without re-encrypting', () => {
      const plaintext = '123456789:TelegramBotTokenSecret';
      const enc1 = encryptSecret(plaintext);
      const enc2 = encryptSecret(enc1);

      expect(enc2).toBe(enc1);
      expect(decryptSecret(enc2)).toBe(plaintext);
    });

    it('should gracefully handle empty or undefined secrets', () => {
      expect(encryptSecret('')).toBe('');
      expect(encryptSecret(undefined)).toBe('');
      expect(decryptSecret('')).toBe('');
      expect(decryptSecret(undefined)).toBe('');
    });
  });

  describe('2. Secret Masking for Client Responses (••••••••son4)', () => {
    it('should mask long tokens and reveal only the last 4 characters', () => {
      const token = 'EAAG_Meta_SuperSecret_9876';
      const masked = maskSecret(token);

      expect(masked).toBe('••••••••9876');
      expect(masked).not.toContain('Meta');
      expect(masked).not.toContain('SuperSecret');
    });

    it('should mask encrypted tokens directly without exposing ciphertext', () => {
      const rawToken = 'TelegramToken_xyz1234';
      const encrypted = encryptSecret(rawToken);

      const masked = maskSecret(encrypted);
      expect(masked).toBe('••••••••1234');
    });

    it('should output •••••••• for short tokens (<= 4 chars) and empty for empty tokens', () => {
      expect(maskSecret('abc')).toBe('••••••••');
      expect(maskSecret('')).toBe('');
      expect(maskSecret(undefined)).toBe('');
    });

    it('should correctly identify masked tokens via isMaskedSecret', () => {
      expect(isMaskedSecret('••••••••1234')).toBe(true);
      expect(isMaskedSecret('********5678')).toBe(true);
      expect(isMaskedSecret('••••••••')).toBe(true);
      expect(isMaskedSecret('EAAG_Real_Plaintext_Token')).toBe(false);
      expect(isMaskedSecret('')).toBe(false);
    });
  });

  describe('3. Database Config Persistence & Mask Preservation', () => {
    it('should return decrypted tokens internally for notification dispatchers', () => {
      const internalConfig = db.getServiceConfig(true);
      expect(internalConfig.whatsapp.apiToken).toBe('EAAG999888777RealWhatsAppToken1234');
      expect(internalConfig.telegram.botToken).toBe('123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_5678');
      expect(internalConfig.webhook.secretHeader).toBe('super_secret_webhook_signature_key_9999');
    });

    it('should NOT overwrite existing real secret if admin saves masked placeholder', () => {
      const existing = db.getServiceConfig(true);
      const originalWaToken = existing.whatsapp.apiToken;

      // Admin saves with masked token string (••••••••1234)
      db.updateServiceConfig({
        whatsapp: {
          ...existing.whatsapp,
          apiToken: '••••••••1234',
        },
      });

      const updated = db.getServiceConfig(true);
      expect(updated.whatsapp.apiToken).toBe(originalWaToken);
    });

    it('should properly update and encrypt when admin supplies a brand new token', () => {
      const newToken = 'EAAG_BrandNewToken_7777';
      db.updateServiceConfig({
        whatsapp: {
          enabled: true,
          apiToken: newToken,
          provider: 'cloud_api'
        },
      });

      // Internal getter retrieves decrypted new token
      const internal = db.getServiceConfig(true);
      expect(internal.whatsapp.apiToken).toBe(newToken);

      // Mask helper masks the new token
      expect(maskSecret(internal.whatsapp.apiToken)).toBe('••••••••7777');
    });
  });
});
