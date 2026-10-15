import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantConnectionManager } from '../tenant/tenant-connection.manager';

export interface PrismaService extends PrismaClient {}

@Injectable()
export class PrismaService {
  constructor(private readonly connections: TenantConnectionManager) {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'then') return undefined;
        if (
          prop === 'connections' ||
          prop === 'onModuleInit' ||
          prop === 'onApplicationBootstrap' ||
          prop === 'onModuleDestroy' ||
          prop === 'onApplicationShutdown'
        ) {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        const client = target.connections.currentClient();
        if (!client) {
          throw new Error('No company selected for this request.');
        }
        const value = Reflect.get(client, prop, client);
        return typeof value === 'function' ? value.bind(client) : value;
      },
    });
  }
}
