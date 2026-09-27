import fs from 'node:fs';
import path from 'node:path';
import { encryptSecret, decryptSecret, maskSecret, isMaskedSecret } from '../utils/crypto.js';
import { systemLogger } from './systemLogger.service.js';

export type SecretCategory = 'database' | 'email' | 'notifications' | 'third_party' | 'custom';

export interface StoredSecretRecord {
  key: string;
  category: SecretCategory;
  label: string;
  description?: string;
  encryptedValue: string; // AES-256-GCM ciphertext (enc:v1:...)
  isSensitive: boolean;
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

export interface PublicSystemSecretsState {
  database: PublicDatabaseSecretsSummary;
  email: PublicEmailSecretsSummary;
  notifications: PublicNotificationSecretsSummary;
  customSecrets: PublicSecretItemSummary[];
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
const VAULT_FILE = path.join(VAULT_DIR, '.system_secrets.json');

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
      if (fs.existsSync(VAULT_FILE)) {
        const raw = fs.readFileSync(VAULT_FILE, 'utf8');
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
   * Synchronizes with PostgreSQL system_settings table if connected
   */
  public async syncWithPostgres(postgresRepo: any): Promise<void> {
    if (!postgresRepo || typeof postgresRepo.isReady !== 'function' || !postgresRepo.isReady()) {
      return;
    }

    try {
      // 1. Try reading from PostgreSQL
      const dbVault = await postgresRepo.getSystemSetting('vault_system_secrets');
      if (dbVault && typeof dbVault === 'object' && dbVault.secrets) {
        let hasNewFromDb = false;
        for (const [key, item] of Object.entries(dbVault.secrets as Record<string, StoredSecretRecord>)) {
          const current = this.inMemorySecrets.get(key);
          if (!current || (item.updatedAt && (!current.updatedAt || new Date(item.updatedAt) > new Date(current.updatedAt)))) {
            this.inMemorySecrets.set(key, item);
            hasNewFromDb = true;
          }
        }
        if (hasNewFromDb) {
          this.saveToLocalVault();
        }
      } else if (this.inMemorySecrets.size > 0) {
        // Persist local secrets to newly connected PostgreSQL
        await this.persistToPostgres(postgresRepo);
      }
    } catch (err: any) {
      systemLogger.warn('security', `PostgreSQL secret senkronizasyon uyarısı: ${err?.message || err}`);
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

      fs.writeFileSync(VAULT_FILE, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      try {
        fs.chmodSync(VAULT_FILE, 0o600);
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
    }
  ): Promise<void> {
    if (!this.isLoaded) this.loadFromLocalVault();

    // If masked, do not overwrite existing
    if (isMaskedSecret(plainValue)) {
      return;
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

    const encrypted = encryptSecret(trimmed);
    const record: StoredSecretRecord = {
      key,
      category: meta.category,
      label: meta.label,
      description: meta.description,
      encryptedValue: encrypted,
      isSensitive: meta.isSensitive ?? true,
      updatedAt: new Date().toISOString(),
      updatedBy: meta.updatedBy,
    };

    this.inMemorySecrets.set(key, record);
    this.saveToLocalVault();
    await this.persistToPostgres();
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

    // Fallback to runtime setup service or environment
    try {
      const runtimePass = process.env.POSTGRES_PASSWORD;
      if (runtimePass) return runtimePass;
    } catch {}

    return '';
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

    const fromEnv = (process.env.RESEND_API_KEY || '').trim();
    if (fromEnv && fromEnv.startsWith('re_')) {
      return fromEnv;
    }

    return '';
  }

  public getSmtpPassword(): string {
    const fromVault = this.getSecret('email.smtpPass');
    if (fromVault) return fromVault;
    return process.env.SMTP_PASS || '';
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

    return {
      database: databaseSummary,
      email: emailSummary,
      notifications: notificationsSummary,
      customSecrets: customList,
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
    if (!input.key || !input.key.trim()) {
      throw new Error('Secret anahtarı (key) zorunludur.');
    }
    const cleanKey = input.key.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
    if (isMaskedSecret(input.value)) {
      return; // Do not overwrite if masked
    }
    await this.setSecret(cleanKey, input.value, {
      category: input.category || 'custom',
      label: input.label || cleanKey,
      description: input.description,
      isSensitive: true,
      updatedBy,
    });
  }

  // ============================================================================
  // LOG & ERROR MESSAGE SANITIZER (Masks passwords in URLs and error messages)
  // ============================================================================

  public sanitizeLogString(str?: string): string {
    if (!str || typeof str !== 'string') return '';
    return str
      // Mask postgresql://user:password@host (handles passwords with @ or special characters)
      .replace(/(postgres(?:ql)?:\/\/[^:\/\s]+:)([\s\S]*?)(@[a-zA-Z0-9_.-]+:\d+(?:\/[^\s?]*)?(?:\?[^\s]*)?)/gi, '$1••••••••$3')
      // Mask re_ API keys
      .replace(/re_[a-zA-Z0-9_-]{20,}/g, 're_••••••••')
      // Mask bot tokens (Telegram)
      .replace(/\b\d{8,10}:[a-zA-Z0-9_-]{30,}\b/g, '••••••••:••••••••')
      // Mask bearer tokens
      .replace(/(Bearer\s+)[a-zA-Z0-9_.-]{16,}/gi, '$1••••••••');
  }
}

export const systemSecretsService = SystemSecretsService.getInstance();
