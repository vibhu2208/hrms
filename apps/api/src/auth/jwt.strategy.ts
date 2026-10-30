import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { getTenantContext } from '../tenant/tenant.context';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  employeeId?: string;
  tenantSlug?: string;
  authMethod?: 'password' | 'microsoft';
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || 'go-staff-dev-secret',
    });
  }

  validate(payload: JwtPayload) {
    const tenant = getTenantContext()?.tenant;
    if (!tenant || payload.tenantSlug !== tenant.slug) {
      throw new UnauthorizedException('This session belongs to another company.');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      employeeId: payload.employeeId,
      tenantSlug: payload.tenantSlug,
      authMethod: payload.authMethod === 'microsoft' ? 'microsoft' : 'password',
    };
  }
}
