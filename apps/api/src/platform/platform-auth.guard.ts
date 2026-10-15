import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException();
    try {
      const payload = this.jwt.verify(token) as { kind?: string; sub?: string; email?: string };
      if (payload.kind !== 'platform' || !payload.sub) throw new UnauthorizedException();
      request.platformUser = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
