import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OffboardingService } from './offboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('offboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'HR')
export class OffboardingController {
  constructor(private offboarding: OffboardingService) {}

  @Post()
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.offboarding.create(body, user.id);
  }

  @Get('pending')
  pending() {
    return this.offboarding.pending();
  }

  @Get()
  list(@Query('status') status?: any) {
    return this.offboarding.list(status);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.offboarding.findOne(id);
  }

  @Patch(':id/review')
  @Roles('OWNER')
  review(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.offboarding.review(id, body.action, user.id, body.note);
  }

  @Post(':id/documents')
  addDocument(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.offboarding.addDocument(id, body, user.id);
  }

  @Patch(':id/items/:itemId')
  toggleItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.offboarding.toggleChecklistItem(id, itemId, !!body.completed, user.id);
  }

  @Patch(':id/advance')
  advance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.offboarding.advance(id, user.id);
  }

  @Post(':id/send-final-email')
  sendFinalEmail(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.offboarding.sendFinalDocsEmail(id, user.id, body);
  }

  @Post(':id/revoke-access')
  revokeAccess(@Param('id') id: string, @CurrentUser() user: any) {
    return this.offboarding.revokeAccess(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.offboarding.cancel(id, user.id);
  }
}
