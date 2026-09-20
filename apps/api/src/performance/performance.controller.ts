import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceController {
  constructor(private performance: PerformanceService) {}

  @Get()
  @Roles('OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER')
  list(
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
  ) {
    return this.performance.list({
      departmentId,
      employeeId,
      minScore: minScore ? Number(minScore) : undefined,
      maxScore: maxScore ? Number(maxScore) : undefined,
    });
  }

  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.performance.myLatest(user.employeeId);
  }

  @Get('history/:employeeId')
  history(@Param('employeeId') employeeId: string) {
    return this.performance.history(employeeId);
  }

  @Get('colleagues')
  colleagues(@CurrentUser() user: any) {
    return this.performance.colleagues(user.role);
  }

  @Post('recompute')
  @Roles('OWNER', 'HR')
  recompute() {
    return this.performance.recomputeAll();
  }
}
