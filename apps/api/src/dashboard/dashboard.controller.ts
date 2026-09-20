import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('overview')
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  overview() {
    return this.dashboard.overview();
  }

  @Get('revenue')
  @Roles('OWNER', 'MANAGEMENT')
  revenue(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboard.revenue(period, from, to);
  }

  @Get('accounts')
  @Roles('OWNER', 'MANAGEMENT')
  accounts() {
    return this.dashboard.accounts();
  }

  @Get('aging')
  @Roles('OWNER', 'MANAGEMENT')
  aging() {
    return this.dashboard.aging();
  }

  @Get('sales')
  @Roles('OWNER', 'MANAGEMENT')
  sales() {
    return this.dashboard.sales();
  }

  @Get('operations')
  @Roles('OWNER', 'MANAGEMENT')
  operations() {
    return this.dashboard.operations();
  }
}
