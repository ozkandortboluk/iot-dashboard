import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import {
  isDevelopmentSshTunnelAllowed,
  isVps,
  resolveRuntimeEnvironment,
} from '../config/runtimeEnvironment.js';

interface TokenRecord {
  createdAt: number;
  expiresAt: number;
  rememberedDevice?: boolean;
}

const TOKENS_FILE = path.join(process.cwd(), 'data', '.ssh_bootstrap_tokens.json');

export class AiStudioBootstrapAuthService {
  private tokens = new Map<string, TokenRecord>();
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
  public readonly REMEMBER_DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.loadPersistedTokens();
  }

  /**
   * Loads persisted bootstrap tokens from data/.ssh_bootstrap_tokens.json
   */
  private loadPersistedTokens(): void {
    if (!this.isBootstrapAllowed()) {
      return;
    }
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const now = Date.now();
          for (const [token, record] of Object.entries(parsed)) {
            const rec = record as TokenRecord;
            if (rec && typeof rec.expiresAt === 'number' && rec.expiresAt > now) {
              this.tokens.set(token, rec);
            }
          }
        }
      }
    } catch {
      // Ignore transient read errors
    }
  }

  /**
   * Persists active tokens to disk with strict 0o600 file permissions
   */
  private savePersistedTokens(): void {
    if (!this.isBootstrapAllowed()) {
      return;
    }
    try {
      const dataDir = path.dirname(TOKENS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serializable: Record<string, TokenRecord> = {};
      const now = Date.now();
      for (const [token, record] of this.tokens.entries()) {
        if (record.expiresAt > now) {
          serializable[token] = record;
        }
      }
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(serializable, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.chmodSync(TOKENS_FILE, 0o600);
    } catch {
      // Ignore transient disk write errors
    }
  }

  /**
   * Determines whether AI Studio SSH pre-login bootstrap authorization is permitted.
   * Strictly FORBIDDEN on production VPS hosts.
   */
  public isBootstrapAllowed(): boolean {
    if (isVps()) {
      return false;
    }
    if (process.env.VPS_PRODUCTION === 'true') {
      return false;
    }
    const env = resolveRuntimeEnvironment();
    if (env === 'vps') {
      return false;
    }
    if (!isDevelopmentSshTunnelAllowed()) {
      return false;
    }
    return env === 'aistudio' || env === 'local' || env === 'test';
  }

  /**
   * Creates an ephemeral, cryptographically secure bootstrap token for pre-login SSH setup in AI Studio.
   * Returns null if running on VPS or if SSH tunneling is disallowed.
   */
  public createBootstrapToken(ttlMs: number = this.DEFAULT_TTL_MS, rememberedDevice: boolean = false): string | null {
    if (!this.isBootstrapAllowed()) {
      return null;
    }
    this.purgeExpiredTokens();
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const token = `nxs_aistudio_boot_${randomBytes}`;
    const now = Date.now();
    this.tokens.set(token, {
      createdAt: now,
      expiresAt: now + ttlMs,
      rememberedDevice,
    });
    this.savePersistedTokens();
    return token;
  }

  /**
   * Validates a bootstrap token.
   * Strictly rejects any token if running in VPS environment (Fail-Closed).
   */
  public validateBootstrapToken(token: string | null | undefined): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }
    if (!this.isBootstrapAllowed()) {
      return false;
    }
    const cleanToken = token.trim();
    const record = this.tokens.get(cleanToken);
    if (!record) {
      return false;
    }
    if (Date.now() > record.expiresAt) {
      this.tokens.delete(cleanToken);
      this.savePersistedTokens();
      return false;
    }
    return true;
  }

  /**
   * Revokes a specific bootstrap token (e.g. user clicks "Forget Device / Yetkiyi Unut").
   */
  public revokeBootstrapToken(token: string | null | undefined): boolean {
    if (!token || typeof token !== 'string') return false;
    const clean = token.trim();
    const existed = this.tokens.delete(clean);
    if (existed) {
      this.savePersistedTokens();
    }
    return existed;
  }

  /**
   * Extracts bootstrap token from incoming request headers or cookies.
   */
  public extractBootstrapToken(req: Request): string | null {
    // 1. Header: X-SSH-Bootstrap-Token
    const headerToken =
      (req.headers['x-ssh-bootstrap-token'] as string) ||
      (req.headers['x-bootstrap-token'] as string);
    if (headerToken && typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken.trim();
    }

    // 2. Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      const bearer = authHeader.substring(7).trim();
      if (bearer.startsWith('nxs_aistudio_boot_')) {
        return bearer;
      }
    }

    // 3. Cookie fallback
    const cookieToken =
      (req as any).cookies?.nexus_ssh_bootstrap_token ||
      (req as any).cookies?.['nexus_ssh_bootstrap_token'];
    if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) {
      return cookieToken.trim();
    }

    return null;
  }

  /**
   * Purges expired tokens to maintain minimal memory footprint.
   */
  public purgeExpiredTokens(): void {
    const now = Date.now();
    let changed = false;
    for (const [token, record] of this.tokens.entries()) {
      if (now > record.expiresAt) {
        this.tokens.delete(token);
        changed = true;
      }
    }
    if (changed) {
      this.savePersistedTokens();
    }
  }

  /**
   * Clear all active tokens (primarily for test tear-downs).
   */
  public clearAllTokens(): void {
    this.tokens.clear();
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
      }
    } catch {}
  }
}

export const aiStudioBootstrapAuthService = new AiStudioBootstrapAuthService();
