import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';

@Controller('alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'MANAGEMENT')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get('rules')
  rules() {
    return this.alerts.listRules();
  }

  @Post('rules')
  upsert(@Body() body: any) {
    return this.alerts.upsertRule(body);
  }

  @Post('run')
  run() {
    return this.alerts.runChecks();
  }
}
