import { Module } from '@nestjs/common';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { PlannerController } from './planner.controller';
import { PlannerService } from './planner.service';

@Module({
  imports: [MicrosoftModule],
  controllers: [PlannerController],
  providers: [PlannerService],
})
export class PlannerModule {}
