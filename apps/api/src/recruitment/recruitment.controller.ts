import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { ApplicationStatus } from '@prisma/client';

@Controller('recruitment')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'HR', 'MANAGEMENT')
export class RecruitmentController {
  constructor(private recruitment: RecruitmentService) {}

  @Get()
  list() {
    return this.recruitment.list();
  }

  @Get('summary')
  summary() {
    return this.recruitment.summary();
  }

  @Get('applications')
  listApplications(
    @Query('positionId') positionId?: string,
    @Query('status') status?: ApplicationStatus,
  ) {
    return this.recruitment.listApplications({ positionId, status });
  }

  @Get('applications/:appId')
  getApplication(@Param('appId') appId: string) {
    return this.recruitment.getApplication(appId);
  }

  @Patch('applications/:appId')
  updateApplication(@Param('appId') appId: string, @Body() body: any) {
    return this.recruitment.updateApplication(appId, body);
  }

  @Post('applications/:appId/email')
  sendEmail(@Param('appId') appId: string, @Body() body: any) {
    return this.recruitment.sendCandidateEmail(appId, body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.recruitment.getById(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.recruitment.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.recruitment.update(id, body);
  }
}
