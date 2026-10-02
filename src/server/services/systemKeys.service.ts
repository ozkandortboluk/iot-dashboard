import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { systemLogger } from './systemLogger.service.js';
import { systemSecretsService } from './systemSecrets.service.js';
import { resetEncryptionKeyCache } from '../utils/crypto.js';

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
    jwtSecret: KeyItemStatus;
    encryptionKey: KeyItemStatus;
    otaSigningKey: KeyItemStatus;
  };
}

export interface GeneratedKeyResult {
  success: boolean;
  message: string;
  generatedItems: {
    jwtSecret: boolean;
    encryptionKey: boolean;
    otaSigningKey: boolean;
    otaPublicKey?: string;
  };
  preservedKeys: {
    jwtSecret: boolean;
    encryptionKey: boolean;
    otaSigningKey: boolean;
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

function mask(val: string): string {
  if (!val) return '';
  if (val.length <= 8) return '****';
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
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
   * Resolves current JWT_SECRET / SESSION_SECRET status.
   * In production runtime, Central Security Vault is strictly the ONLY CANONICAL SOURCE.
   */
  public resolveJwtSecret(): { value: string; source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Central Security Vault (CANONICAL SOURCE)
    const vaultJwt = systemSecretsService.getSecret('authentication.jwt_secret') || systemSecretsService.getSecret('jwt_secret');
    if (vaultJwt && !isWeak(vaultJwt)) {
      return { value: vaultJwt, source: 'vault' };
    }

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is strictly the ONLY canonical source!
      // Do not fall back to process.env or plaintext files.
      return { value: '', source: 'missing' };
    }

    // 2. Non-production (development / test) local fallback
    let candidateVal = '';
    let legacySource: 'docker_secret' | 'env' | 'secrets_file' | 'data_file' | '' = '';
    let legacyFilePath = '';

    const dockerPaths = ['/run/secrets/jwt_secret', '/run/secrets/session_secret'];
    for (const p of dockerPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val && !isWeak(val)) {
            candidateVal = val;
            legacySource = 'docker_secret';
            legacyFilePath = p;
            break;
          }
        }
      } catch {}
    }

    if (!candidateVal) {
      const envVal = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
      if (envVal && !isWeak(envVal)) {
        candidateVal = envVal;
        legacySource = 'env';
      }
    }

    if (!candidateVal) {
      const secretsPaths = [
        path.join(SECRETS_DIR, 'jwt_secret'),
        path.join(SECRETS_DIR, 'session_secret'),
      ];
      for (const p of secretsPaths) {
        try {
          if (fs.existsSync(p)) {
            const val = fs.readFileSync(p, 'utf8').trim();
            if (val && !isWeak(val)) {
              candidateVal = val;
              legacySource = 'secrets_file';
              legacyFilePath = p;
              break;
            }
          }
        } catch {}
      }
    }

    if (!candidateVal) {
      const dataPaths = [
        path.join(DATA_DIR, '.jwt_secret'),
        path.join(DATA_DIR, '.session_secret'),
      ];
      for (const p of dataPaths) {
        try {
          if (fs.existsSync(p)) {
            const val = fs.readFileSync(p, 'utf8').trim();
            if (val && !isWeak(val)) {
              candidateVal = val;
              legacySource = 'data_file';
              legacyFilePath = p;
              break;
            }
          }
        } catch {}
      }
    }

    if (candidateVal && !isWeak(candidateVal)) {
      return { value: candidateVal, source: legacySource as any, sourcePath: legacyFilePath };
    }

    return { value: '', source: 'missing' };
  }

  /**
   * Resolves current ENCRYPTION_KEY status without mutating anything.
   * Preferred: Docker Secret /run/secrets/encryption_key or environment variable.
   * In production, local file fallback (data/.vault_key or secrets/encryption_key) is STRICTLY FORBIDDEN.
   */
  public resolveEncryptionKey(): { value: string; source: 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Docker Secret (Preferred in production)
    const dockerPath = '/run/secrets/encryption_key';
    try {
      if (fs.existsSync(dockerPath)) {
        const val = fs.readFileSync(dockerPath, 'utf8').trim();
        if (val && !isWeak(val)) return { value: val, source: 'docker_secret', sourcePath: dockerPath };
      }
    } catch {}

    // 2. Environment variable
    const envVal = (process.env.ENCRYPTION_KEY || '').trim();
    if (envVal && !isWeak(envVal)) {
      return { value: envVal, source: 'env' };
    }

    // 3. Custom path env
    const customPath = process.env.ENCRYPTION_KEY_PATH || process.env.ENCRYPTION_KEY_FILE;
    if (customPath) {
      try {
        if (fs.existsSync(customPath)) {
          const val = fs.readFileSync(customPath, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'secrets_file', sourcePath: customPath };
        }
      } catch {}
    }

    // 4. Strict production boundary: Do NOT read local fallback files in production!
    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (!isProd) {
      const secretPath = path.join(SECRETS_DIR, 'encryption_key');
      try {
        if (fs.existsSync(secretPath)) {
          const val = fs.readFileSync(secretPath, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'secrets_file', sourcePath: secretPath };
        }
      } catch {}

      const dataPath = path.join(DATA_DIR, '.vault_key');
      try {
        if (fs.existsSync(dataPath)) {
          const val = fs.readFileSync(dataPath, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'data_file', sourcePath: dataPath };
        }
      } catch {}
    }

    // 5. Weak env value fallback if present (causes validation rejection)
    if (envVal) {
      return { value: envVal, source: 'env' };
    }

    return { value: '', source: 'missing' };
  }

  /**
   * Resolves current OTA_SIGNING_KEY status.
   * In production runtime, Central Security Vault is strictly the ONLY CANONICAL SOURCE.
   */
  public resolveOtaSigningKey(): { value: string; source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Central Security Vault (CANONICAL SOURCE)
    const vaultOta = systemSecretsService.getSecret('ota.signing_key') || systemSecretsService.getSecret('ota_signing_key');
    if (vaultOta) {
      return { value: vaultOta, source: 'vault' };
    }

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is strictly the ONLY canonical source!
      // Do not fall back to process.env or plaintext files.
      return { value: '', source: 'missing' };
    }

    // 2. Non-production (development / test) local fallback
    let candidateVal = '';
    let legacySource: 'docker_secret' | 'env' | 'secrets_file' | 'data_file' | '' = '';
    let legacyFilePath = '';

    const dockerPath = '/run/secrets/ota_signing_key';
    try {
      if (fs.existsSync(dockerPath)) {
        const val = fs.readFileSync(dockerPath, 'utf8').trim();
        if (val) {
          candidateVal = val;
          legacySource = 'docker_secret';
          legacyFilePath = dockerPath;
        }
      }
    } catch {}

    if (!candidateVal) {
      const envVal = (process.env.OTA_SIGNING_PRIVATE_KEY || '').trim();
      if (envVal) {
        candidateVal = envVal;
        legacySource = 'env';
      }
    }

    if (!candidateVal) {
      const customPath = process.env.OTA_SIGNING_PRIVATE_KEY_PATH;
      if (customPath && fs.existsSync(customPath)) {
        try {
          const val = fs.readFileSync(customPath, 'utf8').trim();
          if (val) {
            candidateVal = val;
            legacySource = 'secrets_file';
            legacyFilePath = customPath;
          }
        } catch {}
      }
    }

    if (!candidateVal) {
      const secretPaths = [
        path.join(SECRETS_DIR, 'ota_signing_key'),
        path.join(SECRETS_DIR, 'ota_signing_key.pem'),
      ];
      for (const p of secretPaths) {
        try {
          if (fs.existsSync(p)) {
            const val = fs.readFileSync(p, 'utf8').trim();
            if (val) {
              candidateVal = val;
              legacySource = 'secrets_file';
              legacyFilePath = p;
              break;
            }
          }
        } catch {}
      }
    }

    if (!candidateVal) {
      const dataPath = path.join(DATA_DIR, '.ota_signing_key');
      try {
        if (fs.existsSync(dataPath)) {
          const val = fs.readFileSync(dataPath, 'utf8').trim();
          if (val) {
            candidateVal = val;
            legacySource = 'data_file';
            legacyFilePath = dataPath;
          }
        }
      } catch {}
    }

    if (candidateVal) {
      return { value: candidateVal, source: legacySource as any, sourcePath: legacyFilePath };
    }

    return { value: '', source: 'missing' };
  }

  /**
   * Returns current status of all essential system keys (Masked metadata only).
   */
  public getKeyStatuses(): SystemKeysStatusResponse {
    const jwt = this.resolveJwtSecret();
    const enc = this.resolveEncryptionKey();
    const ota = this.resolveOtaSigningKey();

    const jwtRec = systemSecretsService.getSecretRecord('authentication.jwt_secret') || systemSecretsService.getSecretRecord('jwt_secret');
    const otaRec = systemSecretsService.getSecretRecord('ota.signing_key') || systemSecretsService.getSecretRecord('ota_signing_key');

    const jwtItem: KeyItemStatus = {
      keyName: 'JWT_SECRET',
      isConfigured: Boolean(jwt.value && !isWeak(jwt.value)),
      source: jwt.source,
      sourcePath: jwt.sourcePath,
      maskedValue: mask(jwt.value),
      isWeakOrDefault: Boolean(jwt.value && isWeak(jwt.value)),
      requiredForProduction: true,
      description: 'Kullanıcı oturumları ve API token imzalama anahtarı (HMAC-SHA256).',
      keyId: jwtRec?.keyId || (jwt.source === 'vault' ? 'jwt_v1' : undefined),
      version: jwtRec?.version || (jwt.source === 'vault' ? 1 : undefined),
      rotatable: jwt.source === 'vault',
    };

    const encItem: KeyItemStatus = {
      keyName: 'ENCRYPTION_KEY',
      isConfigured: Boolean(enc.value && !isWeak(enc.value)),
      source: enc.source,
      sourcePath: enc.sourcePath,
      maskedValue: mask(enc.value),
      isWeakOrDefault: Boolean(enc.value && isWeak(enc.value)),
      requiredForProduction: true,
      description: 'Gizli Kasa (Vault) ve veritabanı parolalarını şifreleme anahtarı (AES-256-GCM).',
      keyId: 'root_master_key',
      version: 1,
      rotatable: false,
    };

    const otaItem: KeyItemStatus = {
      keyName: 'OTA_SIGNING_KEY',
      isConfigured: Boolean(ota.value && ota.value.length > 30),
      source: ota.source,
      sourcePath: ota.sourcePath,
      maskedValue: ota.value ? '(Ed25519 Private Key Mevcut)' : '',
      isWeakOrDefault: false,
      requiredForProduction: false,
      description: 'Cihaz firmware (OTA) paketlerini imzalama özel anahtarı (Ed25519).',
      keyId: otaRec?.keyId || (ota.source === 'vault' ? 'root_ed25519_v1' : undefined),
      version: otaRec?.version || (ota.source === 'vault' ? 1 : undefined),
      rotatable: ota.source === 'vault',
    };

    let missingCount = 0;
    if (!jwtItem.isConfigured) missingCount++;
    if (!encItem.isConfigured) missingCount++;
    if (!otaItem.isConfigured) missingCount++;

    return {
      allConfigured: jwtItem.isConfigured && encItem.isConfigured,
      missingCount,
      keys: {
        jwtSecret: jwtItem,
        encryptionKey: encItem,
        otaSigningKey: otaItem,
      },
    };
  }

  /**
   * Generates ONLY MISSING keys, strictly preserving existing keys!
   * - If a key already exists and is valid, it is NEVER modified or overwritten.
   * - Application keys (JWT, OTA) are saved EXCLUSIVELY to Central Security Vault.
   * - Plaintext secret files are NEVER created on disk.
   * - In production: missing ENCRYPTION_KEY triggers strict fail-closed refusal.
   */
  public async generateMissingKeys(): Promise<GeneratedKeyResult> {
    this.ensureDirectoriesExist();

    const currentJwt = this.resolveJwtSecret();
    const currentEnc = this.resolveEncryptionKey();
    const currentOta = this.resolveOtaSigningKey();

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';

    const generatedItems: GeneratedKeyResult['generatedItems'] = {
      jwtSecret: false,
      encryptionKey: false,
      otaSigningKey: false,
    };
    const preservedKeys: GeneratedKeyResult['preservedKeys'] = {
      jwtSecret: false,
      encryptionKey: false,
      otaSigningKey: false,
    };
    const savedLocations: string[] = [];

    // 1. JWT_SECRET — Vault-Only (No plaintext files on disk)
    if (currentJwt.value && !isWeak(currentJwt.value)) {
      preservedKeys.jwtSecret = true;
      systemLogger.info('security', `[SystemKeys] Mevcut JWT_SECRET korundu (${currentJwt.source}). Yeniden üretilmedi.`);
      // Auto-migrate to Vault if not yet present in Vault
      if (currentJwt.source !== 'vault') {
        await systemSecretsService.setSecret('authentication.jwt_secret', currentJwt.value, {
          category: 'authentication',
          label: 'JWT Secret',
          description: 'Oturum ve API token imzalama anahtarı',
        });
      }
      // Scrub any legacy plaintext files on disk
      try {
        const legacy1 = path.join(SECRETS_DIR, 'jwt_secret');
        const legacy2 = path.join(DATA_DIR, '.jwt_secret');
        if (fs.existsSync(legacy1)) fs.unlinkSync(legacy1);
        if (fs.existsSync(legacy2)) fs.unlinkSync(legacy2);
      } catch {}
    } else {
      const generatedJwt = crypto.randomBytes(32).toString('hex');
      generatedItems.jwtSecret = true;
      process.env.JWT_SECRET = generatedJwt;
      process.env.SESSION_SECRET = generatedJwt;

      // Save strictly to Central Security Vault
      await systemSecretsService.setSecret('authentication.jwt_secret', generatedJwt, {
        category: 'authentication',
        label: 'JWT Secret',
        description: 'Oturum ve API token imzalama anahtarı',
      });

      // Scrub any legacy plaintext files to enforce Vault-only storage
      try {
        const legacy1 = path.join(SECRETS_DIR, 'jwt_secret');
        const legacy2 = path.join(DATA_DIR, '.jwt_secret');
        if (fs.existsSync(legacy1)) fs.unlinkSync(legacy1);
        if (fs.existsSync(legacy2)) fs.unlinkSync(legacy2);
      } catch {}

      savedLocations.push('Security Vault (authentication.jwt_secret)');
      systemLogger.info('security', '[SystemKeys] Yeni kriptografik JWT_SECRET üretildi ve doğrudan Vault kasasına kaydedildi.');
    }

    // 2. ENCRYPTION_KEY — Root Key (Outside Vault)
    if (currentEnc.value && !isWeak(currentEnc.value)) {
      preservedKeys.encryptionKey = true;
      systemLogger.info('security', `[SystemKeys] Mevcut ENCRYPTION_KEY korundu (${currentEnc.source}). Yeniden üretilmedi.`);
    } else {
      if (isProd) {
        systemLogger.critical('security', '[SystemKeys] Üretim ortamında ENCRYPTION_KEY otomatik üretilip dosyaya yazılamaz. Fail-closed: Docker Secret (/run/secrets/encryption_key) veya ortam değişkeni tanımlanmalıdır.');
        return {
          success: false,
          message: 'Üretim ortamında ENCRYPTION_KEY eksik! Root anahtar Docker secret veya ortam değişkeni ile sağlanmalıdır.',
          generatedItems,
          preservedKeys,
          savedLocations,
        };
      } else {
        // Development / Test bootstrap only
        const generatedEnc = crypto.randomBytes(32).toString('hex');
        generatedItems.encryptionKey = true;
        process.env.ENCRYPTION_KEY = generatedEnc;

        const dataFile = path.join(DATA_DIR, '.vault_key');
        try {
          fs.writeFileSync(dataFile, generatedEnc, { encoding: 'utf8', mode: 0o600 });
          savedLocations.push('data/.vault_key');
        } catch {}

        resetEncryptionKeyCache();
        systemLogger.info('security', '[SystemKeys] Geliştirme modu: Yeni yerel ENCRYPTION_KEY üretildi ve data/.vault_key dosyasına yazıldı.');
      }
    }

    // 3. OTA_SIGNING_KEY — Vault-Only Private Key
    if (currentOta.value && currentOta.value.length > 30) {
      preservedKeys.otaSigningKey = true;
      systemLogger.info('security', `[SystemKeys] Mevcut OTA_SIGNING_KEY korundu (${currentOta.source}). Yeniden üretilmedi.`);
      // Auto-migrate to Vault if not yet in Vault
      if (currentOta.source !== 'vault') {
        await systemSecretsService.setSecret('ota.signing_key', currentOta.value, {
          category: 'ota',
          label: 'OTA Imzalama Özel Anahtarı',
          description: 'Ed25519 firmware paketi imzalama özel anahtarı',
        });
      }
      // Scrub any legacy plaintext private key files
      try {
        const privFile = path.join(SECRETS_DIR, 'ota_signing_key.pem');
        const dataPrivFile = path.join(DATA_DIR, '.ota_signing_key');
        if (fs.existsSync(privFile)) fs.unlinkSync(privFile);
        if (fs.existsSync(dataPrivFile)) fs.unlinkSync(dataPrivFile);
      } catch {}
    } else {
      try {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          publicKeyEncoding: { type: 'spki', format: 'pem' },
        });

        generatedItems.otaSigningKey = true;
        generatedItems.otaPublicKey = publicKey;

        // Save private key strictly to Central Security Vault
        await systemSecretsService.setSecret('ota.signing_key', privateKey, {
          category: 'ota',
          label: 'OTA Imzalama Özel Anahtarı',
          description: 'Ed25519 firmware paketi imzalama özel anahtarı',
        });

        // Scrub any legacy plaintext private key files
        try {
          const privFile = path.join(SECRETS_DIR, 'ota_signing_key.pem');
          const dataPrivFile = path.join(DATA_DIR, '.ota_signing_key');
          if (fs.existsSync(privFile)) fs.unlinkSync(privFile);
          if (fs.existsSync(dataPrivFile)) fs.unlinkSync(dataPrivFile);
        } catch {}

        // Public key is non-sensitive and can be saved for firmware build flashing
        try {
          const pubFile = path.join(SECRETS_DIR, 'ota_signing_key.pub');
          fs.writeFileSync(pubFile, publicKey, { encoding: 'utf8', mode: 0o644 });
          savedLocations.push('secrets/ota_signing_key.pub');
        } catch {}

        savedLocations.push('Security Vault (ota.signing_key)');
        systemLogger.info('security', '[SystemKeys] Yeni Ed25519 OTA imzalama anahtarı üretildi ve doğrudan Vault kasasına kaydedildi.');
      } catch (err: any) {
        systemLogger.warn('security', `OTA anahtarı üretilirken hata: ${err?.message || err}`);
      }
    }

    const activeJwt = this.resolveJwtSecret().value || process.env.JWT_SECRET || '';
    const activeEnc = this.resolveEncryptionKey().value || process.env.ENCRYPTION_KEY || '';
    const envSnippet = [
      `JWT_SECRET=${activeJwt}`,
      `ENCRYPTION_KEY=${activeEnc}`,
    ].join('\n');

    return {
      success: true,
      message: 'Gerekli güvenlik anahtarları başarıyla doğrulandı ve Vault kasasına kaydedildi.',
      generatedItems,
      preservedKeys,
      savedLocations,
      envSnippet,
    };
  }

  /**
   * Rotates JWT_SECRET, assigning a new keyId and archiving previous secret in Vault previousVersions
   */
  public async rotateJwtSecret(operatorName = 'admin'): Promise<{ success: boolean; oldKeyId?: string; newKeyId: string; version: number }> {
    const newSecret = crypto.randomBytes(32).toString('hex');
    const existingRec = systemSecretsService.getSecretRecord('authentication.jwt_secret') || systemSecretsService.getSecretRecord('jwt_secret');
    const nextVer = (existingRec?.version || 1) + 1;
    const newKeyId = `jwt_v${nextVer}`;

    const result = await systemSecretsService.rotateSecret('authentication.jwt_secret', newSecret, {
      keyId: newKeyId,
      description: `Oturum ve API token imzalama anahtarı (${newKeyId})`,
      updatedBy: operatorName,
    });

    process.env.JWT_SECRET = newSecret;
    process.env.SESSION_SECRET = newSecret;

    systemLogger.info('security', `[SystemKeys] JWT_SECRET başarıyla döndürüldü: ${result.newKeyId} (v${result.version})`);
    return result;
  }

  /**
   * Rotates OTA_SIGNING_KEY, assigning a new keyId, saving new public key, and archiving previous key in Vault
   */
  public async rotateOtaSigningKey(operatorName = 'admin'): Promise<{ success: boolean; oldKeyId?: string; newKeyId: string; version: number; publicKeyPem: string }> {
    this.ensureDirectoriesExist();
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const existingRec = systemSecretsService.getSecretRecord('ota.signing_key') || systemSecretsService.getSecretRecord('ota_signing_key');
    const nextVer = (existingRec?.version || 1) + 1;
    const newKeyId = `root_ed25519_v${nextVer}`;

    const result = await systemSecretsService.rotateSecret('ota.signing_key', privateKey, {
      keyId: newKeyId,
      description: `Ed25519 firmware paketi imzalama özel anahtarı (${newKeyId})`,
      updatedBy: operatorName,
    });

    // Save non-sensitive public key for firmware compile/flash tooling
    try {
      const pubFile = path.join(SECRETS_DIR, 'ota_signing_key.pub');
      fs.writeFileSync(pubFile, publicKey, { encoding: 'utf8', mode: 0o644 });
    } catch {}

    systemLogger.info('security', `[SystemKeys] OTA_SIGNING_KEY başarıyla döndürüldü: ${newKeyId} (v${result.version})`);
    return {
      ...result,
      publicKeyPem: publicKey,
    };
  }

  /**
   * Formats full export details for VPS CLI show-keys command
   */
  public getFullExportDetails(): {
    jwtSecret: KeyItemStatus;
    encryptionKey: KeyItemStatus;
    otaSigningKey: KeyItemStatus;
    envSnippet: string;
  } {
    const statuses = this.getKeyStatuses();
    const activeJwt = this.resolveJwtSecret().value || process.env.JWT_SECRET || '';
    const activeEnc = this.resolveEncryptionKey().value || process.env.ENCRYPTION_KEY || '';
    const envSnippet = [
      `JWT_SECRET=${activeJwt}`,
      `ENCRYPTION_KEY=${activeEnc}`,
    ].join('\n');

    return {
      jwtSecret: statuses.keys.jwtSecret,
      encryptionKey: statuses.keys.encryptionKey,
      otaSigningKey: statuses.keys.otaSigningKey,
      envSnippet,
    };
  }
}

export const systemKeysService = SystemKeysService.getInstance();
