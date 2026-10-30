import { Module } from '@nestjs/common';
import { MicrosoftSessionGuard } from '../auth/microsoft-session.guard';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { PlannerController } from './planner.controller';
import { PlannerService } from './planner.service';

@Module({
  imports: [MicrosoftModule],
  controllers: [PlannerController],
  providers: [PlannerService, MicrosoftSessionGuard],
})
export class PlannerModule {}
