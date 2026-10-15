import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantModule } from '../tenant/tenant.module';

@Global()
@Module({
  imports: [TenantModule],
  providers: [PrismaService],
  exports: [PrismaService, TenantModule],
})
export class PrismaModule {}
