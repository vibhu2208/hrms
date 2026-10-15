import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { readJwtPayload } from './host';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantRecord, tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantConnectionManager) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const headerHost = firstHeader(req.headers['x-tenant-host']);
      const queryHost = typeof req.query.host === 'string' ? req.query.host : '';
      const slugHint = tenantSlugHint(req);
      let tenant: TenantRecord | null = null;
      if (headerHost || queryHost) {
        tenant = await this.tenants.resolveHost(headerHost || queryHost);
      } else if (slugHint) {
        tenant = await this.tenants.bySlug(slugHint);
      } else {
        tenant = await this.tenants.resolveHost(req.headers.host || '');
      }

      if (!tenant) {
        const path = `${req.originalUrl || ''} ${req.url || ''} ${req.path || ''}`;
        if (path.includes('/platform')) {
          next();
          return;
        }
        res.status(404).json({ message: 'Unknown company for this address.' });
        return;
      }

      const client = this.tenants.clientFor(tenant);
      tenantStorage.run({ tenant, client }, () => next());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Company lookup failed.';
      res.status(503).json({ message });
    }
  }
}

function firstHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || '';
  return value?.trim() || '';
}

function tenantSlugHint(req: Request) {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (state) {
    const payload = readJwtPayload(state);
    if (payload?.purpose === 'ms-sso' && typeof payload.tenantSlug === 'string') {
      return payload.tenantSlug;
    }
  }
  const header = firstHeader(req.headers['x-tenant-slug']);
  return header || null;
}
