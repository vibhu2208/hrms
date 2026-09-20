import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || 'go-staff-dev-secret',
    });
  }

  async validate(payload: { sub: string; email: string; role: string; employeeId?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permissions: true } },
        employee: true,
      },
    });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role.code,
      roleId: user.roleId,
      employeeId: user.employee?.id,
      permissions: user.role.permissions,
    };
  }
}
