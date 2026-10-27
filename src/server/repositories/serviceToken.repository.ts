import crypto from 'crypto';
import type { ServiceToken, User } from '../../types.js';

export class ServiceTokenRepository {
  constructor(private db: any) {}

  private isPgReady(): boolean {
    return typeof this.db?.postgresRepo?.isReady === 'function' && Boolean(this.db.postgresRepo.isReady());
  }

  public async createServiceTokenAsync(options: {
    name: string;
    userId: string;
    tenantId: string;
    scopes: string[];
    expiresInDays?: number;
  }): Promise<{ token: string; metadata: Omit<ServiceToken, 'tokenHash'> }> {
    const rawRandom = crypto.randomBytes(24).toString('hex');
    const plaintextToken = `nxs_srv_${rawRandom}`;
    const tokenPrefix = `nxs_srv_${rawRandom.substring(0, 8)}`;
    const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');
    const id = `srv_tok_${crypto.randomBytes(12).toString('hex')}`;

    const createdAt = new Date().toISOString();
    const expiresInDays = options.expiresInDays !== undefined ? options.expiresInDays : 365;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const serviceToken: ServiceToken = {
      id,
      name: options.name || 'AI Studio Integration Token',
      tokenPrefix,
      tokenHash,
      userId: options.userId,
      tenantId: options.tenantId,
      scopes: options.scopes && options.scopes.length > 0 ? options.scopes : ['devices:read', 'telemetry:read'],
      createdAt,
      expiresAt,
      isRevoked: false,
    };

    // Save in memory
    if (!this.db.data.serviceTokens) {
      this.db.data.serviceTokens = [];
    }
    this.db.data.serviceTokens.push(serviceToken);
    try {
      this.db.saveData(this.db.data, true);
    } catch {}

    // Save in PG if ready
    if (this.isPgReady()) {
      await this.db.postgresRepo.saveServiceToken(serviceToken).catch((e: any) =>
        console.warn('[PG Error saveServiceToken]', e?.message || e)
      );
    }

    const { tokenHash: _th, ...metadata } = serviceToken;
    return { token: plaintextToken, metadata };
  }

  public async verifyServiceTokenAsync(
    plaintextToken: string
  ): Promise<{ serviceToken: ServiceToken; user: User } | null> {
    if (!plaintextToken || !plaintextToken.startsWith('nxs_srv_')) {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

    let token: ServiceToken | undefined;

    if (this.isPgReady()) {
      const pgToken = await this.db.postgresRepo.getServiceTokenByHash(tokenHash).catch(() => null);
      if (pgToken) token = pgToken;
    }

    if (!token) {
      const localTokens: ServiceToken[] = this.db.data.serviceTokens || [];
      token = localTokens.find((t) => t.tokenHash === tokenHash);
    }

    if (!token) return null;

    if (token.isRevoked || token.revokedAt) return null;

    if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    // Update lastUsedAt
    const now = new Date().toISOString();
    token.lastUsedAt = now;
    if (this.isPgReady()) {
      this.db.postgresRepo.updateServiceTokenLastUsed(token.id).catch(() => {});
    }

    // Fetch user or construct user context
    let user = (this.db.data.users || []).find((u: any) => u.id === token!.userId);
    if (!user && this.isPgReady()) {
      user = await this.db.postgresRepo.getUserById(token.userId).catch(() => null);
    }

    if (!user) {
      user = {
        id: token.userId,
        tenantId: token.tenantId,
        email: `service_${token.id}@system.nexusnodeiot.com.tr`,
        name: token.name,
        role: 'customer',
        companyName: 'Service Principal',
        created_at: token.createdAt,
      };
    } else {
      user = { ...user, tenantId: token.tenantId };
    }

    return { serviceToken: token, user };
  }

  public async listServiceTokensAsync(tenantId?: string): Promise<Omit<ServiceToken, 'tokenHash'>[]> {
    let tokens: ServiceToken[] = [];
    if (this.isPgReady()) {
      tokens = await this.db.postgresRepo.listServiceTokens(tenantId).catch(() => []);
    }
    if (!tokens || tokens.length === 0) {
      tokens = this.db.data.serviceTokens || [];
      if (tenantId) {
        tokens = tokens.filter((t) => t.tenantId === tenantId);
      }
    }

    return tokens.map(({ tokenHash: _th, ...rest }) => rest);
  }

  public async revokeServiceTokenAsync(tokenId: string): Promise<boolean> {
    const now = new Date().toISOString();
    let updated = false;

    if (this.isPgReady()) {
      await this.db.postgresRepo.revokeServiceToken(tokenId).catch((e: any) =>
        console.warn('[PG Error revokeServiceToken]', e?.message || e)
      );
    }

    const localTokens: ServiceToken[] = this.db.data.serviceTokens || [];
    const found = localTokens.find((t) => t.id === tokenId);
    if (found) {
      found.isRevoked = true;
      found.revokedAt = now;
      updated = true;
      try {
        this.db.saveData(this.db.data, true);
      } catch {}
    }

    return updated;
  }
}
