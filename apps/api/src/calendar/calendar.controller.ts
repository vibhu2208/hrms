import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
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

  @Post('meetings')
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  createMeeting(@CurrentUser() user: any, @Body() body: CreateMeetingDto) {
    const attendees = (body.attendees || '')
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .filter(Boolean);
    return this.calendar.createMeeting(user.id, {
      subject: body.subject || '',
      date: body.date || '',
      startTime: body.startTime || '',
      endTime: body.endTime || '',
      timeZone: body.timeZone,
      description: body.description,
      attendees,
    });
  }

  @Get('upcoming')
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  upcoming(
    @CurrentUser() user: any,
    @Query('timeZone') timeZone?: string,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Number(days) : undefined;
    return this.calendar.upcoming(user.id, timeZone || 'UTC', Number.isFinite(parsed) ? parsed : undefined);
  }
}
