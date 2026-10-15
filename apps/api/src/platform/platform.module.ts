import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantModule } from '../tenant/tenant.module';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformAuthGuard } from './platform-auth.guard';

@Module({
  imports: [
    TenantModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'go-staff-dev-secret',
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') || '7d' },
      }),
    }),
  ],
  providers: [PlatformService, PlatformAuthGuard],
  controllers: [PlatformController],
})
export class PlatformModule {}
