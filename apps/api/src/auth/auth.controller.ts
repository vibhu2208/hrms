import { Controller, Post, Body, Get, UseGuards, Res, Query } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('microsoft')
  microsoft(
    @Res() res: Response,
    @Query('prompt') prompt?: string,
    @Query('returnTo') returnTo?: string,
  ) {
    try {
      return res.redirect(this.auth.microsoftAuthorizeUrl({ prompt, returnTo }));
    } catch (err: any) {
      return res.redirect(this.failureRedirect(err?.message));
    }
  }

  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error_description') errorDescription: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error || !code || !state) {
      return res.redirect(
        this.failureRedirect(errorDescription || error || 'Microsoft sign-in was cancelled.'),
      );
    }
    try {
      const session = await this.auth.loginWithMicrosoft(code, state);
      const origin = this.auth.webOrigin();
      const hash = new URLSearchParams({ token: session.token });
      if (session.returnTo) hash.set('returnTo', session.returnTo);
      return res.redirect(`${origin}/login/microsoft#${hash.toString()}`);
    } catch (err: any) {
      const message = Array.isArray(err?.message) ? err.message.join(', ') : err?.message;
      return res.redirect(this.failureRedirect(message));
    }
  }

  private failureRedirect(message?: string) {
    const text = (message || 'Microsoft sign-in failed.').slice(0, 300);
    return `${this.auth.webOrigin()}/login?error=${encodeURIComponent(text)}`;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return this.auth.me(user.id);
  }
}
