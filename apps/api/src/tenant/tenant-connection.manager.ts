import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '../platform/platform-prisma.service';
import { databaseUrlForTenant } from './database-url';
import { hostnameOf, slugFromHost } from './host';
import { getTenantContext, TenantRecord } from './tenant.context';

@Injectable()
export class TenantConnectionManager implements OnModuleInit, OnModuleDestroy {
  private readonly clients = new Map<string, PrismaClient>();
  private tenants: TenantRecord[] = [];
  private loadedAt = 0;

  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  async onModuleDestroy() {
    await Promise.all([...this.clients.values()].map((client) => client.$disconnect()));
    this.clients.clear();
  }

  async reload() {
    const rows = await this.platform.tenant.findMany({ orderBy: { name: 'asc' } });
    this.tenants = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      schemaName: row.schemaName,
      hosts: row.hosts,
      databaseUrl: row.databaseUrl,
      ownerEmail: row.ownerEmail,
    }));
    this.loadedAt = Date.now();
  }

  private async ensureFresh() {
    if (Date.now() - this.loadedAt > 15_000) await this.reload();
  }

  async bySlug(slug: string) {
    await this.ensureFresh();
    return this.tenants.find((tenant) => tenant.slug === slug) || null;
  }

  async resolveHost(host: string) {
    await this.ensureFresh();
    const hostname = hostnameOf(host);
    if (!hostname) return null;
    const exact = this.tenants.find((tenant) =>
      tenant.hosts.some((item) => hostnameOf(item) === hostname),
    );
    if (exact) return exact;
    const slug = slugFromHost(hostname);
    if (!slug) return null;
    return this.tenants.find((tenant) => tenant.slug === slug) || null;
  }

  clientFor(tenant: TenantRecord) {
    const baseUrl = this.config.get<string>('DATABASE_URL') || process.env.DATABASE_URL || '';
    const url = databaseUrlForTenant(tenant, baseUrl);
    const cached = this.clients.get(url);
    if (cached) return cached;
    const client = new PrismaClient({ datasources: { db: { url } } });
    this.clients.set(url, client);
    return client;
  }

  currentClient() {
    return getTenantContext()?.client || null;
  }
}
