import crypto from 'node:crypto';
import { db } from '../db.js';
import { emailService } from './email.service.js';
import { rateLimiterService } from './rateLimiter.service.js';
import { validatePassword } from '../utils/validation.js';
import { User } from '../../types.js';

export interface ResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

// In-memory fallback token store for tests or local mode
const inMemoryResetTokens = new Map<string, ResetTokenRecord>();

// Helper to mask email for security (e.g. ozkan.1403@gmail.com -> o***3@gmail.com)
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export class PasswordResetService {
  private static instance: PasswordResetService;
  private isTableEnsured = false;

  public static getInstance(): PasswordResetService {
    if (!PasswordResetService.instance) {
      PasswordResetService.instance = new PasswordResetService();
    }
    return PasswordResetService.instance;
  }

  /**
   * Ensures the PostgreSQL password_reset_tokens table exists
   */
  public async ensureTable(): Promise<void> {
    if (this.isTableEnsured) return;
    try {
      const pg = db.postgresRepo;
      if (pg && pg.isReady && pg.isReady()) {
        const pool = pg.getPool();
        if (!pool) return;
        const client = await pool.connect();
        try {
          await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
              id VARCHAR(64) PRIMARY KEY,
              user_id VARCHAR(64) NOT NULL,
              token_hash VARCHAR(128) NOT NULL,
              expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
              used BOOLEAN DEFAULT FALSE,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pwd_reset_token_hash ON password_reset_tokens(token_hash);
            CREATE INDEX IF NOT EXISTS idx_pwd_reset_user_id ON password_reset_tokens(user_id);
          `);
          this.isTableEnsured = true;
        } finally {
          client.release();
        }
      }
    } catch (e: any) {
      console.warn('[PasswordResetService] ensureTable notice:', e?.message || e);
    }
  }

  /**
   * Computes SHA-256 hash of a raw token
   */
  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a cryptographically strong 256-bit random hex token (64 characters)
   */
  public generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Stores a token hash in PostgreSQL or in-memory fallback
   */
  private async saveTokenRecord(record: ResetTokenRecord): Promise<void> {
    await this.ensureTable();
    const pg = db.postgresRepo;
    if (pg && pg.isReady && pg.isReady()) {
      try {
        const pool = pg.getPool();
        if (pool) {
          // Invalidate prior unused tokens for this user
          await pool.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
            [record.userId]
          );
          // Insert new token hash
          await pool.query(
            'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [record.id, record.userId, record.tokenHash, record.expiresAt, record.used, record.createdAt]
          );
          return;
        }
      } catch (dbErr: any) {
        console.error('[PasswordResetService] DB error while saving token, falling back to memory:', dbErr?.message || dbErr);
      }
    }

    // In-memory fallback
    for (const [key, t] of inMemoryResetTokens.entries()) {
      if (t.userId === record.userId && !t.used) {
        t.used = true;
      }
    }
    inMemoryResetTokens.set(record.tokenHash, record);
  }

  /**
   * Finds a token record by raw token
   */
  private async findTokenRecord(rawToken: string): Promise<ResetTokenRecord | null> {
    await this.ensureTable();
    const tokenHash = this.hashToken(rawToken.trim());
    const pg = db.postgresRepo;

    if (pg && pg.isReady && pg.isReady()) {
      try {
        const pool = pg.getPool();
        if (pool) {
          const res = await pool.query(
            'SELECT id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt", used, created_at as "createdAt" FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1',
            [tokenHash]
          );
          if (res.rows.length > 0) {
            const row = res.rows[0];
            return {
              id: row.id,
              userId: row.userId,
              tokenHash: row.tokenHash,
              expiresAt: new Date(row.expiresAt),
              used: Boolean(row.used),
              createdAt: new Date(row.createdAt),
            };
          }
          return null;
        }
      } catch (err: any) {
        console.error('[PasswordResetService] DB find error, checking memory:', err?.message || err);
      }
    }

    // Fallback in-memory
    const memoryRecord = inMemoryResetTokens.get(tokenHash);
    return memoryRecord || null;
  }

  /**
   * Marks a token as used in PostgreSQL and in-memory
   */
  private async markTokenAsUsed(recordId: string, tokenHash: string): Promise<void> {
    const pg = db.postgresRepo;
    if (pg && pg.isReady && pg.isReady()) {
      try {
        const pool = pg.getPool();
        if (pool) {
          await pool.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
            [recordId]
          );
        }
      } catch (err: any) {
        console.error('[PasswordResetService] Mark used error:', err?.message || err);
      }
    }

    const mem = inMemoryResetTokens.get(tokenHash);
    if (mem) {
      mem.used = true;
    }
  }

  /**
   * OWASP Compliant Public Request for Password Reset
   * Always returns the same generic message to prevent user enumeration attacks.
   */
  public async requestPasswordReset(params: {
    email: string;
    clientIp: string;
    baseUrl: string;
  }): Promise<{ success: boolean; message: string; simulatedUrl?: string }> {
    const { email, clientIp, baseUrl } = params;
    const normalizedEmail = (email || '').trim().toLowerCase();

    // 1. IP & Email rate limiting to prevent spam and brute-force
    const ipLimit = rateLimiterService.checkIpRateLimit(`pwd_reset_ip:${clientIp}`, 5);
    if (!ipLimit.allowed) {
      throw new Error(`Çok fazla istek yapıldı. Lütfen ${ipLimit.retryAfterSeconds || 60} saniye sonra tekrar deneyin.`);
    }

    const emailLimit = rateLimiterService.checkIpRateLimit(`pwd_reset_email:${normalizedEmail}`, 3);
    if (!emailLimit.allowed) {
      throw new Error(`Bu e-posta adresi için çok sık sıfırlama talebi gönderildi. Lütfen bir süre bekleyin.`);
    }

    // 2. Generic success message (OWASP Anti-Enumeration Principle)
    const genericResponse = {
      success: true,
      message: 'Eğer bu e-posta adresi sistemimizde kayıtlı ise, şifre sıfırlama bağlantısı gönderilmiştir. Lütfen gelen kutunuzu ve spam klasörünüzü kontrol edin.',
    };

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return genericResponse;
    }

    // 3. User lookup
    const users = await db.getUsersAsync();
    const user = users.find((u) => u.email && u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      // Return generic response without revealing user non-existence
      return genericResponse;
    }

    // 4. Generate token and store only the SHA-256 hash
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresInMinutes = 15;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const record: ResetTokenRecord = {
      id: `prt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId: user.id,
      tokenHash,
      expiresAt,
      used: false,
      createdAt: new Date(),
    };

    await this.saveTokenRecord(record);

    // 5. Construct secure URL
    // Format: `${baseUrl}/#reset-password?token=${rawToken}` or `${baseUrl}/reset-password?token=${rawToken}`
    const resetUrl = `${baseUrl.replace(/\/+$/, '')}/#reset-password?token=${rawToken}`;

    // 6. Send email
    const sendResult = await emailService.sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      resetUrl,
      expiresInMinutes,
    });

    console.log(`[PasswordResetService] ${user.email} için sıfırlama e-postası tetiklendi (Provider: ${sendResult.provider}, Sim: ${Boolean(sendResult.simulated)})`);

    return {
      ...genericResponse,
      simulatedUrl: sendResult.simulated ? resetUrl : undefined,
    };
  }

  /**
   * Admin triggered password reset ("Bağlantı Gönder" button)
   * Sends real email to the customer's registered email address.
   * If email dispatch fails, throws so UI will NOT say "gönderildi" falsely.
   */
  public async adminSendPasswordReset(params: {
    userId: string;
    baseUrl: string;
    adminName: string;
  }): Promise<{ success: boolean; message: string; simulatedUrl?: string }> {
    const { userId, baseUrl, adminName } = params;

    const users = await db.getUsersAsync();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Kullanıcı/Müşteri bulunamadı.');
    }

    if (!user.email || !user.email.includes('@')) {
      throw new Error(`Kullanıcının geçerli bir e-posta adresi kayıtlı değil (${user.email || 'boş'}).`);
    }

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresInMinutes = 60; // 1 hour for admin-initiated links
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const record: ResetTokenRecord = {
      id: `prt_adm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId: user.id,
      tokenHash,
      expiresAt,
      used: false,
      createdAt: new Date(),
    };

    await this.saveTokenRecord(record);

    const resetUrl = `${baseUrl.replace(/\/+$/, '')}/#reset-password?token=${rawToken}`;

    const sendResult = await emailService.sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      resetUrl,
      expiresInMinutes,
    });

    if (!sendResult.success) {
      throw new Error(`E-posta gönderimi başarısız oldu: ${sendResult.error || 'Sağlayıcı yanıt vermedi'}`);
    }

    db.addAuditLog(
      'admin',
      adminName || 'Admin',
      `Müşteriye Şifre Sıfırlama E-postası Gönderildi: ${user.name} (${user.email})`,
      'medium'
    );

    return {
      success: true,
      message: `Şifre sıfırlama bağlantısı ${user.email} adresine başarıyla gönderildi.`,
      simulatedUrl: sendResult.simulated ? resetUrl : undefined,
    };
  }

  /**
   * Verifies if a raw reset token is valid, unused and within its expiry window
   */
  public async verifyToken(rawToken: string): Promise<{ valid: boolean; error?: string; user?: User; emailMasked?: string }> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
      return { valid: false, error: 'Geçersiz şifre sıfırlama bağlantısı.' };
    }

    const record = await this.findTokenRecord(rawToken);
    if (!record) {
      return { valid: false, error: 'Şifre sıfırlama bağlantısı geçersiz veya daha önce kullanılmış.' };
    }

    if (record.used) {
      return { valid: false, error: 'Bu sıfırlama bağlantısı daha önce kullanılmış. Lütfen yeni bir bağlantı talep edin.' };
    }

    if (new Date() > record.expiresAt) {
      return { valid: false, error: 'Şifre sıfırlama bağlantısının geçerlilik süresi dolmuş. Lütfen yeniden talep edin.' };
    }

    const users = await db.getUsersAsync();
    const user = users.find((u) => u.id === record.userId);
    if (!user) {
      return { valid: false, error: 'Bağlantılı kullanıcı hesabı bulunamadı.' };
    }

    return {
      valid: true,
      user,
      emailMasked: maskEmail(user.email),
    };
  }

  /**
   * Consumes a single-use token and updates the user's password,
   * then terminates all active user sessions (OWASP requirement).
   */
  public async resetPassword(rawToken: string, newPass: string): Promise<{ success: boolean; message: string }> {
    const verification = await this.verifyToken(rawToken);
    if (!verification.valid || !verification.user) {
      throw new Error(verification.error || 'Şifre sıfırlama bağlantısı geçersiz.');
    }

    const user = verification.user;

    // Validate new password rules
    const passValidation = validatePassword(newPass);
    if (!passValidation.valid) {
      throw new Error(passValidation.error || 'Yeni şifre güvenlik kriterlerini karşılamıyor.');
    }

    // Look up token record to mark it used
    const tokenHash = this.hashToken(rawToken.trim());
    const record = await this.findTokenRecord(rawToken);
    if (record) {
      await this.markTokenAsUsed(record.id, tokenHash);
    }

    // Update password in DB
    await db.userRepository.resetPasswordDirect(user.id, newPass);

    // OWASP Requirement: Terminate all active sessions upon password reset
    await db.terminateUserSessions(user.id).catch((termErr: any) => {
      console.warn('[PasswordResetService] Oturum sonlandırma uyarısı:', termErr?.message || termErr);
    });

    db.addAuditLog(
      user.id,
      user.name,
      'Kullanıcı Şifresini E-posta Bağlantısı İle Başarıyla Sıfırladı (Tüm Eski Oturumlar Kapatıldı)',
      'high'
    );

    return {
      success: true,
      message: 'Şifreniz başarıyla yenilendi. Tüm eski oturumlarınız kapatıldı. Şimdi yeni şifrenizle giriş yapabilirsiniz.',
    };
  }
}

export const passwordResetService = PasswordResetService.getInstance();
