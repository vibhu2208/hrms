import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('leave')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private leave: LeaveService) {}

  @Get('types')
  types() {
    return this.leave.leaveTypes();
  }

  @Post('types')
  @Roles('OWNER', 'HR')
  createType(@Body() body: Record<string, unknown>, @CurrentUser() user: any) {
    return this.leave.createType(body, user.id);
  }

  @Patch('types/:id')
  @Roles('OWNER', 'HR')
  updateType(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: any) {
    return this.leave.updateType(id, body, user.id);
  }

  @Get('allocations')
  @Roles('OWNER', 'HR')
  allocations() {
    return this.leave.allocations();
  }

  @Post('allocations')
  @Roles('OWNER', 'HR')
  createAllocation(@Body() body: Record<string, unknown>, @CurrentUser() user: any) {
    return this.leave.createAllocation(body, user.id);
  }

  @Patch('allocations/:id')
  @Roles('OWNER', 'HR')
  updateAllocation(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: any) {
    return this.leave.updateAllocation(id, body, user.id);
  }

  @Delete('allocations/:id')
  @Roles('OWNER', 'HR')
  deleteAllocation(@Param('id') id: string, @CurrentUser() user: any) {
    return this.leave.deleteAllocation(id, user.id);
  }

  @Get('balances')
  balances(@CurrentUser() user: any, @Query('year') year?: string) {
    return this.leave.balances(user.employeeId, year ? Number(year) : undefined);
  }

  @Post('apply')
  apply(@CurrentUser() user: any, @Body() body: any) {
    return this.leave.apply(user.employeeId, body);
  }

  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.leave.myRequests(user.employeeId);
  }

  @Get('overview')
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  overview() {
    return this.leave.overview();
  }

  @Get('pending')
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  pending() {
    return this.leave.pending();
  }

  @Get()
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  all(@Query('status') status?: any, @Query('departmentId') departmentId?: string) {
    return this.leave.all({ status, departmentId });
  }

  @Patch(':id/review')
  @Roles('OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER')
  review(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.leave.review(id, body.action, user.employeeId, user.id, body.note);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.leave.cancel(id, user.employeeId);
  }
}
