import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OffboardingService } from './offboarding.service';
import { OnboardingController } from './onboarding.controller';
import { OffboardingController } from './offboarding.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [NotificationsModule, UsersModule],
  providers: [OnboardingService, OffboardingService],
  controllers: [OnboardingController, OffboardingController],
  exports: [OnboardingService, OffboardingService],
})
export class LifecycleModule {}
