import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        role: { include: { permissions: true } },
        employee: {
          include: { department: true, designation: true },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role.code,
      employeeId: user.employee?.id,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      resource: 'AUTH',
      resourceId: user.id,
    });

    return {
      accessToken: token,
      user: this.sanitize(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        employee: {
          include: { department: true, designation: true, manager: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }
}
