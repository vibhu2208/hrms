import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';

/** Public careers endpoints — no JWT required (for website embedding later). */
@Controller('careers')
export class CareersController {
  constructor(private recruitment: RecruitmentService) {}

  @Get('jobs')
  listJobs() {
    return this.recruitment.listPublicJobs();
  }

  @Get('jobs/:idOrSlug')
  getJob(@Param('idOrSlug') idOrSlug: string) {
    return this.recruitment.getPublicJob(idOrSlug);
  }

  @Post('jobs/:idOrSlug/apply')
  apply(@Param('idOrSlug') idOrSlug: string, @Body() body: any) {
    return this.recruitment.apply(idOrSlug, body);
  }
}
