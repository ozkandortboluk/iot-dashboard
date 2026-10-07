import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isProductionVpsEnvironment } from '../config/runtimeEnvironment.js';

export interface MasterKeyStatus {
  configured: boolean;
  source: 'docker_secret' | 'secrets_file' | 'data_vault_key' | 'env' | 'missing';
  sourcePath?: string;
  isProduction: boolean;
}

const DOCKER_SECRET_KEY_PATH = '/run/secrets/encryption_key';
const SECRETS_DIR_KEY_PATH = path.resolve(process.cwd(), 'secrets', 'encryption_key');
const LOCAL_VAULT_KEY_PATH = path.resolve(process.cwd(), 'data', '.vault_key');

/**
 * Single Authoritative Master Key Provider (Single Source of Truth)
 * Centralizes root AES-256-GCM Vault encryption key resolution.
 * Replaces fragmented, divergent resolution logic across the codebase.
 */
export class MasterKeyProvider {
  private static instance: MasterKeyProvider;
  private cachedKeyBuffer: Buffer | null = null;
  private cachedSource: 'docker_secret' | 'secrets_file' | 'data_vault_key' | 'env' | 'missing' = 'missing';
  private cachedSourcePath?: string;

  private constructor() {}

  public static getInstance(): MasterKeyProvider {
    if (!MasterKeyProvider.instance) {
      MasterKeyProvider.instance = new MasterKeyProvider();
    }
    return MasterKeyProvider.instance;
  }

  public resetCache(): void {
    this.cachedKeyBuffer = null;
    this.cachedSource = 'missing';
    this.cachedSourcePath = undefined;
  }

  public derive32ByteKey(raw: string): Buffer {
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
  }

  /**
   * Returns the single authoritative 32-byte AES-256 master key.
   *
   * PRODUCTION POLICY:
   * - STRICTLY AND EXCLUSIVELY /run/secrets/encryption_key (Docker Secret).
   * - All environment variables, local files, and auto-generation are forbidden.
   * - If missing or empty in production, returns null (fail-closed).
   *
   * DEVELOPMENT / TEST / PREVIEW POLICY:
   * 1. Docker Secret (/run/secrets/encryption_key) if mounted.
   * 2. Local secrets mount (secrets/encryption_key) if present.
   * 3. Persistent local vault key file (data/.vault_key) if present (MUST BE PRESERVED ON RESTART).
   * 4. Custom path via ENCRYPTION_KEY_PATH / ENCRYPTION_KEY_FILE.
   * 5. Explicit process.env.ENCRYPTION_KEY if provided.
   * 6. If none exist in development: generates a high-entropy 32-byte key, persists it once to
   *    data/.vault_key (chmod 0600) so that ALL subsequent restarts continue to use the exact same key!
   */
  public getKey(): Buffer | null {
    if (this.cachedKeyBuffer) {
      return this.cachedKeyBuffer;
    }

    const isProd = isProductionVpsEnvironment();

    if (isProd) {
      try {
        if (fs.existsSync(DOCKER_SECRET_KEY_PATH)) {
          const raw = fs.readFileSync(DOCKER_SECRET_KEY_PATH, 'utf8').trim();
          // Production policy: strictly require 64 hexadecimal characters (256-bit cryptographic root key)
          // 32+ character plain text SHA-256 derivation is forbidden in production (fail-closed)
          if (/^[0-9a-fA-F]{64}$/.test(raw)) {
            this.cachedKeyBuffer = Buffer.from(raw, 'hex');
            this.cachedSource = 'docker_secret';
            this.cachedSourcePath = DOCKER_SECRET_KEY_PATH;
            return this.cachedKeyBuffer;
          }
        }
      } catch {}

      this.cachedSource = 'missing';
      return null;
    }

    // --- NON-PRODUCTION (Dev / Test / Cloud Run Sandbox) ---

    // 1. Docker secret
    try {
      if (fs.existsSync(DOCKER_SECRET_KEY_PATH)) {
        const raw = fs.readFileSync(DOCKER_SECRET_KEY_PATH, 'utf8').trim();
        if (raw && raw.length >= 16) {
          this.cachedKeyBuffer = this.derive32ByteKey(raw);
          this.cachedSource = 'docker_secret';
          this.cachedSourcePath = DOCKER_SECRET_KEY_PATH;
          return this.cachedKeyBuffer;
        }
      }
    } catch {}

    // 2. secrets/encryption_key
    try {
      if (fs.existsSync(SECRETS_DIR_KEY_PATH)) {
        const raw = fs.readFileSync(SECRETS_DIR_KEY_PATH, 'utf8').trim();
        if (raw && raw.length >= 16) {
          this.cachedKeyBuffer = this.derive32ByteKey(raw);
          this.cachedSource = 'secrets_file';
          this.cachedSourcePath = SECRETS_DIR_KEY_PATH;
          return this.cachedKeyBuffer;
        }
      }
    } catch {}

    // 3. Persistent local development key (data/.vault_key) - MUST CHECK BEFORE RE-GENERATING!
    try {
      if (fs.existsSync(LOCAL_VAULT_KEY_PATH)) {
        const raw = fs.readFileSync(LOCAL_VAULT_KEY_PATH, 'utf8').trim();
        if (raw && raw.length >= 16) {
          this.cachedKeyBuffer = this.derive32ByteKey(raw);
          this.cachedSource = 'data_vault_key';
          this.cachedSourcePath = LOCAL_VAULT_KEY_PATH;
          return this.cachedKeyBuffer;
        }
      }
    } catch {}

    // 4. Custom key path if specified
    const customKeyPath = process.env.ENCRYPTION_KEY_PATH || process.env.ENCRYPTION_KEY_FILE;
    if (customKeyPath) {
      try {
        if (fs.existsSync(customKeyPath)) {
          const raw = fs.readFileSync(customKeyPath, 'utf8').trim();
          if (raw && raw.length >= 16) {
            this.cachedKeyBuffer = this.derive32ByteKey(raw);
            this.cachedSource = 'secrets_file';
            this.cachedSourcePath = customKeyPath;
            return this.cachedKeyBuffer;
          }
        }
      } catch {}
    }

    // 5. Environment variable
    const envKey = (process.env.ENCRYPTION_KEY || '').trim();
    if (envKey && envKey.length >= 16) {
      this.cachedKeyBuffer = this.derive32ByteKey(envKey);
      this.cachedSource = 'env';
      return this.cachedKeyBuffer;
    }

    // 6. Local development sandbox bootstrap: persist a fresh key to data/.vault_key so restarts reuse it!
    try {
      const dataDir = path.dirname(LOCAL_VAULT_KEY_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const newKeyHex = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(LOCAL_VAULT_KEY_PATH, newKeyHex, { encoding: 'utf8', mode: 0o600 });
      this.cachedKeyBuffer = this.derive32ByteKey(newKeyHex);
      this.cachedSource = 'data_vault_key';
      this.cachedSourcePath = LOCAL_VAULT_KEY_PATH;
      return this.cachedKeyBuffer;
    } catch {
      // Ephemeral in-memory fallback if disk is completely read-only in sandbox
      const fallbackHex = crypto.randomBytes(32).toString('hex');
      this.cachedKeyBuffer = this.derive32ByteKey(fallbackHex);
      this.cachedSource = 'env';
      return this.cachedKeyBuffer;
    }
  }

  public getStatus(): MasterKeyStatus {
    const isConfigured = this.getKey() !== null;
    return {
      configured: isConfigured,
      source: this.cachedSource,
      sourcePath: this.cachedSourcePath,
      isProduction: isProductionVpsEnvironment(),
    };
  }
}

export const masterKeyProvider = MasterKeyProvider.getInstance();
