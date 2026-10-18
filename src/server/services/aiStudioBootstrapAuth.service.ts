import crypto from 'node:crypto';
import type { Request } from 'express';
import {
  isDevelopmentSshTunnelAllowed,
  isVps,
  resolveRuntimeEnvironment,
} from '../config/runtimeEnvironment.js';

interface TokenRecord {
  createdAt: number;
  expiresAt: number;
}

export class AiStudioBootstrapAuthService {
  private tokens = new Map<string, TokenRecord>();
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
  public createBootstrapToken(ttlMs: number = this.DEFAULT_TTL_MS): string | null {
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
    });

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
      return false;
    }

    return true;
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
    for (const [token, record] of this.tokens.entries()) {
      if (now > record.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  /**
   * Clear all active tokens (primarily for test tear-downs).
   */
  public clearAllTokens(): void {
    this.tokens.clear();
  }
}

export const aiStudioBootstrapAuthService = new AiStudioBootstrapAuthService();
