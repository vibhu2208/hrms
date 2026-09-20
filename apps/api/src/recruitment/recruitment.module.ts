import { Module } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { RecruitmentController } from './recruitment.controller';
import { CareersController } from './careers.controller';

@Module({
  providers: [RecruitmentService],
  controllers: [RecruitmentController, CareersController],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
