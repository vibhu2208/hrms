import { Module } from '@nestjs/common';
import { PlatformPrismaService } from '../platform/platform-prisma.service';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  providers: [PlatformPrismaService, TenantConnectionManager, TenantMiddleware],
  controllers: [TenantController],
  exports: [PlatformPrismaService, TenantConnectionManager, TenantMiddleware],
})
export class TenantModule {}
