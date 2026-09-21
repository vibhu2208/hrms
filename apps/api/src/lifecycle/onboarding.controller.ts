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
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'HR')
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @Post()
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.onboarding.create(body, user.id);
  }

  @Get('pending')
  pending() {
    return this.onboarding.pending();
  }

  @Get()
  list(@Query('status') status?: any) {
    return this.onboarding.list(status);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.onboarding.findOne(id);
  }

  @Patch(':id/review')
  @Roles('OWNER')
  review(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.onboarding.review(id, body.action, user.id, body.note);
  }

  @Post(':id/send-offer')
  sendOffer(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.onboarding.sendOffer(id, user.id, body);
  }

  @Patch(':id/offer-accepted')
  offerAccepted(@Param('id') id: string, @CurrentUser() user: any) {
    return this.onboarding.markOfferAccepted(id, user.id);
  }

  @Post(':id/documents')
  addDocument(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.onboarding.addDocument(id, body, user.id);
  }

  @Patch(':id/advance')
  advance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.onboarding.advance(id, user.id);
  }

  @Post(':id/create-account')
  createAccount(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.onboarding.createAccount(id, user.id, body);
  }

  @Patch(':id/items/:itemId')
  toggleItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.onboarding.toggleChecklistItem(id, itemId, !!body.completed, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.onboarding.cancel(id, user.id);
  }
}
