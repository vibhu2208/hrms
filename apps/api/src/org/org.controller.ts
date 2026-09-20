import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { OrgService } from './org.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrgController {
  constructor(private org: OrgService) {}

  @Get('departments')
  departments() {
    return this.org.departments();
  }

  @Post('departments')
  @Roles('OWNER', 'HR')
  createDept(@Body() body: { name: string; code?: string }) {
    return this.org.createDepartment(body.name, body.code);
  }

  @Get('designations')
  designations() {
    return this.org.designations();
  }

  @Post('designations')
  @Roles('OWNER', 'HR')
  createDesig(@Body() body: { name: string }) {
    return this.org.createDesignation(body.name);
  }

  @Get('roles')
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  roles() {
    return this.org.roles();
  }

  @Patch('roles/:id/permissions')
  @Roles('OWNER')
  updatePerms(
    @Param('id') id: string,
    @Body() body: { permissions: { resource: string; action: string; allowed: boolean }[] },
    @CurrentUser() user: any,
  ) {
    return this.org.updateRolePermissions(id, body.permissions, user.id);
  }

  @Get('holidays')
  holidays() {
    return this.org.holidays();
  }

  @Post('holidays')
  @Roles('OWNER', 'HR')
  createHoliday(@Body() body: any) {
    return this.org.createHoliday(body);
  }

  @Get('policies')
  policies() {
    return this.org.policies();
  }

  @Post('policies')
  @Roles('OWNER', 'HR')
  createPolicy(@Body() body: any) {
    return this.org.createPolicy(body);
  }

  @Patch('policies/:id')
  @Roles('OWNER', 'HR')
  updatePolicy(@Param('id') id: string, @Body() body: any) {
    return this.org.updatePolicy(id, body);
  }

  @Delete('policies/:id')
  @Roles('OWNER', 'HR')
  deletePolicy(@Param('id') id: string) {
    return this.org.deletePolicy(id);
  }

  @Get('contacts')
  contacts() {
    return this.org.contacts();
  }

  @Post('contacts')
  @Roles('OWNER', 'HR')
  createContact(@Body() body: any) {
    return this.org.createContact(body);
  }

  @Get('social-links')
  socialLinks() {
    return this.org.socialLinks();
  }

  @Post('social-links')
  @Roles('OWNER', 'HR')
  createSocial(@Body() body: any) {
    return this.org.upsertSocialLink(body);
  }

  @Get('settings')
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  settings() {
    return this.org.getSettings();
  }

  @Post('settings')
  @Roles('OWNER')
  setSetting(@Body() body: { key: string; value: string }, @CurrentUser() user: any) {
    return this.org.setSetting(body.key, body.value, user.id);
  }
}
