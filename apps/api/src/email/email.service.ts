import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendResult = { delivered: boolean; mode: 'graph' | 'smtp' | 'log' };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private graphToken: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async send(input: SendMailInput): Promise<SendResult> {
    const tenantId = this.config.get<string>('MS_TENANT_ID')?.trim();
    const clientId = this.config.get<string>('MS_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MS_CLIENT_SECRET')?.trim();
    const mailUser =
      this.config.get<string>('MS_MAIL_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      'connect@aithworld.com';

    // Prefer Microsoft Graph (works without app passwords / SMTP basic auth)
    if (tenantId && clientId && clientSecret) {
      return this.sendViaGraph(input, { tenantId, clientId, clientSecret, mailUser });
    }

    return this.sendViaSmtp(input, mailUser);
  }

  private async sendViaGraph(
    input: SendMailInput,
    cfg: { tenantId: string; clientId: string; clientSecret: string; mailUser: string },
  ): Promise<SendResult> {
    const token = await this.getGraphToken(cfg);
    const html =
      input.html ||
      `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(input.text)}</div>`;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.mailUser)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: true,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(
        `[email:graph] failed to=${input.to} subject="${input.subject}": ${res.status} ${body}`,
      );
      throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${body}`);
    }

    this.logger.log(`[email:graph] sent to=${input.to} subject="${input.subject}"`);
    return { delivered: true, mode: 'graph' };
  }

  private async getGraphToken(cfg: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  }): Promise<string> {
    const now = Date.now();
    if (this.graphToken && this.graphToken.expiresAt > now + 60_000) {
      return this.graphToken.value;
    }

    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !data.access_token) {
      throw new Error(
        `Microsoft Graph token failed: ${data.error_description || data.error || res.status}`,
      );
    }

    this.graphToken = {
      value: data.access_token,
      expiresAt: now + (data.expires_in || 3600) * 1000,
    };
    return data.access_token;
  }

  private async sendViaSmtp(input: SendMailInput, mailUser: string): Promise<SendResult> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from =
      this.config.get<string>('SMTP_FROM') ||
      `Go Staff Careers <${mailUser}>`;

    if (!host) {
      this.logger.log(
        `[email:log] to=${input.to} subject="${input.subject}"\n${input.text}`,
      );
      return { delivered: false, mode: 'log' };
    }

    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER')?.trim() || mailUser;
    const pass = this.config.get<string>('SMTP_PASS');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: user ? { user, pass } : undefined,
      tls: { minVersion: 'TLSv1.2' },
    });

    try {
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html:
          input.html ||
          `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(input.text)}</div>`,
        replyTo: user || undefined,
      });
      this.logger.log(`[email:smtp] sent to=${input.to} subject="${input.subject}"`);
      return { delivered: true, mode: 'smtp' };
    } catch (err: any) {
      this.logger.error(
        `[email:smtp] failed to=${input.to} subject="${input.subject}": ${err?.message || err}`,
      );
      throw err;
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
