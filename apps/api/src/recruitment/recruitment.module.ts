import { Module } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { RecruitmentController } from './recruitment.controller';
import { CareersController } from './careers.controller';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [OrgModule],
  providers: [RecruitmentService],
  controllers: [RecruitmentController, CareersController],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
