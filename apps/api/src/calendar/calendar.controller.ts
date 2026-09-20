import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('calendar')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'MANAGEMENT')
export class CalendarController {
  constructor(private calendar: CalendarService) {}

  @Get('auth-url')
  authUrl(@CurrentUser() user: any) {
    return this.calendar.getAuthUrl(user.id);
  }

  @Get('schedule')
  schedule(@CurrentUser() user: any, @Query('view') view?: 'today' | 'week') {
    return this.calendar.schedule(user.id, view || 'today');
  }
}
