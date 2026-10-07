import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptSecret, decryptSecret, maskSecret, isMaskedSecret, sanitizeLogString as sanitizeLogUtil, getVaultStatus } from '../utils/crypto.js';
import { systemLogger } from './systemLogger.service.js';

export type SecretCategory =
  | 'database'
  | 'email'
  | 'notifications'
  | 'authentication'
  | 'iot'
  | 'mqtt'
  | 'ota'
  | 'webhook'
  | 'third_party'
  | 'custom';

export interface StoredSecretVersion {
  keyId: string;
  encryptedValue: string;
  version: number;
  retiredAt: string;
}

export interface StoredSecretRecord {
  key: string;
  category: SecretCategory;
  label: string;
  description?: string;
  encryptedValue: string; // AES-256-GCM ciphertext (enc:v1:...)
  isSensitive: boolean;
  keyId?: string;
  version?: number;
  previousVersions?: StoredSecretVersion[];
  updatedAt: string;
  updatedBy?: string;
}

export interface PublicSecretItemSummary {
  key: string;
  category: SecretCategory;
  label: string;
  description?: string;
  isConfigured: boolean;
  maskedValue: string;
  source: 'vault' | 'environment' | 'not_set';
  updatedAt?: string;
}

export interface PublicDatabaseSecretsSummary {
  host: string;
  port: number;
  database: string;
  user: string;
  sslMode: string;
  isConfigured: boolean;
  hasPassword: boolean;
  passwordMasked: string;
  source: 'vault' | 'environment' | 'not_set';
}

export interface PublicEmailSecretsSummary {
  provider: 'resend' | 'smtp' | 'simulated';
  fromEmail: string;
  fromName: string;
  appBaseUrl: string;
  hasResendApiKey: boolean;
  resendApiKeyMasked: string;
  resendSource: 'vault' | 'environment' | 'not_set';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPass: boolean;
  smtpPassMasked: string;
  smtpSource: 'vault' | 'environment' | 'not_set';
  isConfigured: boolean;
}

export interface PublicNotificationSecretsSummary {
  telegram: {
    enabled: boolean;
    hasBotToken: boolean;
    botTokenMasked: string;
    chatId: string;
    source: 'vault' | 'environment' | 'not_set';
  };
  whatsapp: {
    enabled: boolean;
    hasApiToken: boolean;
    apiTokenMasked: string;
    phoneNumberId: string;
    source: 'vault' | 'environment' | 'not_set';
  };
  webhook: {
    enabled: boolean;
    hasSecretHeader: boolean;
    secretHeaderMasked: string;
    defaultEndpoint: string;
    source: 'vault' | 'environment' | 'not_set';
  };
}

export interface PublicSystemKeyItemSummary {
  keyName: string;
  isConfigured: boolean;
  source: 'vault' | 'environment' | 'secrets_file' | 'missing' | 'docker_secret' | 'env' | 'data_file';
  inVault: boolean;
  maskedValue: string;
  description: string;
  keyId?: string;
  version?: number;
  rotatable?: boolean;
}

export interface PublicSystemKeysSummary {
  allConfigured: boolean;
  vaultConfigured: boolean;
  vaultSource: string;
  keys: {
    encryptionKey: PublicSystemKeyItemSummary;
    otaSigningKey: PublicSystemKeyItemSummary;
  };
}

export interface PublicMigrationStatusSummary {
  status: 'complete' | 'pending' | 'clean';
  authoritativeSource: string;
  hasLegacyFiles: boolean;
  hasUnmigratedEnv: boolean;
  legacyFilesDetected: string[];
  unmigratedEnvKeys: string[];
  vaultKeysCount: number;
  details: string;
}

export interface PublicSystemSecretsState {
  database: PublicDatabaseSecretsSummary;
  email: PublicEmailSecretsSummary;
  notifications: PublicNotificationSecretsSummary;
  customSecrets: PublicSecretItemSummary[];
  systemKeys?: PublicSystemKeysSummary;
  migrationStatus?: PublicMigrationStatusSummary;
  updatedAt?: string;
}

export interface DatabaseSecretsUpdateInput {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode?: string;
}

export interface EmailSecretsUpdateInput {
  provider?: 'resend' | 'smtp' | 'simulated';
  fromEmail?: string;
  fromName?: string;
  appBaseUrl?: string;
  resendApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
}

export interface NotificationSecretsUpdateInput {
  telegram?: {
    enabled?: boolean;
    botToken?: string;
    chatId?: string;
  };
  whatsapp?: {
    enabled?: boolean;
    apiToken?: string;
    phoneNumberId?: string;
  };
  webhook?: {
    enabled?: boolean;
    secretHeader?: string;
    defaultEndpoint?: string;
  };
}

export interface CustomSecretInput {
  key: string;
  label: string;
  description?: string;
  category?: 'third_party' | 'custom';
  value: string;
}

const VAULT_DIR = path.resolve(process.cwd(), 'data');

export function getVaultFilePath(): string {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  return path.join(VAULT_DIR, isTest ? '.system_secrets.test.json' : '.system_secrets.json');
}

export class SystemSecretsService {
  private static instance: SystemSecretsService;
  private inMemorySecrets: Map<string, StoredSecretRecord> = new Map();
  private isLoaded = false;

  private constructor() {
    this.loadFromLocalVault();
  }

  public static getInstance(): SystemSecretsService {
    if (!SystemSecretsService.instance) {
      SystemSecretsService.instance = new SystemSecretsService();
    }
    return SystemSecretsService.instance;
  }

  /**
   * Loads secrets from local protected vault file (data/.system_secrets.json)
   */
  public loadFromLocalVault(): void {
    try {
      const vaultPath = getVaultFilePath();
      if (fs.existsSync(vaultPath)) {
        const raw = fs.readFileSync(vaultPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const records: Record<string, StoredSecretRecord> = parsed.secrets || {};
          this.inMemorySecrets.clear();
          for (const [key, item] of Object.entries(records)) {
            if (item && item.key && item.encryptedValue) {
              this.inMemorySecrets.set(key, item);
            }
          }
          this.isLoaded = true;
          return;
        }
      }
    } catch (err: any) {
      systemLogger.warn('security', `Lokal secret kasası okunamadı: ${err?.message || err}`);
    }
    this.isLoaded = true;
  }

  /**
   * Persists local vault snapshot to PostgreSQL system_settings as a secondary backup.
   * Local Vault (data/.system_secrets.json) is strictly the ONLY authoritative store.
   * PostgreSQL never overwrites local vault.
   */
  public async syncWithPostgres(postgresRepo: any): Promise<void> {
    if (!postgresRepo || typeof postgresRepo.isReady !== 'function' || !postgresRepo.isReady()) {
      return;
    }

    try {
      if (this.inMemorySecrets.size > 0) {
        // One-way backup mirror to PostgreSQL (Local Vault remains strictly authoritative)
        await this.persistToPostgres(postgresRepo);
      }
    } catch (err: any) {
      systemLogger.warn('security', `PostgreSQL secret yedekleme uyarısı: ${err?.message || err}`);
    }
  }

  /**
   * Persists in-memory secrets to PostgreSQL system_settings
   */
  private async persistToPostgres(postgresRepo?: any): Promise<void> {
    if (!postgresRepo) {
      try {
        const { db } = await import('../db.js');
        postgresRepo = db.postgresRepo;
      } catch {}
    }

    if (postgresRepo && typeof postgresRepo.isReady === 'function' && postgresRepo.isReady()) {
      try {
        const obj: Record<string, StoredSecretRecord> = {};
        for (const [k, v] of this.inMemorySecrets.entries()) {
          obj[k] = v;
        }
        await postgresRepo.saveSystemSetting('vault_system_secrets', {
          version: 1,
          updatedAt: new Date().toISOString(),
          secrets: obj,
        });
      } catch (err: any) {
        systemLogger.warn('security', `PostgreSQL secret kasası güncellenemedi: ${err?.message || err}`);
      }
    }
  }

  /**
   * Persists in-memory secrets to disk with strict POSIX 0o600 permissions
   */
  private saveToLocalVault(): void {
    try {
      if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
      }

      const obj: Record<string, StoredSecretRecord> = {};
      for (const [k, v] of this.inMemorySecrets.entries()) {
        obj[k] = v;
      }

      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        secrets: obj,
      };

      const vaultPath = getVaultFilePath();
      fs.writeFileSync(vaultPath, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      try {
        fs.chmodSync(vaultPath, 0o600);
      } catch {}
    } catch (err: any) {
      systemLogger.error('security', `Lokal secret kasası kaydedilemedi: ${err?.message || err}`);
      throw new Error(`Secret kasası dosyaya yazılamadı: ${err?.message || err}`, { cause: err });
    }
  }

  /**
   * Internal method: gets decrypted plaintext secret by key
   */
  public getSecret(key: string): string | null {
    if (!this.isLoaded) this.loadFromLocalVault();
    const item = this.inMemorySecrets.get(key);
    if (item && item.encryptedValue) {
      const decrypted = decryptSecret(item.encryptedValue);
      if (decrypted) return decrypted;
    }
    return null;
  }

  /**
   * Internal method: sets an encrypted secret in the vault
   */
  public async setSecret(
    key: string,
    plainValue: string,
    meta: {
      category: SecretCategory;
      label: string;
      description?: string;
      isSensitive?: boolean;
      updatedBy?: string;
      keyId?: string;
      version?: number;
    }
  ): Promise<void> {
    if (!this.isLoaded) this.loadFromLocalVault();

    // If masked, do not overwrite existing
    if (isMaskedSecret(plainValue)) {
      return;
    }

    // Security constraint: Encryption key and ciphertext must NEVER share the same storage boundary!
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === 'encryption_key' ||
      lowerKey === 'encryptionkey' ||
      lowerKey.includes('master_key') ||
      lowerKey.includes('vault_key')
    ) {
      throw new Error('Encryption key cannot be stored inside the secret vault. Encryption key and ciphertext must remain in separate security boundaries.');
    }

    const trimmed = plainValue ? plainValue.trim() : '';
    if (!trimmed) {
      // Clear secret if empty string explicitly provided
      if (this.inMemorySecrets.has(key)) {
        this.inMemorySecrets.delete(key);
        this.saveToLocalVault();
        await this.persistToPostgres();
      }
      return;
    }

    const existing = this.inMemorySecrets.get(key);
    const version = meta.version ?? existing?.version ?? 1;
    const defaultKeyId = `${key.replace(/[^a-zA-Z0-9]/g, '_')}_v${version}`;
    const keyId = meta.keyId ?? existing?.keyId ?? defaultKeyId;

    const encrypted = encryptSecret(trimmed);
    const record: StoredSecretRecord = {
      key,
      category: meta.category,
      label: meta.label,
      description: meta.description,
      encryptedValue: encrypted,
      isSensitive: meta.isSensitive ?? true,
      keyId,
      version,
      previousVersions: existing?.previousVersions,
      updatedAt: new Date().toISOString(),
      updatedBy: meta.updatedBy,
    };

    this.inMemorySecrets.set(key, record);
    this.saveToLocalVault();
    await this.persistToPostgres();
  }

  /**
   * Returns full internal record of a secret including version and keyId
   */
  public getSecretRecord(key: string): StoredSecretRecord | null {
    if (!this.isLoaded) this.loadFromLocalVault();
    return this.inMemorySecrets.get(key) || null;
  }

  /**
   * Rotates an existing secret to a new cryptographically generated or provided value.
   * Archives previous version in previousVersions array for grace periods (e.g. JWT token validation).
   */
  public async rotateSecret(
    key: string,
    newPlainValue: string,
    meta?: {
      keyId?: string;
      description?: string;
      updatedBy?: string;
    }
  ): Promise<{ success: boolean; oldKeyId?: string; newKeyId: string; version: number }> {
    if (!this.isLoaded) this.loadFromLocalVault();

    const trimmed = newPlainValue ? newPlainValue.trim() : '';
    if (!trimmed) {
      throw new Error('Döndürülecek anahtar değeri boş olamaz.');
    }

    const existing = this.inMemorySecrets.get(key);
    const oldVersion = existing?.version || 1;
    const newVersion = oldVersion + 1;
    const oldKeyId = existing?.keyId || `${key.replace(/[^a-zA-Z0-9]/g, '_')}_v${oldVersion}`;
    const newKeyId = meta?.keyId || `${key.replace(/[^a-zA-Z0-9]/g, '_')}_v${newVersion}`;

    const previousVersions: StoredSecretVersion[] = existing?.previousVersions ? [...existing.previousVersions] : [];
    if (existing?.encryptedValue) {
      previousVersions.unshift({
        keyId: oldKeyId,
        encryptedValue: existing.encryptedValue,
        version: oldVersion,
        retiredAt: new Date().toISOString(),
      });
      // Keep maximum 5 previous versions for token grace periods
      if (previousVersions.length > 5) {
        previousVersions.length = 5;
      }
    }

    const encrypted = encryptSecret(trimmed);
    const updatedRecord: StoredSecretRecord = {
      key,
      category: existing?.category || 'custom',
      label: existing?.label || key,
      description: meta?.description || existing?.description,
      encryptedValue: encrypted,
      isSensitive: existing?.isSensitive ?? true,
      keyId: newKeyId,
      version: newVersion,
      previousVersions,
      updatedAt: new Date().toISOString(),
      updatedBy: meta?.updatedBy || 'key_rotation',
    };

    this.inMemorySecrets.set(key, updatedRecord);
    this.saveToLocalVault();
    await this.persistToPostgres();

    systemLogger.info('security', `[KeyRotation] '${key}' anahtarı döndürüldü. Eski: ${oldKeyId} (v${oldVersion}) -> Yeni: ${newKeyId} (v${newVersion})`);

    return {
      success: true,
      oldKeyId,
      newKeyId,
      version: newVersion,
    };
  }

  /**
   * Retrieves previous decrypted secret versions for grace period token/signature verification
   */
  public getPreviousSecrets(key: string): Array<{ keyId: string; value: string; version: number; retiredAt: string }> {
    if (!this.isLoaded) this.loadFromLocalVault();
    const item = this.inMemorySecrets.get(key);
    if (!item || !item.previousVersions || item.previousVersions.length === 0) {
      return [];
    }

    const results: Array<{ keyId: string; value: string; version: number; retiredAt: string }> = [];
    for (const prev of item.previousVersions) {
      try {
        const decrypted = decryptSecret(prev.encryptedValue);
        if (decrypted) {
          results.push({
            keyId: prev.keyId,
            value: decrypted,
            version: prev.version,
            retiredAt: prev.retiredAt,
          });
        }
      } catch {}
    }
    return results;
  }

  /**
   * Removes a secret from vault
   */
  public async deleteSecret(key: string): Promise<boolean> {
    if (!this.isLoaded) this.loadFromLocalVault();
    if (this.inMemorySecrets.has(key)) {
      this.inMemorySecrets.delete(key);
      this.saveToLocalVault();
      await this.persistToPostgres();
      return true;
    }
    return false;
  }

  // ============================================================================
  // DATABASE SECRETS ACCESSORS & RESOLVERS
  // ============================================================================

  public getDatabasePassword(): string {
    const fromVault = this.getSecret('database.password');
    if (fromVault) return fromVault;

    // Check Docker secrets & local secret mounts fallback
    const dockerSecretPaths = [
      '/run/secrets/db_password',
      '/run/secrets/postgres_password',
      path.join(process.cwd(), 'secrets', 'db_password'),
      path.join(process.cwd(), 'secrets', 'postgres_password'),
    ];
    for (const p of dockerSecretPaths) {
      try {
        if (fs.existsSync(p)) {
          const val = fs.readFileSync(p, 'utf8').trim();
          if (val) return val;
        }
      } catch {}
    }

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault or mounted secret is required
      return '';
    }

    // Non-production (development / test) local fallback
    return (process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '').trim();
  }

  public getDatabaseConfig(): {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslMode: string;
    isConfigured: boolean;
  } {
    const host = this.getSecret('database.host') || process.env.POSTGRES_HOST || process.env.DB_HOST || '';
    const port = Number(this.getSecret('database.port') || process.env.POSTGRES_PORT || process.env.DB_PORT || 5432);
    const database = this.getSecret('database.database') || process.env.POSTGRES_DB || process.env.DB_NAME || 'iot_dashboard';
    const user = this.getSecret('database.user') || process.env.POSTGRES_USER || process.env.DB_USER || 'iot_user';
    const password = this.getDatabasePassword();
    const sslMode = this.getSecret('database.sslMode') || 'disable';

    const isConfigured = Boolean(host && database && user && password);

    return {
      host,
      port,
      database,
      user,
      password,
      sslMode,
      isConfigured,
    };
  }

  // ============================================================================
  // EMAIL SECRETS ACCESSORS & RESOLVERS
  // ============================================================================

  public getResendApiKey(): string {
    const fromVault = this.getSecret('email.resendApiKey');
    if (fromVault && fromVault.startsWith('re_')) {
      return fromVault;
    }

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is the SINGLE CANONICAL SOURCE
      return '';
    }

    const fromEnv = (process.env.RESEND_API_KEY || '').trim();
    if (fromEnv && fromEnv.startsWith('re_')) {
      return fromEnv;
    }

    return '';
  }

  public getSmtpPassword(): string {
    const fromVault = this.getSecret('email.smtpPass');
    if (fromVault) return fromVault;

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is the SINGLE CANONICAL SOURCE
      return '';
    }

    return (process.env.SMTP_PASS || '').trim();
  }

  // ============================================================================
  // AUTHENTICATION & SECURITY KEYS ACCESSORS & RESOLVERS
  // ============================================================================

  public getJwtSecret(): string {
    const fromVault = this.getSecret('authentication.jwt_secret') || this.getSecret('jwt_secret');
    if (fromVault) return fromVault;

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is the SINGLE CANONICAL SOURCE
      return '';
    }

    return (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
  }

  public getOtaSigningKey(): string {
    const fromVault = this.getSecret('ota.signing_key') || this.getSecret('ota_signing_key');
    if (fromVault) return fromVault;

    const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
    if (isProd) {
      // In production runtime: Security Vault is the SINGLE CANONICAL SOURCE
      return '';
    }

    return (process.env.OTA_SIGNING_PRIVATE_KEY || '').trim();
  }

  /**
   * Central, authoritative generator and accessor for Ed25519 OTA firmware signing private key.
   * Root-of-Trust Rule: Strictly generated ONCE and persisted to encrypted Vault (ota.signing_key).
   * Never generated across multiple disparate places.
   * If persistence fails, the key is NEVER used (fail-closed).
   */
  public async ensureOtaSigningKey(): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
    const existingKey = this.getOtaSigningKey();
    if (existingKey && (existingKey.includes('PRIVATE KEY') || existingKey.length > 30)) {
      try {
        const privKeyObj = crypto.createPrivateKey(existingKey.replace(/\\n/g, '\n'));
        const pubKeyObj = crypto.createPublicKey(privKeyObj);
        return {
          privateKeyPem: existingKey.replace(/\\n/g, '\n'),
          publicKeyPem: pubKeyObj.export({ type: 'spki', format: 'pem' }).toString(),
        };
      } catch (err: any) {
        systemLogger.error('ota', `Vault OTA anahtarı ayrıştırılamadı: ${err?.message || err}`);
      }
    }

    // Generate fresh Ed25519 keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    // Write to Vault and strictly await persistence confirmation
    await this.setSecret('ota.signing_key', privateKey, {
      category: 'ota',
      label: 'OTA Imzalama Özel Anahtarı',
      description: 'Ed25519 firmware paketi imzalama özel anahtarı (Vault-managed)',
      isSensitive: true,
      updatedBy: 'system_bootstrap',
    });

    const verified = this.getSecret('ota.signing_key');
    if (!verified || verified !== privateKey) {
      throw new Error('[OTA Security] OTA imzalama anahtarı Security Vault kasasına yazılamadı veya doğrulanamadı. İşlem durduruldu.');
    }

    // Write public key file if directory exists (public key is non-sensitive)
    try {
      const secretsDir = path.join(process.cwd(), 'secrets');
      if (fs.existsSync(secretsDir)) {
        fs.writeFileSync(path.join(secretsDir, 'ota_signing_key.pub'), publicKey, { encoding: 'utf8', mode: 0o644 });
      }
    } catch {}

    systemLogger.info('security', '[OTA Security] Yeni Ed25519 OTA imzalama anahtarı üretildi ve Vault kasasına kalıcı olarak mühürlendi.');
    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
  }

  /**
   * Explicit one-way migration for legacy plaintext sources into Central Security Vault.
   * Reads legacy source, validates, encrypts into Vault, verifies from Vault, and scrubs legacy plaintext.
   * If legacy files cannot be deleted due to read-only mounts, explicitly logs and reports them.
   */
  public async migrateLegacySecrets(): Promise<{
    migratedCount: number;
    keys: string[];
    scrubbedFiles?: string[];
    readOnlyFiles?: string[];
    warning?: string;
  }> {
    const migratedKeys: string[] = [];
    const scrubbedFiles: string[] = [];
    const readOnlyFiles: string[] = [];

    const tryScrubLegacyFile = (filePath: string) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          scrubbedFiles.push(filePath);
        } catch (err: any) {
          readOnlyFiles.push(filePath);
          systemLogger.warn('security', `[Migration] Legacy dosya (${filePath}) salt okunur (read-only) mount veya yetki nedeniyle silinemedi: ${err?.message || err}`);
        }
      }
    };

    // 1. DB password & connection from legacy Docker secret, .db_config.json, or environment
    let dbPasswordCandidate = '';
    let dbPasswordLegacyFile = '';
    const secretPaths = [
      path.join(process.cwd(), 'secrets', 'postgres_password'),
      path.join(process.cwd(), 'secrets', 'db_password'),
      path.join(process.cwd(), 'data', '.postgres_password'),
      path.join(process.cwd(), 'data', '.db_password'),
      '/run/secrets/postgres_password',
      '/run/secrets/db_password',
    ];
    for (const p of secretPaths) {
      try {
        if (fs.existsSync(p)) {
          const v = fs.readFileSync(p, 'utf8').trim();
          if (v) {
            dbPasswordCandidate = v;
            dbPasswordLegacyFile = p;
            break;
          }
        }
      } catch {}
    }

    const dbConfigPath = path.join(process.cwd(), 'data', '.db_config.json');
    if (!dbPasswordCandidate && fs.existsSync(dbConfigPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(dbConfigPath, 'utf8'));
        if (raw.password && typeof raw.password === 'string' && !raw.password.includes('••••')) {
          dbPasswordCandidate = raw.password.trim();
        }
      } catch {}
    }

    if (!dbPasswordCandidate && process.env.DATABASE_URL) {
      try {
        const parsed = new URL(process.env.DATABASE_URL.replace(/^postgres(ql)?:\/\//i, 'http://'));
        if (parsed.password) {
          dbPasswordCandidate = decodeURIComponent(parsed.password).trim();
        }
      } catch {}
    }

    if (!dbPasswordCandidate && process.env.POSTGRES_PASSWORD) {
      dbPasswordCandidate = process.env.POSTGRES_PASSWORD.trim();
    }

    if (!dbPasswordCandidate && process.env.DB_PASSWORD) {
      dbPasswordCandidate = process.env.DB_PASSWORD.trim();
    }

    if (dbPasswordCandidate) {
      const existingVaultPass = this.getSecret('database.password');
      if (!existingVaultPass || existingVaultPass !== dbPasswordCandidate) {
        await this.setSecret('database.password', dbPasswordCandidate, {
          category: 'database',
          label: 'PostgreSQL Password',
          isSensitive: true,
          updatedBy: 'legacy_migration',
        });
      }
      // Verify written value from Vault
      if (this.getSecret('database.password') === dbPasswordCandidate) {
        if (!migratedKeys.includes('database.password')) migratedKeys.push('database.password');
        systemLogger.info('security', '[Migration] PostgreSQL parolası Vault kasasına aktarıldı ve doğrulandı.');

        // Scrub legacy files once verified in Vault
        if (dbPasswordLegacyFile && !dbPasswordLegacyFile.startsWith('/run/secrets/')) {
          tryScrubLegacyFile(dbPasswordLegacyFile);
        }
        // Also scrub mirror secrets/db_password if present
        const dbMirror = path.join(process.cwd(), 'secrets', 'db_password');
        if (fs.existsSync(dbMirror) && dbMirror !== dbPasswordLegacyFile) {
          tryScrubLegacyFile(dbMirror);
        }
        // Clean password from .db_config.json
        if (fs.existsSync(dbConfigPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(dbConfigPath, 'utf8'));
            if (raw.password) {
              const scrubbed = { ...raw };
              delete scrubbed.password;
              scrubbed.passwordRef = 'vault:database.password';
              fs.writeFileSync(dbConfigPath, JSON.stringify(scrubbed, null, 2), { mode: 0o600 });
            }
          } catch {}
        }
      }
    }

    // 1.1 Migrate database coordinates if in .db_config.json or environment
    if (fs.existsSync(dbConfigPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(dbConfigPath, 'utf8'));
        if (raw.host && !this.getSecret('database.host')) {
          await this.setSecret('database.host', String(raw.host), { category: 'database', label: 'PostgreSQL Host', isSensitive: false, updatedBy: 'legacy_migration' });
          migratedKeys.push('database.host');
        }
        if (raw.port && !this.getSecret('database.port')) {
          await this.setSecret('database.port', String(raw.port), { category: 'database', label: 'PostgreSQL Port', isSensitive: false, updatedBy: 'legacy_migration' });
          migratedKeys.push('database.port');
        }
        if (raw.database && !this.getSecret('database.database')) {
          await this.setSecret('database.database', String(raw.database), { category: 'database', label: 'PostgreSQL Database', isSensitive: false, updatedBy: 'legacy_migration' });
          migratedKeys.push('database.database');
        }
        if (raw.user && !this.getSecret('database.user')) {
          await this.setSecret('database.user', String(raw.user), { category: 'database', label: 'PostgreSQL User', isSensitive: false, updatedBy: 'legacy_migration' });
          migratedKeys.push('database.user');
        }
        if (raw.sslMode && !this.getSecret('database.sslMode')) {
          await this.setSecret('database.sslMode', String(raw.sslMode), { category: 'database', label: 'PostgreSQL SSL Mode', isSensitive: false, updatedBy: 'legacy_migration' });
          migratedKeys.push('database.sslMode');
        }
      } catch {}
    }

    if (!this.getSecret('database.host') && (process.env.POSTGRES_HOST || process.env.DB_HOST)) {
      const hostVal = (process.env.POSTGRES_HOST || process.env.DB_HOST || '').trim();
      if (hostVal) {
        await this.setSecret('database.host', hostVal, { category: 'database', label: 'PostgreSQL Host', isSensitive: false, updatedBy: 'legacy_migration' });
        migratedKeys.push('database.host');
      }
    }
    if (!this.getSecret('database.database') && (process.env.POSTGRES_DB || process.env.DB_NAME)) {
      const dbVal = (process.env.POSTGRES_DB || process.env.DB_NAME || '').trim();
      if (dbVal) {
        await this.setSecret('database.database', dbVal, { category: 'database', label: 'PostgreSQL Database', isSensitive: false, updatedBy: 'legacy_migration' });
        migratedKeys.push('database.database');
      }
    }
    if (!this.getSecret('database.user') && (process.env.POSTGRES_USER || process.env.DB_USER)) {
      const userVal = (process.env.POSTGRES_USER || process.env.DB_USER || '').trim();
      if (userVal) {
        await this.setSecret('database.user', userVal, { category: 'database', label: 'PostgreSQL User', isSensitive: false, updatedBy: 'legacy_migration' });
        migratedKeys.push('database.user');
      }
    }

    // 2. JWT Secret from legacy files or environment
    if (!this.getSecret('authentication.jwt_secret') && !this.getSecret('jwt_secret')) {
      let candidate = '';
      let legacyFilePath = '';
      const fileCandidates = [
        path.join(process.cwd(), 'secrets', 'jwt_secret'),
        path.join(process.cwd(), 'data', '.jwt_secret'),
        path.join(process.cwd(), 'secrets', 'session_secret'),
        path.join(process.cwd(), 'data', '.session_secret'),
      ];
      for (const p of fileCandidates) {
        if (fs.existsSync(p)) {
          try {
            const v = fs.readFileSync(p, 'utf8').trim();
            if (v && v.length >= 16) {
              candidate = v;
              legacyFilePath = p;
              break;
            }
          } catch {}
        }
      }
      if (!candidate && process.env.JWT_SECRET) {
        candidate = process.env.JWT_SECRET.trim();
      }
      if (!candidate && process.env.SESSION_SECRET) {
        candidate = process.env.SESSION_SECRET.trim();
      }
      if (candidate && candidate.length >= 16) {
        await this.setSecret('authentication.jwt_secret', candidate, {
          category: 'authentication',
          label: 'JWT Secret',
          isSensitive: true,
          updatedBy: 'legacy_migration',
        });
        if (this.getSecret('authentication.jwt_secret') === candidate) {
          migratedKeys.push('authentication.jwt_secret');
          if (legacyFilePath) {
            tryScrubLegacyFile(legacyFilePath);
          }
          systemLogger.info('security', '[Migration] JWT secret Vault kasasına aktarıldı ve doğrulandı.');
        }
      }
    }

    // 3. OTA Private Key from legacy files or environment
    if (!this.getSecret('ota.signing_key') && !this.getSecret('ota_signing_key')) {
      let candidate = '';
      let legacyFilePath = '';
      const fileCandidates = [
        path.join(process.cwd(), 'secrets', 'ota_signing_key'),
        path.join(process.cwd(), 'secrets', 'ota_signing_key.pem'),
        path.join(process.cwd(), 'data', '.ota_signing_key'),
        path.join(process.cwd(), 'uploads', 'keys', 'ed25519_private.pem'),
        '/run/secrets/ota_signing_key',
      ];
      for (const p of fileCandidates) {
        if (fs.existsSync(p)) {
          try {
            const v = fs.readFileSync(p, 'utf8').trim();
            if (v && (v.includes('PRIVATE KEY') || v.length > 30)) {
              candidate = v;
              legacyFilePath = p;
              break;
            }
          } catch {}
        }
      }
      if (!candidate && process.env.OTA_SIGNING_PRIVATE_KEY) {
        candidate = process.env.OTA_SIGNING_PRIVATE_KEY.trim();
      }

      // Single-Key Architecture: If no external key was provided, automatically generate
      // and securely seal an Ed25519 keypair inside the Vault!
      if (!candidate && getVaultStatus().configured) {
        try {
          const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
          });
          candidate = privateKey;
          try {
            const secretsDir = path.join(process.cwd(), 'secrets');
            if (!fs.existsSync(secretsDir)) fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
            const pubFile = path.join(secretsDir, 'ota_signing_key.pub');
            fs.writeFileSync(pubFile, publicKey, { encoding: 'utf8', mode: 0o644 });
          } catch {}
        } catch {}
      }

      if (candidate) {
        await this.setSecret('ota.signing_key', candidate, {
          category: 'ota',
          label: 'OTA Imzalama Özel Anahtarı',
          isSensitive: true,
          updatedBy: 'legacy_migration',
        });
        if (this.getSecret('ota.signing_key') === candidate) {
          migratedKeys.push('ota.signing_key');
          if (legacyFilePath && !legacyFilePath.startsWith('/run/secrets/')) {
            tryScrubLegacyFile(legacyFilePath);
          }
          systemLogger.info('security', '[Migration] OTA özel anahtarı Vault kasasına aktarıldı ve doğrulandı.');
        }
      }
    }

    // 4. Email credentials from legacy environment
    if (!this.getSecret('email.resendApiKey') && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
      await this.setSecret('email.resendApiKey', process.env.RESEND_API_KEY.trim(), {
        category: 'email',
        label: 'Resend API Key',
        isSensitive: true,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('email.resendApiKey');
    }

    if (!this.getSecret('email.smtpPass') && process.env.SMTP_PASS) {
      await this.setSecret('email.smtpPass', process.env.SMTP_PASS.trim(), {
        category: 'email',
        label: 'SMTP Password',
        isSensitive: true,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('email.smtpPass');
    }

    // 5. Notifications credentials from legacy environment
    if (!this.getSecret('notifications.telegram.botToken') && process.env.TELEGRAM_BOT_TOKEN) {
      await this.setSecret('notifications.telegram.botToken', process.env.TELEGRAM_BOT_TOKEN.trim(), {
        category: 'notifications',
        label: 'Telegram Bot Token',
        isSensitive: true,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('notifications.telegram.botToken');
    }
    if (!this.getSecret('notifications.telegram.chatId') && process.env.TELEGRAM_CHAT_ID) {
      await this.setSecret('notifications.telegram.chatId', process.env.TELEGRAM_CHAT_ID.trim(), {
        category: 'notifications',
        label: 'Telegram Chat ID',
        isSensitive: false,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('notifications.telegram.chatId');
    }
    if (!this.getSecret('notifications.whatsapp.apiToken') && process.env.WHATSAPP_API_TOKEN) {
      await this.setSecret('notifications.whatsapp.apiToken', process.env.WHATSAPP_API_TOKEN.trim(), {
        category: 'notifications',
        label: 'WhatsApp API Token',
        isSensitive: true,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('notifications.whatsapp.apiToken');
    }
    if (!this.getSecret('notifications.webhook.secretHeader') && process.env.WEBHOOK_SECRET_HEADER) {
      await this.setSecret('notifications.webhook.secretHeader', process.env.WEBHOOK_SECRET_HEADER.trim(), {
        category: 'notifications',
        label: 'Webhook Secret Header',
        isSensitive: true,
        updatedBy: 'legacy_migration',
      });
      migratedKeys.push('notifications.webhook.secretHeader');
    }

    const warning = readOnlyFiles.length > 0
      ? `${readOnlyFiles.length} adet legacy dosya salt okunur mount nedeniyle diskten silinemedi: ${readOnlyFiles.join(', ')}`
      : undefined;

    return {
      migratedCount: migratedKeys.length,
      keys: migratedKeys,
      scrubbedFiles,
      readOnlyFiles,
      warning,
    };
  }

  /**
   * Evaluates the migration status of legacy plaintext secrets.
   * Authoritative detection of whether legacy plaintext files or unmigrated environment variables remain.
   */
  public getMigrationStatus(): PublicMigrationStatusSummary {
    if (!this.isLoaded) this.loadFromLocalVault();

    const legacyFilesDetected: string[] = [];
    const unmigratedEnvKeys: string[] = [];

    // 1. Detect legacy plaintext files on disk
    const legacyFileCandidates = [
      {
        name: 'data/.db_config.json',
        check: () => {
          const p = path.join(process.cwd(), 'data', '.db_config.json');
          if (fs.existsSync(p)) {
            try {
              const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
              return Boolean(raw.password && typeof raw.password === 'string' && !raw.password.includes('••••'));
            } catch {}
          }
          return false;
        },
      },
      { name: 'secrets/postgres_password', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'postgres_password')) },
      { name: 'secrets/db_password', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'db_password')) },
      { name: 'data/.postgres_password', check: () => fs.existsSync(path.join(process.cwd(), 'data', '.postgres_password')) },
      { name: 'data/.db_password', check: () => fs.existsSync(path.join(process.cwd(), 'data', '.db_password')) },
      { name: 'secrets/jwt_secret', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'jwt_secret')) },
      { name: 'data/.jwt_secret', check: () => fs.existsSync(path.join(process.cwd(), 'data', '.jwt_secret')) },
      { name: 'secrets/session_secret', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'session_secret')) },
      { name: 'data/.session_secret', check: () => fs.existsSync(path.join(process.cwd(), 'data', '.session_secret')) },
      { name: 'secrets/ota_signing_key', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'ota_signing_key')) },
      { name: 'secrets/ota_signing_key.pem', check: () => fs.existsSync(path.join(process.cwd(), 'secrets', 'ota_signing_key.pem')) },
      { name: 'data/.ota_signing_key', check: () => fs.existsSync(path.join(process.cwd(), 'data', '.ota_signing_key')) },
      { name: 'uploads/keys/ed25519_private.pem', check: () => fs.existsSync(path.join(process.cwd(), 'uploads', 'keys', 'ed25519_private.pem')) },
    ];

    for (const item of legacyFileCandidates) {
      if (item.check()) {
        legacyFilesDetected.push(item.name);
      }
    }

    // 2. Detect unmigrated environment variables (present in env, but absent in Vault)
    if (!this.getSecret('authentication.jwt_secret') && !this.getSecret('jwt_secret')) {
      if (process.env.JWT_SECRET || process.env.SESSION_SECRET) unmigratedEnvKeys.push('JWT_SECRET');
    }
    if (!this.getSecret('ota.signing_key') && !this.getSecret('ota_signing_key')) {
      if (process.env.OTA_SIGNING_PRIVATE_KEY) unmigratedEnvKeys.push('OTA_SIGNING_PRIVATE_KEY');
    }
    if (!this.getSecret('database.password')) {
      if (process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD) unmigratedEnvKeys.push('POSTGRES_PASSWORD');
    }
    if (!this.getSecret('email.resendApiKey')) {
      if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) unmigratedEnvKeys.push('RESEND_API_KEY');
    }
    if (!this.getSecret('email.smtpPass')) {
      if (process.env.SMTP_PASS) unmigratedEnvKeys.push('SMTP_PASS');
    }

    const hasLegacyFiles = legacyFilesDetected.length > 0;
    const hasUnmigratedEnv = unmigratedEnvKeys.length > 0;
    const vaultKeysCount = this.inMemorySecrets.size;

    let status: 'complete' | 'pending' | 'clean';
    let details: string;

    if (hasLegacyFiles || hasUnmigratedEnv) {
      status = 'pending';
      details = `Kasaya aktarılmayı bekleyen ${legacyFilesDetected.length} adet disk dosyası veya ${unmigratedEnvKeys.length} adet ortam değişkeni tespit edildi.`;
    } else if (vaultKeysCount > 0) {
      status = 'complete';
      details = 'Tüm sistem anahtarları Vault kasasında güvenle saklanmaktadır. Diskte açıkta düz metin dosya bulunmamaktadır.';
    } else {
      status = 'clean';
      details = 'Sistem temiz kasa durumundadır.';
    }

    return {
      status,
      authoritativeSource: 'local_vault (AES-256-GCM data/.system_secrets.json)',
      hasLegacyFiles,
      hasUnmigratedEnv,
      legacyFilesDetected,
      unmigratedEnvKeys,
      vaultKeysCount,
      details,
    };
  }

  // ============================================================================
  // PUBLIC SUMMARY FOR UI (Zero plaintext passwords/tokens)
  // ============================================================================

  public getPublicSecretsState(): PublicSystemSecretsState {
    if (!this.isLoaded) this.loadFromLocalVault();

    // 1. Database secrets summary
    const dbPass = this.getDatabasePassword();
    const dbHost = this.getSecret('database.host') || process.env.POSTGRES_HOST || '';
    const dbPort = Number(this.getSecret('database.port') || process.env.POSTGRES_PORT || 5432);
    const dbName = this.getSecret('database.database') || process.env.POSTGRES_DB || '';
    const dbUser = this.getSecret('database.user') || process.env.POSTGRES_USER || '';
    const dbSsl = this.getSecret('database.sslMode') || 'disable';

    const dbSource: 'vault' | 'environment' | 'not_set' = this.inMemorySecrets.has('database.password')
      ? 'vault'
      : process.env.POSTGRES_PASSWORD || process.env.DATABASE_URL
      ? 'environment'
      : 'not_set';

    const databaseSummary: PublicDatabaseSecretsSummary = {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      sslMode: dbSsl,
      isConfigured: Boolean(dbHost && dbName && dbUser && dbPass),
      hasPassword: Boolean(dbPass),
      passwordMasked: maskSecret(dbPass),
      source: dbSource,
    };

    // 2. Email secrets summary
    const resendKey = this.getResendApiKey();
    const resendSource: 'vault' | 'environment' | 'not_set' = this.inMemorySecrets.has('email.resendApiKey')
      ? 'vault'
      : process.env.RESEND_API_KEY
      ? 'environment'
      : 'not_set';

    const smtpPass = this.getSmtpPassword();
    const smtpSource: 'vault' | 'environment' | 'not_set' = this.inMemorySecrets.has('email.smtpPass')
      ? 'vault'
      : process.env.SMTP_PASS
      ? 'environment'
      : 'not_set';

    const emailProvider = (this.getSecret('email.provider') || 'simulated') as 'resend' | 'smtp' | 'simulated';
    const emailFrom = this.getSecret('email.fromEmail') || process.env.EMAIL_FROM || 'bildirim@nexusnodeiot.com.tr';
    const emailFromName = this.getSecret('email.fromName') || 'NexusNode IoT';
    const appBaseUrl = this.getSecret('email.appBaseUrl') || process.env.APP_BASE_URL || 'https://nexusnodeiot.com.tr';

    const smtpHost = this.getSecret('email.smtpHost') || process.env.SMTP_HOST || '';
    const smtpPort = Number(this.getSecret('email.smtpPort') || process.env.SMTP_PORT || 587);
    const smtpSecure = this.getSecret('email.smtpSecure') === 'true' || smtpPort === 465;
    const smtpUser = this.getSecret('email.smtpUser') || process.env.SMTP_USER || '';

    const isEmailConfigured = Boolean(
      (emailProvider === 'resend' && resendKey) ||
      (emailProvider === 'smtp' && smtpHost && smtpUser && smtpPass) ||
      emailProvider === 'simulated'
    );

    const emailSummary: PublicEmailSecretsSummary = {
      provider: emailProvider,
      fromEmail: emailFrom,
      fromName: emailFromName,
      appBaseUrl,
      hasResendApiKey: Boolean(resendKey),
      resendApiKeyMasked: maskSecret(resendKey),
      resendSource,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      hasSmtpPass: Boolean(smtpPass),
      smtpPassMasked: maskSecret(smtpPass),
      smtpSource,
      isConfigured: isEmailConfigured,
    };

    // 3. Notifications summary
    const tgToken = this.getSecret('notifications.telegram.botToken') || process.env.TELEGRAM_BOT_TOKEN || '';
    const tgChatId = this.getSecret('notifications.telegram.chatId') || process.env.TELEGRAM_CHAT_ID || '';
    const tgEnabled = this.getSecret('notifications.telegram.enabled') === 'true';

    const waToken = this.getSecret('notifications.whatsapp.apiToken') || process.env.WHATSAPP_API_TOKEN || '';
    const waPhoneId = this.getSecret('notifications.whatsapp.phoneNumberId') || process.env.WHATSAPP_PHONE_ID || '';
    const waEnabled = this.getSecret('notifications.whatsapp.enabled') === 'true';

    const whSecret = this.getSecret('notifications.webhook.secretHeader') || process.env.WEBHOOK_SECRET_HEADER || '';
    const whEndpoint = this.getSecret('notifications.webhook.defaultEndpoint') || process.env.WEBHOOK_ENDPOINT || '';
    const whEnabled = this.getSecret('notifications.webhook.enabled') === 'true';

    const notificationsSummary: PublicNotificationSecretsSummary = {
      telegram: {
        enabled: tgEnabled,
        hasBotToken: Boolean(tgToken),
        botTokenMasked: maskSecret(tgToken),
        chatId: tgChatId,
        source: this.inMemorySecrets.has('notifications.telegram.botToken') ? 'vault' : process.env.TELEGRAM_BOT_TOKEN ? 'environment' : 'not_set',
      },
      whatsapp: {
        enabled: waEnabled,
        hasApiToken: Boolean(waToken),
        apiTokenMasked: maskSecret(waToken),
        phoneNumberId: waPhoneId,
        source: this.inMemorySecrets.has('notifications.whatsapp.apiToken') ? 'vault' : process.env.WHATSAPP_API_TOKEN ? 'environment' : 'not_set',
      },
      webhook: {
        enabled: whEnabled,
        hasSecretHeader: Boolean(whSecret),
        secretHeaderMasked: maskSecret(whSecret),
        defaultEndpoint: whEndpoint,
        source: this.inMemorySecrets.has('notifications.webhook.secretHeader') ? 'vault' : process.env.WEBHOOK_SECRET_HEADER ? 'environment' : 'not_set',
      },
    };

    // 4. Custom extensible third-party secrets
    const customList: PublicSecretItemSummary[] = [];
    for (const [key, item] of this.inMemorySecrets.entries()) {
      if (item.category === 'third_party' || item.category === 'custom') {
        const plain = decryptSecret(item.encryptedValue);
        customList.push({
          key,
          category: item.category,
          label: item.label || key,
          description: item.description,
          isConfigured: Boolean(plain),
          maskedValue: maskSecret(plain),
          source: 'vault',
          updatedAt: item.updatedAt,
        });
      }
    }

    // 5. System Keys & Vault Status (Single Root Key Architecture)
    const vaultStatus = getVaultStatus();
    const otaRec = this.getSecretRecord('ota.signing_key') || this.getSecretRecord('ota_signing_key');
    const hasVaultOta = this.inMemorySecrets.has('ota.signing_key') || this.inMemorySecrets.has('ota_signing_key');
    const rawOta = this.getSecret('ota.signing_key') || this.getSecret('ota_signing_key');

    const encKeySource: 'vault' | 'environment' | 'secrets_file' | 'missing' = vaultStatus.configured
      ? (vaultStatus.source.includes('docker') || vaultStatus.source.includes('secrets') ? 'secrets_file' : 'environment')
      : 'missing';

    const systemKeysSummary: PublicSystemKeysSummary = {
      allConfigured: vaultStatus.configured,
      vaultConfigured: vaultStatus.configured,
      vaultSource: vaultStatus.source,
      keys: {
        encryptionKey: {
          keyName: 'ENCRYPTION_KEY',
          isConfigured: vaultStatus.configured,
          source: encKeySource,
          inVault: false, // Root key stays outside vault
          maskedValue: vaultStatus.configured ? '••••••••' : '(Tanımlanmamış)',
          description: 'Tüm kasayı AES-256-GCM ile açan ana şifreleme anahtarı (Root Master Key).',
          keyId: 'root_master_key',
          version: 1,
          rotatable: false, // Root key rotated via external secrets re-encryption
        },
        otaSigningKey: {
          keyName: 'ota.signing_key',
          isConfigured: Boolean(hasVaultOta || rawOta),
          source: hasVaultOta ? 'vault' : 'missing',
          inVault: hasVaultOta,
          maskedValue: hasVaultOta ? '(Ed25519 Özel Anahtar Mevcut)' : '(Tanımlanmamış)',
          description: 'Cihaz firmware (OTA) paketlerini imzalama özel anahtarı (Vault dahili sırrı).',
          keyId: otaRec?.keyId || (hasVaultOta ? 'root_ed25519_v1' : undefined),
          version: otaRec?.version || (hasVaultOta ? 1 : undefined),
          rotatable: hasVaultOta,
        },
      },
    };

    return {
      database: databaseSummary,
      email: emailSummary,
      notifications: notificationsSummary,
      customSecrets: customList,
      systemKeys: systemKeysSummary,
      migrationStatus: this.getMigrationStatus(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // SECURE BATCH UPDATE API
  // ============================================================================

  public async updateDatabaseSecrets(input: DatabaseSecretsUpdateInput, updatedBy?: string): Promise<void> {
    if (input.host !== undefined) {
      await this.setSecret('database.host', input.host, { category: 'database', label: 'PostgreSQL Host', isSensitive: false, updatedBy });
    }
    if (input.port !== undefined) {
      await this.setSecret('database.port', String(input.port), { category: 'database', label: 'PostgreSQL Port', isSensitive: false, updatedBy });
    }
    if (input.database !== undefined) {
      await this.setSecret('database.database', input.database, { category: 'database', label: 'PostgreSQL Database', isSensitive: false, updatedBy });
    }
    if (input.user !== undefined) {
      await this.setSecret('database.user', input.user, { category: 'database', label: 'PostgreSQL User', isSensitive: false, updatedBy });
    }
    if (input.sslMode !== undefined) {
      await this.setSecret('database.sslMode', input.sslMode, { category: 'database', label: 'PostgreSQL SSL Mode', isSensitive: false, updatedBy });
    }
    if (input.password !== undefined && !isMaskedSecret(input.password)) {
      await this.setSecret('database.password', input.password, { category: 'database', label: 'PostgreSQL Password', isSensitive: true, updatedBy });
    }
  }

  public async updateEmailSecrets(input: EmailSecretsUpdateInput, updatedBy?: string): Promise<void> {
    if (input.provider !== undefined) {
      await this.setSecret('email.provider', input.provider, { category: 'email', label: 'E-Posta Servis Sağlayıcı', isSensitive: false, updatedBy });
    }
    if (input.fromEmail !== undefined) {
      await this.setSecret('email.fromEmail', input.fromEmail, { category: 'email', label: 'Gönderici E-Posta', isSensitive: false, updatedBy });
    }
    if (input.fromName !== undefined) {
      await this.setSecret('email.fromName', input.fromName, { category: 'email', label: 'Gönderici Adı', isSensitive: false, updatedBy });
    }
    if (input.appBaseUrl !== undefined) {
      await this.setSecret('email.appBaseUrl', input.appBaseUrl, { category: 'email', label: 'Uygulama Temel URL', isSensitive: false, updatedBy });
    }
    if (input.resendApiKey !== undefined && !isMaskedSecret(input.resendApiKey)) {
      await this.setSecret('email.resendApiKey', input.resendApiKey, { category: 'email', label: 'Resend API Anahtarı', isSensitive: true, updatedBy });
    }
    if (input.smtpHost !== undefined) {
      await this.setSecret('email.smtpHost', input.smtpHost, { category: 'email', label: 'SMTP Sunucu Adresi', isSensitive: false, updatedBy });
    }
    if (input.smtpPort !== undefined) {
      await this.setSecret('email.smtpPort', String(input.smtpPort), { category: 'email', label: 'SMTP Port', isSensitive: false, updatedBy });
    }
    if (input.smtpSecure !== undefined) {
      await this.setSecret('email.smtpSecure', String(input.smtpSecure), { category: 'email', label: 'SMTP SSL/TLS', isSensitive: false, updatedBy });
    }
    if (input.smtpUser !== undefined) {
      await this.setSecret('email.smtpUser', input.smtpUser, { category: 'email', label: 'SMTP Kullanıcı', isSensitive: false, updatedBy });
    }
    if (input.smtpPass !== undefined && !isMaskedSecret(input.smtpPass)) {
      await this.setSecret('email.smtpPass', input.smtpPass, { category: 'email', label: 'SMTP Parola', isSensitive: true, updatedBy });
    }
  }

  public async updateNotificationSecrets(input: NotificationSecretsUpdateInput, updatedBy?: string): Promise<void> {
    if (input.telegram) {
      if (input.telegram.enabled !== undefined) {
        await this.setSecret('notifications.telegram.enabled', String(input.telegram.enabled), { category: 'notifications', label: 'Telegram Aktif', isSensitive: false, updatedBy });
      }
      if (input.telegram.chatId !== undefined) {
        await this.setSecret('notifications.telegram.chatId', input.telegram.chatId, { category: 'notifications', label: 'Telegram Chat ID', isSensitive: false, updatedBy });
      }
      if (input.telegram.botToken !== undefined && !isMaskedSecret(input.telegram.botToken)) {
        await this.setSecret('notifications.telegram.botToken', input.telegram.botToken, { category: 'notifications', label: 'Telegram Bot Token', isSensitive: true, updatedBy });
      }
    }

    if (input.whatsapp) {
      if (input.whatsapp.enabled !== undefined) {
        await this.setSecret('notifications.whatsapp.enabled', String(input.whatsapp.enabled), { category: 'notifications', label: 'WhatsApp Aktif', isSensitive: false, updatedBy });
      }
      if (input.whatsapp.phoneNumberId !== undefined) {
        await this.setSecret('notifications.whatsapp.phoneNumberId', input.whatsapp.phoneNumberId, { category: 'notifications', label: 'WhatsApp Telefon ID', isSensitive: false, updatedBy });
      }
      if (input.whatsapp.apiToken !== undefined && !isMaskedSecret(input.whatsapp.apiToken)) {
        await this.setSecret('notifications.whatsapp.apiToken', input.whatsapp.apiToken, { category: 'notifications', label: 'WhatsApp API Token', isSensitive: true, updatedBy });
      }
    }

    if (input.webhook) {
      if (input.webhook.enabled !== undefined) {
        await this.setSecret('notifications.webhook.enabled', String(input.webhook.enabled), { category: 'notifications', label: 'Webhook Aktif', isSensitive: false, updatedBy });
      }
      if (input.webhook.defaultEndpoint !== undefined) {
        await this.setSecret('notifications.webhook.defaultEndpoint', input.webhook.defaultEndpoint, { category: 'notifications', label: 'Webhook Uç Noktası', isSensitive: false, updatedBy });
      }
      if (input.webhook.secretHeader !== undefined && !isMaskedSecret(input.webhook.secretHeader)) {
        await this.setSecret('notifications.webhook.secretHeader', input.webhook.secretHeader, { category: 'notifications', label: 'Webhook Gizli Başlık', isSensitive: true, updatedBy });
      }
    }
  }

  public async setCustomSecret(input: CustomSecretInput, updatedBy?: string): Promise<void> {
    const rawKey = (input.key || '').trim();
    if (!rawKey) {
      throw new Error('Secret anahtarı (key) zorunludur.');
    }

    if (!/^[a-zA-Z0-9_.-]{2,64}$/.test(rawKey) || rawKey.includes('..') || rawKey.startsWith('.') || rawKey.endsWith('.')) {
      throw new Error('Geçersiz secret anahtarı. Anahtar yalnızca 2-64 karakter uzunluğunda harf, rakam, alt çizgi, tire ve nokta içerebilir.');
    }

    const lowerKey = rawKey.toLowerCase();
    if (
      lowerKey === 'encryption_key' ||
      lowerKey === 'encryptionkey' ||
      lowerKey.includes('master_key') ||
      lowerKey.includes('vault_key') ||
      lowerKey.includes('root_key')
    ) {
      throw new Error('Şifreleme anahtarları kasa içine kaydedilemez. Şifreleme anahtarı ve şifreli veri ayrı güvenlik sınırlarında bulunmalıdır.');
    }

    if (isMaskedSecret(input.value)) {
      return; // Do not overwrite if masked
    }

    await this.setSecret(lowerKey, input.value, {
      category: input.category || 'custom',
      label: input.label || lowerKey,
      description: input.description,
      isSensitive: true,
      updatedBy,
    });
  }

  // ============================================================================
  // LOG & ERROR MESSAGE SANITIZER (Masks passwords in URLs and error messages)
  // ============================================================================

  public sanitizeLogString(str?: string): string {
    return sanitizeLogUtil(str);
  }
}

export const systemSecretsService = SystemSecretsService.getInstance();
