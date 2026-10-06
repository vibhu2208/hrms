import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MICROSOFT_DELEGATED_SCOPES } from '../microsoft/microsoft.constants';
import { LoginDto } from './dto/login.dto';

function emailFromIdToken(idToken: string) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
    };
    return (payload.email || payload.preferred_username || payload.upn || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        role: { include: { permissions: true } },
        employee: {
          include: { department: true, designation: true },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = this.signSession(user);

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      resource: 'AUTH',
      resourceId: user.id,
    });

    return {
      accessToken: token,
      user: this.sanitize(user),
    };
  }

  microsoftEnabled() {
    return Boolean(this.microsoftConfig());
  }

  microsoftAuthorizeUrl(options?: { prompt?: string; returnTo?: string }) {
    const cfg = this.microsoftConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Microsoft sign-in is not set up yet. Add the Entra app tenant ID, client ID, and client secret.',
      );
    }
    const returnTo = safeTaskReturn(options?.returnTo);
    const state = this.jwt.sign(
      { purpose: 'ms-sso', ...(returnTo ? { returnTo } : {}) },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_DELEGATED_SCOPES,
      state,
      prompt: options?.prompt === 'consent' ? 'consent' : 'select_account',
    });
    return `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize?${params}`;
  }

  webOrigin() {
    return (this.config.get<string>('CORS_ORIGIN') || 'http://localhost:3000')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
  }

  async loginWithMicrosoft(code: string, state: string) {
    const cfg = this.microsoftConfig();
    if (!cfg) {
      throw new ServiceUnavailableException('Microsoft sign-in is not set up yet.');
    }
    let statePayload: { purpose?: string; returnTo?: string };
    try {
      statePayload = this.jwt.verify(state);
    } catch {
      throw new UnauthorizedException('Microsoft sign-in expired. Try again.');
    }
    if (statePayload.purpose !== 'ms-sso') {
      throw new UnauthorizedException('Microsoft sign-in could not be verified. Try again.');
    }

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
          scope: MICROSOFT_DELEGATED_SCOPES,
        }),
      },
    );
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
      error_description?: string;
      error?: string;
    };
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new UnauthorizedException(
        tokenData.error_description || 'Microsoft did not accept the sign-in.',
      );
    }

    let email = '';
    const profileRes = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as {
        mail?: string | null;
        userPrincipalName?: string | null;
      };
      email = (profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
    }
    if (!email && tokenData.id_token) {
      email = emailFromIdToken(tokenData.id_token);
    }
    if (!email || !email.includes('@')) {
      throw new UnauthorizedException('Microsoft did not return a company email for this account.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: { include: { permissions: true } },
        employee: { include: { department: true, designation: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException(
        `No Go Staff account uses ${email}. Ask HR to add you with that company email.`,
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account is disabled.');
    }

    const expiresIn = Number(tokenData.expires_in) || 3600;
    await this.prisma.microsoftAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        scope: tokenData.scope || MICROSOFT_DELEGATED_SCOPES,
      },
      update: {
        accessToken: tokenData.access_token,
        ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        scope: tokenData.scope || MICROSOFT_DELEGATED_SCOPES,
      },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      resource: 'AUTH',
      resourceId: user.id,
      metadata: { method: 'microsoft' },
    });

    return { token: this.signSession(user), returnTo: safeTaskReturn(statePayload.returnTo) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        employee: {
          include: { department: true, designation: true, manager: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  private signSession(user: { id: string; email: string; role: { code: string }; employee?: { id: string } | null }) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role.code,
      employeeId: user.employee?.id,
    });
  }

  private microsoftConfig() {
    const tenantId = this.config.get<string>('MS_TENANT_ID')?.trim();
    const clientId = this.config.get<string>('MS_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MS_CLIENT_SECRET')?.trim();
    if (!tenantId || !clientId || !clientSecret) return null;
    const redirectUri =
      this.config.get<string>('MS_REDIRECT_URI')?.trim() ||
      'http://localhost:4000/api/v1/auth/microsoft/callback';
    return { tenantId, clientId, clientSecret, redirectUri };
  }

  sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }
}

function safeTaskReturn(value?: string | null) {
  if (!value) return undefined;
  const path = value.trim().split('?')[0].replace(/\/+$/, '');
  if (path === '/admin/tasks' || path === '/employee/tasks') return path;
  return undefined;
}
