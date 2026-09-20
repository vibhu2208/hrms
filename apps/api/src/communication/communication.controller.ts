import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationController {
  constructor(private comm: CommunicationService) {}

  @Get('announcements')
  announcements() {
    return this.comm.announcements();
  }

  @Post('announcements')
  @Roles('OWNER', 'HR')
  createAnnouncement(@Body() body: any, @CurrentUser() user: any) {
    return this.comm.createAnnouncement({ ...body, createdBy: user.id });
  }

  @Patch('announcements/:id')
  @Roles('OWNER', 'HR')
  updateAnnouncement(@Param('id') id: string, @Body() body: any) {
    return this.comm.updateAnnouncement(id, body);
  }

  @Delete('announcements/:id')
  @Roles('OWNER', 'HR')
  deleteAnnouncement(@Param('id') id: string) {
    return this.comm.deleteAnnouncement(id);
  }

  @Post('tickets')
  createTicket(@CurrentUser() user: any, @Body() body: any) {
    return this.comm.createTicket(user.employeeId, body);
  }

  @Get('tickets/mine')
  myTickets(@CurrentUser() user: any) {
    return this.comm.myTickets(user.employeeId);
  }

  @Get('tickets')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  allTickets(@Query('status') status?: any) {
    return this.comm.allTickets(status);
  }

  @Patch('tickets/:id')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  updateTicket(@Param('id') id: string, @Body() body: any) {
    return this.comm.updateTicket(id, body);
  }

  @Post('suggestions')
  createSuggestion(@CurrentUser() user: any, @Body() body: any) {
    return this.comm.createSuggestion(user.employeeId, body);
  }

  @Get('suggestions')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  suggestions() {
    return this.comm.suggestions();
  }

  @Patch('suggestions/:id')
  @Roles('OWNER', 'HR')
  updateSuggestion(@Param('id') id: string, @Body() body: { status: any }) {
    return this.comm.updateSuggestion(id, body.status);
  }
}
