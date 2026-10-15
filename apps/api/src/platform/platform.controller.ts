import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { CreateTenantDto, PlatformLoginDto, UpdateMailFromDto } from './dto/platform.dto';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platform.login(dto);
  }

  @Get('tenants')
  @UseGuards(PlatformAuthGuard)
  list() {
    return this.platform.list();
  }

  @Post('tenants')
  @UseGuards(PlatformAuthGuard)
  create(@Body() dto: CreateTenantDto) {
    return this.platform.create(dto);
  }

  @Patch('tenants/:slug/mail')
  @UseGuards(PlatformAuthGuard)
  setMail(@Param('slug') slug: string, @Body() dto: UpdateMailFromDto) {
    return this.platform.setMailFrom(slug, dto);
  }
}
