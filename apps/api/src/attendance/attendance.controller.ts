import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Post('check-in')
  checkIn(@CurrentUser() user: any) {
    return this.attendance.checkIn(user.employeeId);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: any) {
    return this.attendance.checkOut(user.employeeId);
  }

  @Get('today')
  today(@CurrentUser() user: any) {
    return this.attendance.todayStatus(user.employeeId);
  }

  @Get('mine')
  mine(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.history(user.employeeId, from, to);
  }

  @Get()
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  list(@Query('date') date?: string, @Query('departmentId') departmentId?: string) {
    return this.attendance.listAll({ date, departmentId });
  }

  @Post('mark/:employeeId')
  @Roles('OWNER', 'HR')
  mark(@Param('employeeId') employeeId: string, @Body() body: any) {
    return this.attendance.mark(employeeId, body);
  }
}
