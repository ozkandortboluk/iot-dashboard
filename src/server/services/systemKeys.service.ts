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
  newlyGenerated: {
    jwtSecret?: string;
    encryptionKey?: string;
    otaSigningKey?: string;
    otaPublicKey?: string;
  };
  preservedKeys: {
    jwtSecret: boolean;
    encryptionKey: boolean;
    otaSigningKey: boolean;
  };
  envSnippet: string;
  savedLocations: string[];
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
   * Resolves current JWT_SECRET / SESSION_SECRET status without mutating anything.
   */
  public resolveJwtSecret(): { value: string; source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Central Security Vault
    const vaultJwt = systemSecretsService.getSecret('authentication.jwt_secret') || systemSecretsService.getSecret('jwt_secret');
    if (vaultJwt && !isWeak(vaultJwt)) {
      return { value: vaultJwt, source: 'vault' };
    }

    // 2. Env vars (if strong)
    const envVal = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
    if (envVal && !isWeak(envVal)) {
      return { value: envVal, source: 'env' };
    }

    // 3. Docker Secrets
    const dockerPaths = ['/run/secrets/jwt_secret', '/run/secrets/session_secret'];
    for (const p of dockerPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'docker_secret', sourcePath: p };
        }
      } catch {}
    }

    // 4. secrets/ directory
    const secretsPaths = [
      path.join(SECRETS_DIR, 'jwt_secret'),
      path.join(SECRETS_DIR, 'session_secret'),
    ];
    for (const p of secretsPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'secrets_file', sourcePath: p };
        }
      } catch {}
    }

    // 5. data/ directory fallback
    const dataPaths = [
      path.join(DATA_DIR, '.jwt_secret'),
      path.join(DATA_DIR, '.session_secret'),
    ];
    for (const p of dataPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'data_file', sourcePath: p };
        }
      } catch {}
    }

    // 6. Weak env value fallback if present
    if (envVal) {
      return { value: envVal, source: 'env' };
    }

    return { value: '', source: 'missing' };
  }

  /**
   * Resolves current ENCRYPTION_KEY status without mutating anything.
   */
  public resolveEncryptionKey(): { value: string; source: 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Env var (if strong)
    const envVal = (process.env.ENCRYPTION_KEY || '').trim();
    if (envVal && !isWeak(envVal)) {
      return { value: envVal, source: 'env' };
    }

    // 2. Custom path env
    const customPath = process.env.ENCRYPTION_KEY_PATH || process.env.ENCRYPTION_KEY_FILE;
    if (customPath) {
      try {
        if (fs.existsSync(customPath)) {
          const val = fs.readFileSync(customPath, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'secrets_file', sourcePath: customPath };
        }
      } catch {}
    }

    // 3. Docker Secret
    const dockerPath = '/run/secrets/encryption_key';
    try {
      if (fs.existsSync(dockerPath)) {
        const val = fs.readFileSync(dockerPath, 'utf8').trim();
        if (val && !isWeak(val)) return { value: val, source: 'docker_secret', sourcePath: dockerPath };
      }
    } catch {}

    // 4. secrets/ directory
    const secretPath = path.join(SECRETS_DIR, 'encryption_key');
    try {
      if (fs.existsSync(secretPath)) {
        const val = fs.readFileSync(secretPath, 'utf8').trim();
        if (val && !isWeak(val)) return { value: val, source: 'secrets_file', sourcePath: secretPath };
      }
    } catch {}

    // 5. Strict production boundary: Do NOT read local fallback file data/.vault_key in production!
    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (!isProd) {
      const dataPath = path.join(DATA_DIR, '.vault_key');
      try {
        if (fs.existsSync(dataPath)) {
          const val = fs.readFileSync(dataPath, 'utf8').trim();
          if (val && !isWeak(val)) return { value: val, source: 'data_file', sourcePath: dataPath };
        }
      } catch {}
    }

    // 6. Weak env value fallback if present
    if (envVal) {
      return { value: envVal, source: 'env' };
    }

    return { value: '', source: 'missing' };
  }

  /**
   * Resolves current OTA_SIGNING_KEY status without mutating anything.
   */
  public resolveOtaSigningKey(): { value: string; source: 'vault' | 'env' | 'docker_secret' | 'secrets_file' | 'data_file' | 'missing'; sourcePath?: string } {
    // 1. Central Security Vault
    const vaultOta = systemSecretsService.getSecret('ota.signing_key') || systemSecretsService.getSecret('ota_signing_key');
    if (vaultOta) {
      return { value: vaultOta, source: 'vault' };
    }

    // 2. Env var
    const envVal = (process.env.OTA_SIGNING_PRIVATE_KEY || '').trim();
    if (envVal) {
      return { value: envVal, source: 'env' };
    }

    // 3. Custom path
    const customPath = process.env.OTA_SIGNING_PRIVATE_KEY_PATH;
    if (customPath) {
      try {
        if (fs.existsSync(customPath)) {
          const val = fs.readFileSync(customPath, 'utf8').trim();
          if (val) return { value: val, source: 'secrets_file', sourcePath: customPath };
        }
      } catch {}
    }

    // 4. Docker Secret
    const dockerPath = '/run/secrets/ota_signing_key';
    try {
      if (fs.existsSync(dockerPath)) {
        const val = fs.readFileSync(dockerPath, 'utf8').trim();
        if (val) return { value: val, source: 'docker_secret', sourcePath: dockerPath };
      }
    } catch {}

    // 5. secrets/ directory
    const secretPaths = [
      path.join(SECRETS_DIR, 'ota_signing_key'),
      path.join(SECRETS_DIR, 'ota_signing_key.pem'),
    ];
    for (const p of secretPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val) return { value: val, source: 'secrets_file', sourcePath: p };
        }
      } catch {}
    }

    // 6. data/ directory
    const dataPath = path.join(DATA_DIR, '.ota_signing_key');
    try {
      if (fs.existsSync(dataPath)) {
        const val = fs.readFileSync(dataPath, 'utf8').trim();
        if (val) return { value: val, source: 'data_file', sourcePath: dataPath };
      }
    } catch {}

    return { value: '', source: 'missing' };
  }

  /**
   * Returns current status of all essential system keys.
   */
  public getKeyStatuses(): SystemKeysStatusResponse {
    const jwt = this.resolveJwtSecret();
    const enc = this.resolveEncryptionKey();
    const ota = this.resolveOtaSigningKey();

    const jwtItem: KeyItemStatus = {
      keyName: 'JWT_SECRET',
      isConfigured: Boolean(jwt.value && !isWeak(jwt.value)),
      source: jwt.source,
      sourcePath: jwt.sourcePath,
      maskedValue: mask(jwt.value),
      isWeakOrDefault: Boolean(jwt.value && isWeak(jwt.value)),
      requiredForProduction: true,
      description: 'Kullanıcı oturumları ve API token imzalama anahtarı (HMAC-SHA256).',
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
   * - Newly generated keys are saved to `secrets/` and/or `data/` and applied to `process.env`.
   */
  public generateMissingKeys(): GeneratedKeyResult {
    this.ensureDirectoriesExist();

    const currentJwt = this.resolveJwtSecret();
    const currentEnc = this.resolveEncryptionKey();
    const currentOta = this.resolveOtaSigningKey();

    const newlyGenerated: GeneratedKeyResult['newlyGenerated'] = {};
    const preservedKeys: GeneratedKeyResult['preservedKeys'] = {
      jwtSecret: false,
      encryptionKey: false,
      otaSigningKey: false,
    };
    const savedLocations: string[] = [];

    // 1. JWT_SECRET
    if (currentJwt.value && !isWeak(currentJwt.value)) {
      preservedKeys.jwtSecret = true;
      systemLogger.info('security', `[SystemKeys] Mevcut JWT_SECRET korundu (${currentJwt.source}). Yeniden üretilmedi.`);
      // Auto-migrate to Vault if not yet present in Vault
      if (currentJwt.source !== 'vault') {
        systemSecretsService.setSecret('authentication.jwt_secret', currentJwt.value, {
          category: 'authentication',
          label: 'JWT Secret',
          description: 'Oturum ve API token imzalama anahtarı',
        }).catch(() => {});
      }
    } else {
      const generatedJwt = crypto.randomBytes(32).toString('hex');
      newlyGenerated.jwtSecret = generatedJwt;
      process.env.JWT_SECRET = generatedJwt;
      process.env.SESSION_SECRET = generatedJwt;

      systemSecretsService.setSecret('authentication.jwt_secret', generatedJwt, {
        category: 'authentication',
        label: 'JWT Secret',
        description: 'Oturum ve API token imzalama anahtarı',
      }).catch(() => {});

      const secretFile = path.join(SECRETS_DIR, 'jwt_secret');
      const dataFile = path.join(DATA_DIR, '.jwt_secret');
      try {
        fs.writeFileSync(secretFile, generatedJwt, { encoding: 'utf8', mode: 0o600 });
        savedLocations.push('secrets/jwt_secret');
      } catch {}
      try {
        fs.writeFileSync(dataFile, generatedJwt, { encoding: 'utf8', mode: 0o600 });
        savedLocations.push('data/.jwt_secret');
      } catch {}
      systemLogger.info('security', '[SystemKeys] Yeni kriptografik JWT_SECRET üretildi ve Vault kasasına kaydedildi.');
    }

    // 2. ENCRYPTION_KEY
    if (currentEnc.value && !isWeak(currentEnc.value)) {
      preservedKeys.encryptionKey = true;
      systemLogger.info('security', `[SystemKeys] Mevcut ENCRYPTION_KEY korundu (${currentEnc.source}). Yeniden üretilmedi.`);
    } else {
      const generatedEnc = crypto.randomBytes(32).toString('hex');
      newlyGenerated.encryptionKey = generatedEnc;
      process.env.ENCRYPTION_KEY = generatedEnc;

      const secretFile = path.join(SECRETS_DIR, 'encryption_key');
      const dataFile = path.join(DATA_DIR, '.vault_key');
      try {
        fs.writeFileSync(secretFile, generatedEnc, { encoding: 'utf8', mode: 0o600 });
        savedLocations.push('secrets/encryption_key');
      } catch {}
      try {
        fs.writeFileSync(dataFile, generatedEnc, { encoding: 'utf8', mode: 0o600 });
        savedLocations.push('data/.vault_key');
      } catch {}

      resetEncryptionKeyCache();
      systemLogger.info('security', '[SystemKeys] Yeni kriptografik ENCRYPTION_KEY üretildi ve Vault sıfırlandı.');
    }

    // 3. OTA_SIGNING_KEY
    if (currentOta.value && currentOta.value.length > 30) {
      preservedKeys.otaSigningKey = true;
      systemLogger.info('security', `[SystemKeys] Mevcut OTA_SIGNING_KEY korundu (${currentOta.source}). Yeniden üretilmedi.`);
      // Auto-migrate to Vault if not yet in Vault
      if (currentOta.source !== 'vault') {
        systemSecretsService.setSecret('ota.signing_key', currentOta.value, {
          category: 'ota',
          label: 'OTA Imzalama Özel Anahtarı',
          description: 'Ed25519 firmware paketi imzalama özel anahtarı',
        }).catch(() => {});
      }
    } else {
      try {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          publicKeyEncoding: { type: 'spki', format: 'pem' },
        });

        newlyGenerated.otaSigningKey = privateKey;
        newlyGenerated.otaPublicKey = publicKey;

        systemSecretsService.setSecret('ota.signing_key', privateKey, {
          category: 'ota',
          label: 'OTA Imzalama Özel Anahtarı',
          description: 'Ed25519 firmware paketi imzalama özel anahtarı',
        }).catch(() => {});

        const privFile = path.join(SECRETS_DIR, 'ota_signing_key.pem');
        const pubFile = path.join(SECRETS_DIR, 'ota_signing_key.pub');
        const dataPrivFile = path.join(DATA_DIR, '.ota_signing_key');

        try {
          fs.writeFileSync(privFile, privateKey, { encoding: 'utf8', mode: 0o600 });
          savedLocations.push('secrets/ota_signing_key.pem');
          fs.writeFileSync(pubFile, publicKey, { encoding: 'utf8', mode: 0o644 });
          savedLocations.push('secrets/ota_signing_key.pub');
        } catch {}
        try {
          fs.writeFileSync(dataPrivFile, privateKey, { encoding: 'utf8', mode: 0o600 });
        } catch {}

        process.env.OTA_SIGNING_PRIVATE_KEY_PATH = privFile;
        systemLogger.info('security', '[SystemKeys] Yeni Ed25519 OTA imzalama anahtarı üretildi ve Vault kasasına kaydedildi.');
      } catch (err: any) {
        systemLogger.warn('security', `OTA anahtarı üretilirken hata: ${err?.message || err}`);
      }
    }

    // 4. Update .env if present and writable
    this.updateEnvFileWithGeneratedKeys(newlyGenerated);

    // 5. Generate formatted .env snippet for copying
    const envSnippet = this.generateExportableEnvSnippet();

    return {
      success: true,
      message: 'Gerekli güvenlik anahtarları başarıyla doğrulandı ve üretildi.',
      newlyGenerated,
      preservedKeys,
      envSnippet,
      savedLocations,
    };
  }

  private updateEnvFileWithGeneratedKeys(keys: GeneratedKeyResult['newlyGenerated']): void {
    try {
      if (!fs.existsSync(ENV_FILE)) return;
      let envContent = fs.readFileSync(ENV_FILE, 'utf8');
      let modified = false;

      if (keys.jwtSecret) {
        if (/^JWT_SECRET=/m.test(envContent)) {
          envContent = envContent.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${keys.jwtSecret}`);
        } else {
          envContent += `\nJWT_SECRET=${keys.jwtSecret}\n`;
        }
        modified = true;
      }

      if (keys.encryptionKey) {
        if (/^ENCRYPTION_KEY=/m.test(envContent)) {
          envContent = envContent.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${keys.encryptionKey}`);
        } else {
          envContent += `\nENCRYPTION_KEY=${keys.encryptionKey}\n`;
        }
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(ENV_FILE, envContent, 'utf8');
        systemLogger.info('security', '[SystemKeys] Kök .env dosyası yeni anahtarlarla güncellendi.');
      }
    } catch {}
  }

  /**
   * Returns a ready-to-use .env snippet containing all current active keys for operator copy.
   */
  public generateExportableEnvSnippet(): string {
    const jwt = this.resolveJwtSecret().value;
    const enc = this.resolveEncryptionKey().value;
    const ota = this.resolveOtaSigningKey().value;

    const lines: string[] = [
      '# ==============================================================================',
      '# NexusNode IoT - Otomatik Üretilen / Aktif Sistem Güvenlik Anahtarları',
      '# ==============================================================================',
    ];

    if (jwt) {
      lines.push(`JWT_SECRET=${jwt}`);
      lines.push(`SESSION_SECRET=${jwt}`);
    }
    if (enc) {
      lines.push(`ENCRYPTION_KEY=${enc}`);
    }
    if (ota) {
      lines.push('OTA_SIGNING_PRIVATE_KEY_PATH=/run/secrets/ota_signing_key # veya secrets/ota_signing_key.pem');
    }

    return lines.join('\n');
  }

  /**
   * For VPS CLI export (`npm run show-keys`):
   * Inspects all active keys and returns their full details and .env configuration.
   */
  public getFullExportDetails(): {
    jwtSecret: { value: string; source: string; isConfigured: boolean };
    encryptionKey: { value: string; source: string; isConfigured: boolean };
    otaSigningKey: { hasPrivateKey: boolean; source: string; isConfigured: boolean };
    envSnippet: string;
  } {
    const jwt = this.resolveJwtSecret();
    const enc = this.resolveEncryptionKey();
    const ota = this.resolveOtaSigningKey();

    return {
      jwtSecret: {
        value: jwt.value,
        source: jwt.source,
        isConfigured: Boolean(jwt.value && !isWeak(jwt.value)),
      },
      encryptionKey: {
        value: enc.value,
        source: enc.source,
        isConfigured: Boolean(enc.value && !isWeak(enc.value)),
      },
      otaSigningKey: {
        hasPrivateKey: Boolean(ota.value),
        source: ota.source,
        isConfigured: Boolean(ota.value),
      },
      envSnippet: this.generateExportableEnvSnippet(),
    };
  }
}

export const systemKeysService = SystemKeysService.getInstance();
