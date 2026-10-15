import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';

export type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  hosts: string[];
  databaseUrl: string | null;
  ownerEmail: string;
};

export type TenantStore = {
  tenant: TenantRecord;
  client: PrismaClient;
};

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantContext() {
  return tenantStorage.getStore() || null;
}
