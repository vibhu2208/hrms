import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PlatformPrismaService } from './platform-prisma.service';
import { CreateTenantDto, PlatformLoginDto, UpdateMailFromDto } from './dto/platform.dto';
import { schemaNameFromSlug, withSchema } from '../tenant/database-url';
import { hostnameOf } from '../tenant/host';
import { ensureSchema, prismaPush, seedTenantDatabase } from '../tenant/provision';
import { TenantConnectionManager } from '../tenant/tenant-connection.manager';
import { normalizeMailAddress } from '../email/mail-address';

const RESERVED = new Set(['platform', 'www', 'api', 'app', 'localhost']);

@Injectable()
export class PlatformService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly connections: TenantConnectionManager,
  ) {}

  async login(dto: PlatformLoginDto) {
    const email = dto.email.trim().toLowerCase();
    const admin = await this.platform.superAdmin.findUnique({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return {
      accessToken: this.jwt.sign({ sub: admin.id, email: admin.email, kind: 'platform' }),
      user: { id: admin.id, email: admin.email },
    };
  }

  async list() {
    const tenants = await this.platform.tenant.findMany({ orderBy: { name: 'asc' } });
    return tenants.map(presentTenant);
  }

  async create(dto: CreateTenantDto) {
    const slug = dto.slug.trim().toLowerCase();
    if (RESERVED.has(slug)) throw new BadRequestException('That web address is reserved.');
    const taken = await this.platform.tenant.findUnique({ where: { slug } });
    if (taken) throw new ConflictException('A company with this web address already exists.');

    const schemaName = schemaNameFromSlug(slug);
    const host = hostnameOf(dto.host?.trim() || `${slug}.localhost`);
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      throw new BadRequestException('Enter a company web address such as acme.localhost.');
    }
    const baseUrl = this.config.get<string>('DATABASE_URL') || '';
    if (!baseUrl) throw new BadRequestException('DATABASE_URL is not configured.');
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const mailFrom = normalizeMailAddress(dto.mailFrom);
    const ownerPassword = dto.ownerPassword?.trim() || 'password123';
    const databaseUrl = dto.databaseUrl?.trim() || '';
    const tenantUrl = databaseUrl || withSchema(baseUrl, schemaName);

    if (!databaseUrl) await ensureSchema(baseUrl, schemaName);
    await prismaPush(tenantUrl);
    await seedTenantDatabase(tenantUrl, {
      SEED_PROFILE: 'minimal',
      SEED_COMPANY_NAME: dto.name.trim(),
      SEED_OWNER_EMAIL: ownerEmail,
      SEED_OWNER_FIRST: dto.ownerFirstName.trim(),
      SEED_OWNER_LAST: dto.ownerLastName.trim(),
      SEED_OWNER_PASSWORD: ownerPassword,
      SEED_MAIL_FROM: mailFrom,
      SEED_EMPLOYEE_CODE: `${schemaName.replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase()}-001`,
    });

    const tenant = await this.platform.tenant.create({
      data: {
        name: dto.name.trim(),
        slug,
        schemaName,
        hosts: [host],
        databaseUrl: databaseUrl || null,
        ownerEmail,
        mailFrom,
      },
    });
    await this.connections.reload();
    return { ...presentTenant(tenant), ownerPassword };
  }

  async setMailFrom(slug: string, dto: UpdateMailFromDto) {
    const mailFrom = normalizeMailAddress(dto.mailFrom);
    const existing = await this.platform.tenant.findUnique({ where: { slug } });
    if (!existing) throw new BadRequestException('That company was not found.');
    const tenant = await this.platform.tenant.update({
      where: { slug },
      data: { mailFrom },
    });
    await this.connections.reload();
    const record = await this.connections.bySlug(slug);
    if (!record) throw new BadRequestException('That company was not found.');
    const client = this.connections.clientFor(record);
    await client.appSetting.upsert({
      where: { key: 'mail_from' },
      create: { key: 'mail_from', value: mailFrom },
      update: { value: mailFrom },
    });
    return presentTenant(tenant);
  }
}

function presentTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  hosts: string[];
  databaseUrl: string | null;
  ownerEmail: string;
  mailFrom: string | null;
  createdAt: Date;
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    schemaName: tenant.schemaName,
    hosts: tenant.hosts,
    ownerEmail: tenant.ownerEmail,
    mailFrom: tenant.mailFrom,
    hasOwnDatabase: Boolean(tenant.databaseUrl),
    createdAt: tenant.createdAt,
  };
}
