import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { systemLogger } from './systemLogger.service.js';
import { systemSecretsService } from './systemSecrets.service.js';
import { masterKeyProvider } from './masterKeyProvider.js';
import { resetEncryptionKeyCache } from '../utils/crypto.js';
import { isProductionVpsEnvironment } from '../config/runtimeEnvironment.js';

export interface KeyItemStatus {
  keyName: string;
  isConfigured: boolean;
  source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing';
  sourcePath?: string;
  maskedValue?: string;
  isWeakOrDefault: boolean;
  requiredForProduction: boolean;
  description: string;
  keyId?: string;
  version?: number;
  rotatable?: boolean;
}

export interface SystemKeysStatusResponse {
  allConfigured: boolean;
  missingCount: number;
  keys: {
    encryptionKey: KeyItemStatus;
  };
}

export interface GeneratedKeyResult {
  success: boolean;
  message: string;
  generatedItems: {
    encryptionKey: boolean;
  };
  preservedKeys: {
    encryptionKey: boolean;
  };
  savedLocations: string[];
  envSnippet?: string;
}

const SECRETS_DIR = path.resolve(process.cwd(), 'secrets');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ENV_FILE = path.resolve(process.cwd(), '.env');

const DEFAULT_SECRETS = [
  'change_this_to_a_secure_random_string',
  'change_this_in_production_jwt_secret',
  'replace_with_a_secure_random_key_for_production',
  'default_insecure_key',
  'secret',
  'password',
  'admin',
  '12345678',
  'your_secret_here',
  'my_secret_key',
];

function isWeak(val: string): boolean {
  if (!val || val.trim().length < 16) return true;
  const lower = val.trim().toLowerCase();
  return DEFAULT_SECRETS.some((s) => lower === s || lower.includes('change_this') || lower.includes('replace_with'));
}

export class SystemKeysService {
  private static instance: SystemKeysService;

  public static getInstance(): SystemKeysService {
    if (!SystemKeysService.instance) {
      SystemKeysService.instance = new SystemKeysService();
    }
    return SystemKeysService.instance;
  }

  private ensureDirectoriesExist(): void {
    try {
      if (!fs.existsSync(SECRETS_DIR)) {
        fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
      }
    } catch {}
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
      }
    } catch {}
  }

  /**
   * Resolves current ENCRYPTION_KEY status metadata without exposing raw key material.
   * Single Source of Truth: strictly delegates to MasterKeyProvider.
   * Security Gate: Never returns raw key bytes/hex strings to status consumers.
   */
  public resolveEncryptionKey(): {
    configured: boolean;
    source: 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing';
    sourcePath?: string;
    keyId: string;
  } {
    const status = masterKeyProvider.getStatus();
    const sourceMap: Record<string, 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'> = {
      docker_secret: 'docker_secret',
      secrets_file: 'secrets_file',
      data_vault_key: 'data_file',
      env: 'env',
      missing: 'missing',
    };
    return {
      configured: status.configured,
      source: sourceMap[status.source] || 'missing',
      sourcePath: status.sourcePath,
      keyId: 'root_master_key',
    };
  }

  /**
   * Legacy compatibility reader for backward-compatible migration lookup.
   * Does not appear in user-facing status.
   */
  public resolveLegacyJwtSecret(): { value: string; source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    const vaultJwt = systemSecretsService.getSecret('authentication.jwt_secret') || systemSecretsService.getSecret('jwt_secret');
    if (vaultJwt && !isWeak(vaultJwt)) {
      return { value: vaultJwt, source: 'vault' };
    }
    return { value: '', source: 'missing' };
  }

  /**
   * Returns current status of user-managed root encryption key.
   * In the unified single-key architecture, ENCRYPTION_KEY is the ONLY user-managed key.
   */
  public getKeyStatuses(): SystemKeysStatusResponse {
    const enc = this.resolveEncryptionKey();

    const encItem: KeyItemStatus = {
      keyName: 'ENCRYPTION_KEY',
      isConfigured: enc.configured,
      source: enc.source,
      sourcePath: enc.sourcePath,
      maskedValue: enc.configured ? '(AES-256-GCM Root Key Aktif)' : '',
      isWeakOrDefault: false,
      requiredForProduction: true,
      description: 'Gizli Kasa (Vault) ve veritabanı parolalarını şifreleme anahtarı (AES-256-GCM).',
      keyId: enc.keyId,
      version: 1,
      rotatable: false,
    };

    const missingCount = !encItem.isConfigured ? 1 : 0;

    return {
      allConfigured: encItem.isConfigured,
      missingCount,
      keys: {
        encryptionKey: encItem,
      },
    };
  }

  /**
   * Generates ONLY the root ENCRYPTION_KEY if missing in non-production environments.
   * In production: missing ENCRYPTION_KEY strictly triggers fail-closed refusal.
   * Internal secrets (OTA Ed25519 signing key) are managed internally by SystemSecretsService.ensureOtaSigningKey().
   */
  public async generateMissingKeys(): Promise<GeneratedKeyResult> {
    this.ensureDirectoriesExist();

    const currentEnc = this.resolveEncryptionKey();
    const isProd = isProductionVpsEnvironment();

    const generatedItems: GeneratedKeyResult['generatedItems'] = {
      encryptionKey: false,
    };
    const preservedKeys: GeneratedKeyResult['preservedKeys'] = {
      encryptionKey: false,
    };
    const savedLocations: string[] = [];

    // 1. Root ENCRYPTION_KEY (Single User-Managed Root-of-Trust)
    if (currentEnc.configured) {
      preservedKeys.encryptionKey = true;
      systemLogger.info('security', `[SystemKeys] Mevcut ENCRYPTION_KEY korundu (${currentEnc.source}). Yeniden üretilmedi.`);
    } else {
      if (isProd) {
        systemLogger.critical('security', '[SystemKeys] Üretim ortamında ENCRYPTION_KEY otomatik üretilip dosyaya yazılamaz. Fail-closed: Docker Secret (/run/secrets/encryption_key) tanımlanmalıdır.');
        return {
          success: false,
          message: 'Üretim ortamında ENCRYPTION_KEY eksik! Root anahtar Docker secret (/run/secrets/encryption_key) ile sağlanmalıdır.',
          generatedItems,
          preservedKeys,
          savedLocations,
        };
      } else {
        // Development / Test bootstrap: delegate directly to MasterKeyProvider
        masterKeyProvider.getKey();
        generatedItems.encryptionKey = true;
        savedLocations.push('data/.vault_key');
        systemLogger.info('security', '[SystemKeys] Geliştirme modu: Yerel ENCRYPTION_KEY MasterKeyProvider tarafından sağlandı.');
      }
    }

    // 2. Ensure internal Vault secrets (OTA Ed25519 private signing key) are present inside Vault
    // Never user-facing; strictly managed by SystemSecretsService inside Vault
    try {
      await systemSecretsService.ensureOtaSigningKey();
    } catch (otaErr: any) {
      systemLogger.warn('security', `[SystemKeys] Dahili OTA anahtarı doğrulanırken uyarı: ${otaErr?.message || otaErr}`);
    }

    const envSnippet = [
      '# ENCRYPTION_KEY: Root master key is protected and strictly non-exportable from application runtime.',
      '# All application secrets (database credentials, OTA signing keys) are managed inside Security Vault.',
    ].join('\n');

    return {
      success: true,
      message: 'Kök şifreleme anahtarı (ENCRYPTION_KEY) doğrulandı ve Security Vault hazırlandı.',
      generatedItems,
      preservedKeys,
      savedLocations,
      envSnippet,
    };
  }

  /**
   * Formats full export details for VPS CLI show-keys command
   */
  public getFullExportDetails(): {
    encryptionKey: KeyItemStatus;
    envSnippet: string;
  } {
    const statuses = this.getKeyStatuses();
    const envSnippet = [
      '# ENCRYPTION_KEY: Root master key is protected and strictly non-exportable from application runtime.',
      '# All application secrets (database credentials, OTA signing keys) are managed inside Security Vault.',
    ].join('\n');

    return {
      encryptionKey: statuses.keys.encryptionKey,
      envSnippet,
    };
  }
}

export const systemKeysService = SystemKeysService.getInstance();
