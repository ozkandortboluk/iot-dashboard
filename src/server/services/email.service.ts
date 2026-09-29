import nodemailer from 'nodemailer';
import { db } from '../db.js';
import { maskSecret } from '../utils/crypto.js';
import { systemSecretsService } from './systemSecrets.service.js';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  dedupKey?: string;
  tenantId?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  provider: 'resend' | 'smtp' | 'simulated';
  error?: string;
  simulated?: boolean;
  domainUnverified?: boolean;
}

export interface EmailConfigPublic {
  enabled: boolean;
  provider: 'resend' | 'smtp' | 'simulated';
  fromEmail: string;
  fromName: string;
  resendApiKeyMasked: string;
  hasResendApiKey: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassMasked: string;
  hasSmtpPass: boolean;
  appBaseUrl: string;
  isConfigured: boolean;
}

export class EmailService {
  private static instance: EmailService;
  private dedupCache = new Map<string, { timestamp: number; result: SendEmailResult }>();

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Resolves the active Resend API key:
   * Prioritizes DB configured key, falling back to process.env.RESEND_API_KEY if valid.
   */
  public getResendApiKey(): string {
    try {
      const config = db.getServiceConfig(true);
      if (config.email?.resendApiKey && config.email.resendApiKey.trim().length > 0) {
        return config.email.resendApiKey.trim();
      }
    } catch {
      // Fallback
    }

    const fromVault = systemSecretsService.getResendApiKey();
    if (fromVault && fromVault.startsWith('re_')) {
      return fromVault;
    }

    const fromEnv = (process.env.RESEND_API_KEY || '').trim();
    if (fromEnv && fromEnv.startsWith('re_')) {
      return fromEnv;
    }
    return '';
  }

  /**
   * Resolves the public Base URL for system-generated links (e.g. password reset)
   */
  public getAppBaseUrl(): string {
    let rawUrl = (process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
    if (!rawUrl) {
      try {
        const config = db.getServiceConfig(true);
        if ((config.email as any)?.appBaseUrl) {
          rawUrl = (config.email as any).appBaseUrl.trim();
        }
      } catch {
        // Fallback
      }
    }
    if (!rawUrl) {
      rawUrl = 'https://nexusnodeiot.com.tr';
    }

    const clean = rawUrl.replace(/\/$/, '');
    // HTTPS Enforcement for external production domains
    if (process.env.NODE_ENV === 'production' && clean.startsWith('http://') && !clean.includes('localhost') && !clean.includes('127.0.0.1')) {
      return clean.replace(/^http:\/\//i, 'https://');
    }
    return clean;
  }

  /**
   * Resolves the default sender address
   * Default: NexusNode IoT <bildirim@nexusnodeiot.com.tr>
   */
  public getFromAddress(): string {
    try {
      const config = db.getServiceConfig(true);
      if (config.email?.fromEmail && config.email.fromEmail.includes('@')) {
        const name = config.email.fromName || 'NexusNode IoT';
        return `${name} <${config.email.fromEmail}>`;
      }
    } catch {
      // Fallback
    }

    const fromEnv = (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || '').trim();
    if (fromEnv && fromEnv.includes('@')) {
      return fromEnv;
    }

    return 'NexusNode IoT <sistem@bildirim.nexusnodeiot.com.tr>';
  }

  /**
   * Returns public-safe email server configuration for UI display
   */
  public getEmailConfig(): EmailConfigPublic {
    let emailConfig: any = {};
    try {
      const config = db.getServiceConfig(true);
      emailConfig = config.email || {};
    } catch {
      // Fallback
    }

    const resendKey = this.getResendApiKey();
    const vaultSmtpPass = systemSecretsService.getSmtpPassword();
    const smtpPass = emailConfig.smtpPass || vaultSmtpPass || process.env.SMTP_PASS || '';
    const smtpHost = emailConfig.smtpHost || process.env.SMTP_HOST || '';
    const smtpPort = Number(emailConfig.smtpPort || process.env.SMTP_PORT || 587);
    const smtpSecure = Boolean(emailConfig.smtpSecure ?? (smtpPort === 465));
    const smtpUser = emailConfig.smtpUser || process.env.SMTP_USER || '';
    const appBaseUrl = this.getAppBaseUrl();

    let provider: 'resend' | 'smtp' | 'simulated' = 'simulated';
    if (emailConfig.provider === 'smtp') {
      provider = 'smtp';
    } else if (emailConfig.provider === 'resend') {
      provider = 'resend';
    } else if (emailConfig.provider === 'simulated') {
      provider = 'simulated';
    } else if (resendKey) {
      provider = 'resend';
    } else if (smtpHost) {
      provider = 'smtp';
    }

    const isConfigured = Boolean(
      (provider === 'resend' && resendKey) ||
      (provider === 'smtp' && smtpHost)
    );

    return {
      enabled: emailConfig.enabled !== false,
      provider,
      fromEmail: emailConfig.fromEmail || 'bildirim@nexusnodeiot.com.tr',
      fromName: emailConfig.fromName || 'NexusNode IoT Cloud',
      resendApiKeyMasked: maskSecret(resendKey),
      hasResendApiKey: Boolean(resendKey && resendKey.length > 0),
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassMasked: maskSecret(smtpPass),
      hasSmtpPass: Boolean(smtpPass && smtpPass.length > 0),
      appBaseUrl,
      isConfigured,
    };
  }

  /**
   * Updates email server configuration safely
   */
  public updateEmailConfig(update: Partial<EmailConfigPublic & { resendApiKey?: string; smtpPass?: string }>): EmailConfigPublic {
    const current = db.getServiceConfig(true);
    const currentEmail = current.email || ({} as any);

    let finalResendApiKey = (currentEmail as any)?.resendApiKey || '';
    if (update.resendApiKey !== undefined) {
      const incoming = (update.resendApiKey || '').trim().replace(/^["']|["']$/g, '');
      if (incoming && !incoming.includes('••••') && !incoming.includes('****')) {
        finalResendApiKey = incoming;
      } else if (!incoming) {
        finalResendApiKey = '';
      }
    }

    let finalSmtpPass = (currentEmail as any)?.smtpPass || '';
    if (update.smtpPass !== undefined) {
      const incoming = (update.smtpPass || '').trim();
      if (incoming && !incoming.includes('••••') && !incoming.includes('****')) {
        finalSmtpPass = incoming;
      } else if (!incoming) {
        finalSmtpPass = '';
      }
    }

    const newEmailConfig = {
      ...currentEmail,
      enabled: update.enabled !== undefined ? update.enabled : currentEmail?.enabled,
      provider: update.provider || currentEmail?.provider || 'resend',
      fromEmail: update.fromEmail !== undefined ? update.fromEmail.trim() : currentEmail?.fromEmail,
      fromName: update.fromName !== undefined ? update.fromName.trim() : currentEmail?.fromName,
      smtpHost: update.smtpHost !== undefined ? update.smtpHost.trim() : currentEmail?.smtpHost,
      smtpPort: update.smtpPort !== undefined ? Number(update.smtpPort) : currentEmail?.smtpPort,
      smtpSecure: update.smtpSecure !== undefined ? Boolean(update.smtpSecure) : (currentEmail as any)?.smtpSecure,
      smtpUser: update.smtpUser !== undefined ? update.smtpUser.trim() : currentEmail?.smtpUser,
      appBaseUrl: update.appBaseUrl !== undefined ? update.appBaseUrl.trim() : (currentEmail as any)?.appBaseUrl,
      resendApiKey: finalResendApiKey,
      smtpPass: finalSmtpPass,
    };

    db.updateServiceConfig({ email: newEmailConfig as any });
    return this.getEmailConfig();
  }

  /**
   * Returns whether a real external email service is configured
   */
  public isConfigured(): boolean {
    const config = this.getEmailConfig();
    return config.isConfigured;
  }

  /**
   * Sends an email via Resend API, SMTP or safe simulation
   */
  public async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, html, text, from, dedupKey } = options;
    const emailConfig = this.getEmailConfig();
    const fromAddress = from || this.getFromAddress();

    if (dedupKey) {
      const cached = this.dedupCache.get(dedupKey);
      if (cached && Date.now() - cached.timestamp < 30000) {
        console.log(`[EmailService] Yinelenen e-posta gönderim talebi engellendi (DedupKey: ${dedupKey})`);
        return cached.result;
      }
    }

    if (!to || !to.includes('@')) {
      return {
        success: false,
        provider: emailConfig.provider,
        error: `Geçersiz alıcı e-posta adresi: "${to}"`,
      };
    }

    // 1. Explicit Simulation Provider
    if (emailConfig.provider === 'simulated') {
      const simMessageId = `sim_resend_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      console.log('\n================== [EMAIL SERVICE SIMULATION] ==================');
      console.log(`[Kimden]     : ${fromAddress}`);
      console.log(`[Kime]       : ${to}`);
      console.log(`[Konu]       : ${subject}`);
      console.log(`[Mesaj ID]   : ${simMessageId}`);
      if (text) {
        const sanitizedText = text.replace(/(token=)[a-zA-Z0-9_-]{16,}/gi, '$1[MASKED_RECOVERY_TOKEN]');
        console.log(`[Metin İçeriği]:\n${sanitizedText}`);
      }
      console.log('================================================================\n');

      const simResult: SendEmailResult = {
        success: true,
        provider: 'simulated',
        messageId: simMessageId,
        simulated: true,
      };
      if (dedupKey) {
        this.dedupCache.set(dedupKey, { timestamp: Date.now(), result: simResult });
      }
      return simResult;
    }

    // 2. SMTP Provider
    if (emailConfig.provider === 'smtp' && emailConfig.smtpHost) {
      try {
        const fullConfig = db.getServiceConfig(true);
        const smtpPass = (fullConfig.email as any)?.smtpPass || process.env.SMTP_PASS || '';

        const transporter = nodemailer.createTransport({
          host: emailConfig.smtpHost,
          port: emailConfig.smtpPort,
          secure: emailConfig.smtpSecure,
          auth: emailConfig.smtpUser ? {
            user: emailConfig.smtpUser,
            pass: smtpPass,
          } : undefined,
          tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production',
          },
        });

        const info = await transporter.sendMail({
          from: fromAddress,
          to: to.trim(),
          subject: subject.trim(),
          text,
          html,
        });

        console.log(`[EmailService] SMTP ile e-posta başarıyla iletildi (${to}): Message ID ${info.messageId}`);
        const smtpResult: SendEmailResult = {
          success: true,
          provider: 'smtp',
          messageId: info.messageId,
        };
        if (dedupKey) {
          this.dedupCache.set(dedupKey, { timestamp: Date.now(), result: smtpResult });
        }
        return smtpResult;
      } catch (smtpErr: any) {
        console.error(`[EmailService] SMTP Hatası (${to}):`, smtpErr?.message || smtpErr);
        return {
          success: false,
          provider: 'smtp',
          error: `SMTP Gönderim Hatası: ${smtpErr?.message || 'Bilinmeyen hata'}`,
        };
      }
    }

    // 3. Resend API Provider
    if (emailConfig.provider === 'resend') {
      const apiKey = this.getResendApiKey();
      if (!apiKey) {
        return {
          success: false,
          provider: 'resend',
          error: 'Resend API Anahtarı bulunamadı veya yapılandırılmadı. Lütfen E-Posta Sunucu Ayarlarından "re_" ile başlayan geçerli bir Resend API Anahtarı girip kaydediniz.',
        };
      }

      const payload: Record<string, any> = {
        from: fromAddress,
        to: [to.trim()],
        subject: subject.trim(),
        html,
      };
      if (text) {
        payload.text = text;
      }

      let lastResult: SendEmailResult | null = null;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const backoffMs = attempt * 1000;
          console.log(`[EmailService] Resend API geçici hata nedeniyle ${backoffMs}ms sonra tekrar deneniyor (Deneme ${attempt + 1}/${maxRetries + 1})...`);
          await new Promise(r => setTimeout(r, backoffMs));
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));

          const data: any = await response.json().catch(() => ({}));

          if (!response.ok) {
            const rawMessage = data?.message || data?.error?.message || (typeof data === 'string' ? data : `HTTP ${response.status} Resend Gönderim Hatası`);
            console.error(`[EmailService] Resend API Hatası (${to}, HTTP ${response.status}):`, rawMessage);

            const isTransient = response.status === 429 || response.status >= 500;
            const lowerErr = rawMessage.toLowerCase();
            const isDomainUnverified = lowerErr.includes('not verified') || 
                                      (lowerErr.includes('domain') && lowerErr.includes('verify')) ||
                                      lowerErr.includes('testing emails') ||
                                      lowerErr.includes('own email address');

            let formattedError = rawMessage;
            if (isDomainUnverified) {
              const domainMatch = fromAddress.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
              const domainName = domainMatch ? domainMatch[1] : 'alan adınız';
              if (lowerErr.includes('testing emails') || lowerErr.includes('own email address')) {
                formattedError = `Resend Test Modu Kısıtlaması: Resend 'onboarding@resend.dev' adresini kullanırken yalnızca kendi Resend hesabınıza kayıtlı e-posta adresine mail gönderebilirsiniz (${to}). Farklı alıcılara mail gönderebilmek için Resend panelinden (https://resend.com/domains) kendi alan adınızı doğrulamanız gerekmektedir.`;
              } else {
                formattedError = `Resend Alan Adı Doğrulama Hatası: '${domainName}' alan adı Resend hesabınızda henüz doğrulanmamış. Lütfen Resend panelinden (https://resend.com/domains) alan adınızı doğrulayın veya test amaçlı 'onboarding@resend.dev' e-posta adresini kullanın.`;
              }
            } else if (response.status === 401 || lowerErr.includes('invalid_api_key') || lowerErr.includes('api key') || lowerErr.includes('unauthorized')) {
              formattedError = `Geçersiz Resend API Anahtarı: Girilen Resend API Anahtarı (re_...) geçersiz veya yetkisiz. Lütfen Resend panelinden (https://resend.com/api-keys) 're_' ile başlayan aktif bir API anahtarı alıp kaydediniz.`;
            } else if (lowerErr.includes('from') && (lowerErr.includes('invalid') || lowerErr.includes('format'))) {
              formattedError = `Geçersiz Gönderici E-posta Adresi: Gönderici e-posta adresi ('${fromAddress}') geçerli değil. Test için 'onboarding@resend.dev' veya kendi doğrulanmış alan adınızı kullanınız.`;
            }

            lastResult = {
              success: false,
              provider: 'resend',
              error: formattedError,
              domainUnverified: isDomainUnverified,
            };

            // Retry ONLY on transient status (429 Rate Limit or 5xx Server Error)
            if (isTransient && attempt < maxRetries) {
              continue;
            }
            return lastResult;
          }

          console.log(`[EmailService] Resend ile e-posta başarıyla iletildi (${to}): Message ID ${data?.id}`);
          const successResult: SendEmailResult = {
            success: true,
            provider: 'resend',
            messageId: data?.id,
          };
          if (dedupKey) {
            this.dedupCache.set(dedupKey, { timestamp: Date.now(), result: successResult });
          }
          return successResult;
        } catch (networkErr: any) {
          console.error(`[EmailService] Ağ bağlantı hatası (${to}):`, networkErr?.message || networkErr);
          lastResult = {
            success: false,
            provider: 'resend',
            error: `Resend servisine ulaşılamadı: ${networkErr?.message || 'Ağ hatası'}`,
          };
          if (attempt < maxRetries) {
            continue;
          }
        }
      }
      return lastResult || { success: false, provider: 'resend', error: 'Resend e-posta gönderimi başarısız.' };
    }

    // 4. Safe Simulated fallback (when credentials are not yet entered or provider is unconfigured)
    const simMessageId = `sim_resend_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log('\n================== [EMAIL SERVICE SIMULATION] ==================');
    console.log(`[Kimden]     : ${fromAddress}`);
    console.log(`[Kime]       : ${to}`);
    console.log(`[Konu]       : ${subject}`);
    console.log(`[Mesaj ID]   : ${simMessageId}`);
    if (text) {
      console.log(`[Metin İçeriği]:\n${text}`);
    }
    console.log('================================================================\n');

    return {
      success: true,
      provider: 'simulated',
      messageId: simMessageId,
      simulated: true,
    };
  }

  /**
   * Generates and dispatches a secure OWASP-compliant Password Reset Email
   */
  public async sendPasswordResetEmail(params: {
    to: string;
    userName: string;
    resetUrl: string;
    expiresInMinutes?: number;
  }): Promise<SendEmailResult> {
    const { to, userName, resetUrl, expiresInMinutes = 15 } = params;

    const subject = 'NexusNode IoT Cloud - Güvenli Şifre Sıfırlama Talebi';

    const text = `Merhaba ${userName || 'Kullanıcı'},

NexusNode IoT Cloud hesabınız için şifre sıfırlama talebinde bulunuldu.

Şifrenizi sıfırlamak için aşağıdaki bağlantıyı tarayıcınıza kopyalayın:
${resetUrl}

Bu bağlantı ${expiresInMinutes} dakika boyunca geçerlidir ve yalnızca tek bir kez kullanılabilir.

Eğer bu talebi siz yapmadıysanız bu e-postayı dikkate almayınız. Hesabınız güvendedir ve mevcut şifreniz değişmemiştir.

NexusNode IoT Güvenlik Ekibi
https://nexusnodeiot.com.tr
`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Şifre Sıfırlama Talebi</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #111827; border-radius: 16px; border: 1px solid #1f2937; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid #312e81; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                <span style="color: #6366f1;">Nexus</span>Node <span style="color: #38bdf8;">IoT</span>
              </div>
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-top: 4px;">
                Endüstriyel Bulut Platformu
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
                Şifre Sıfırlama Talebi
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Merhaba <strong style="color: #ffffff;">${userName || 'Değerli Kullanıcımız'}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                NexusNode IoT Cloud hesabınız için şifre sıfırlama talebinde bulundunuz. Yeni bir şifre belirlemek için aşağıdaki güvenli bağlantı düğmesine tıklayın:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 10px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4); text-align: center;">
                      Şifremi Sıfırla &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                Veya aşağıdaki bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırabilirsiniz:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; line-height: 1.5; word-break: break-all; background-color: #1f2937; padding: 12px; border-radius: 8px; color: #818cf8; border: 1px solid #374151;">
                ${resetUrl}
              </p>

              <!-- Security Notice -->
              <div style="background-color: #1e1b4b; border-left: 4px solid #6366f1; padding: 14px 16px; border-radius: 6px; margin: 24px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #c7d2fe;">
                  <strong>Güvenlik Uyarısı:</strong> Bu bağlantı <strong>${expiresInMinutes} dakika</strong> boyunca geçerlidir ve yalnızca tek bir kez kullanılabilir. Eğer bu talebi siz yapmadıysanız lütfen bu e-postayı dikkate almayınız; hesabınız güvendedir.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0d131f; border-top: 1px solid #1f2937; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              &copy; ${new Date().getFullYear()} NexusNode IoT Cloud. Tüm hakları saklıdır.<br>
              Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    return this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Sends a test email to verify Resend or SMTP connectivity
   */
  public async sendTestEmail(params: { to: string }): Promise<SendEmailResult> {
    const { to } = params;
    const now = new Date().toLocaleString('tr-TR');
    const config = this.getEmailConfig();

    const subject = `NexusNode IoT - E-posta Sunucu Test Gönderimi (${now})`;

    const text = `Tebrikler!

NexusNode IoT Cloud e-posta sunucu entegrasyonu başarıyla çalışmaktadır.
Gönderici Adresi : ${this.getFromAddress()}
Tarih/Saat       : ${now}
Hizmet Sağlayıcı : ${config.provider.toUpperCase()} (${config.isConfigured ? 'Canlı / Aktif' : 'Simülasyon Modu'})
Platform URL     : ${config.appBaseUrl}
`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>E-Posta Testi</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 24px;">
  <div style="max-width: 540px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px;">
    <h2 style="color: #6366f1; margin-top: 0;">✅ NexusNode IoT E-Posta Testi Başarılı</h2>
    <p style="color: #94a3b8; font-size: 14px;">Tebrikler! Sunucu e-posta ayarlarınız ve bağlantınız sorunsuz şekilde doğrulanmıştır.</p>
    <div style="background: #1e293b; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.8; color: #e2e8f0; margin: 16px 0;">
      <div><strong>Sağlayıcı:</strong> <span style="color: #38bdf8;">${config.provider.toUpperCase()}</span> (${config.isConfigured ? '<span style="color: #10b981;">Canlı</span>' : '<span style="color: #f59e0b;">Simülasyon</span>'})</div>
      <div><strong>Gönderici:</strong> ${this.getFromAddress()}</div>
      <div><strong>Alıcı:</strong> ${to}</div>
      <div><strong>Tarih:</strong> ${now}</div>
      <div><strong>Platform Adresi:</strong> ${config.appBaseUrl}</div>
    </div>
    <div style="font-size: 11px; color: #64748b; text-align: center; margin-top: 16px;">
      NexusNode IoT Cloud &bull; Güvenlik & Bildirim Servisi
    </div>
  </div>
</body>
</html>
`;

    return this.sendEmail({
      to,
      subject,
      html,
      text,
    });
  }
}

export const emailService = EmailService.getInstance();
