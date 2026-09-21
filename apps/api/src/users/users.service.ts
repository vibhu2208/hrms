import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query?: { departmentId?: string; search?: string }) {
    return this.prisma.employee.findMany({
      where: {
        ...(query?.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query?.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { employeeCode: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        department: true,
        designation: true,
        manager: true,
        user: { include: { role: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async findOne(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        designation: true,
        manager: true,
        user: { include: { role: true } },
        reports: true,
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async directory() {
    return this.prisma.employee.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        photoUrl: true,
        joiningDate: true,
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { email: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async upcomingBirthdays(days = 30) {
    const employees = await this.prisma.employee.findMany({
      where: { dateOfBirth: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        department: true,
        photoUrl: true,
      },
    });
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + days);

    return employees
      .map((e) => {
        if (!e.dateOfBirth) return null;
        const dob = new Date(e.dateOfBirth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        return { ...e, nextBirthday: next };
      })
      .filter((e): e is NonNullable<typeof e> => !!e && e.nextBirthday <= end)
      .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime());
  }

  async create(data: {
    email: string;
    password: string;
    roleCode: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    phone?: string;
    joiningDate: string;
    departmentId?: string;
    designationId?: string;
    managerId?: string;
    dateOfBirth?: string;
  }, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { code: data.roleCode as any } });
    if (!role) throw new NotFoundException('Role not found');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        roleId: role.id,
        employee: {
          create: {
            employeeCode: data.employeeCode,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            joiningDate: new Date(data.joiningDate),
            departmentId: data.departmentId,
            designationId: data.designationId,
            managerId: data.managerId,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          },
        },
      },
      include: { employee: true, role: true },
    });

    await this.audit.log({
      actorId,
      action: 'CREATE',
      resource: 'EMPLOYEE',
      resourceId: user.employee?.id,
    });

    return user;
  }

  async update(id: string, data: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    departmentId: string;
    designationId: string;
    managerId: string;
    photoUrl: string;
  }>, actorId?: string) {
    const emp = await this.prisma.employee.update({
      where: { id },
      data,
      include: { department: true, designation: true, user: { include: { role: true } } },
    });
    await this.audit.log({
      actorId,
      action: 'UPDATE',
      resource: 'EMPLOYEE',
      resourceId: id,
    });
    return emp;
  }

  async deactivate(employeeId: string, lastWorkingDay?: string, actorId?: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: emp.userId },
        data: { isActive: false },
      }),
      this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          lastWorkingDay: lastWorkingDay ? new Date(lastWorkingDay) : new Date(),
        },
      }),
    ]);

    await this.audit.log({
      actorId,
      action: 'DEACTIVATE',
      resource: 'EMPLOYEE',
      resourceId: employeeId,
    });

    return this.findOne(employeeId);
  }
}
