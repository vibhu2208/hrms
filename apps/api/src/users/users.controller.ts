import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('employees')
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.users.findAll({ departmentId, search });
  }

  @Get('employees/:id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post('employees')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.users.create(body, user.id);
  }

  @Patch('employees/:id')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.users.update(id, body, user.id);
  }

  @Get('directory')
  directory() {
    return this.users.directory();
  }

  @Get('birthdays')
  birthdays(@Query('days') days?: string) {
    return this.users.upcomingBirthdays(days ? Number(days) : 30);
  }
}
