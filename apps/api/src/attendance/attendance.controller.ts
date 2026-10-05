import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIpFromRequest } from './attendance.logic';
import {
  ExceptionRequestDto,
  LocationFixDto,
  CloseMissedClockOutDto,
  ManualAttendanceDto,
  MissedClockOutDto,
  RejectAttendanceDto,
  UpdateAttendancePolicyDto,
} from './dto/attendance.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Post('verify')
  verify(@CurrentUser() user: any, @Req() req: Request, @Body() body: LocationFixDto) {
    return this.attendance.preview(user.employeeId, clientIpFromRequest(req), body);
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: any, @Req() req: Request, @Body() body: LocationFixDto) {
    return this.attendance.checkIn(user.employeeId, user.id, clientIpFromRequest(req), body);
  }

  @Post('exception')
  exception(@CurrentUser() user: any, @Req() req: Request, @Body() body: ExceptionRequestDto) {
    return this.attendance.requestException(user.employeeId, user.id, clientIpFromRequest(req), body);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: any, @Req() req: Request) {
    return this.attendance.checkOut(user.employeeId, user.id, clientIpFromRequest(req));
  }

  @Get('today')
  today(@CurrentUser() user: any) {
    return this.attendance.todayStatus(user.employeeId);
  }

  @Get('mine')
  mine(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.attendance.history(user.employeeId, from, to);
  }

  @Get('config')
  @Roles('OWNER', 'HR')
  config(@Req() req: Request) {
    return this.attendance.getConfig(clientIpFromRequest(req));
  }

  @Put('config')
  @Roles('OWNER', 'HR')
  updateConfig(@CurrentUser() user: any, @Body() body: UpdateAttendancePolicyDto) {
    return this.attendance.updateConfig(user.id, body);
  }

  @Post('missed-clock-out')
  reportMissed(@CurrentUser() user: any, @Body() body: MissedClockOutDto) {
    return this.attendance.reportMissedClockOut(user.employeeId, user.id, body);
  }

  @Get('missed-clock-outs')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  missedClockOuts() {
    return this.attendance.missedClockOuts();
  }

  @Post('missed-clock-outs/:id/close')
  @Roles('OWNER', 'HR')
  closeMissed(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CloseMissedClockOutDto) {
    return this.attendance.closeMissedClockOut(id, user.id, body);
  }

  @Get('approvals')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  approvals() {
    return this.attendance.approvals();
  }

  @Post('approvals/:id/approve')
  @Roles('OWNER', 'HR')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.attendance.approve(id, user.id);
  }

  @Post('approvals/:id/reject')
  @Roles('OWNER', 'HR')
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() body: RejectAttendanceDto) {
    return this.attendance.reject(id, user.id, body.rejectionReason);
  }

  @Get('audit')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  audit() {
    return this.attendance.auditTrail();
  }

  @Get('employee/:employeeId')
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  forEmployee(
    @Param('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.historyFor(employeeId, from, to);
  }

  @Get()
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  list(@Query('date') date?: string, @Query('departmentId') departmentId?: string) {
    return this.attendance.listAll({ date, departmentId });
  }

  @Post('mark/:employeeId')
  @Roles('OWNER', 'HR')
  mark(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Body() body: ManualAttendanceDto) {
    return this.attendance.mark(employeeId, user.id, body);
  }
}
