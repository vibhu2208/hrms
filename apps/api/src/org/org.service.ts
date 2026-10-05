import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrgService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  departments() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true, positions: true } } },
    });
  }

  async createDepartment(name: string, code?: string) {
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Department name is required');
    try {
      return await this.prisma.department.create({
        data: { name: clean, code: code?.trim() || null },
      });
    } catch (err) {
      this.rethrowUnique(err, 'A department with that name or code already exists');
    }
  }

  async updateDepartment(id: string, data: { name?: string; code?: string }) {
    const name = data.name?.trim();
    if (data.name !== undefined && !name) {
      throw new BadRequestException('Department name is required');
    }
    try {
      return await this.prisma.department.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(data.code !== undefined ? { code: data.code.trim() || null } : {}),
        },
      });
    } catch (err) {
      this.rethrowUnique(err, 'A department with that name or code already exists');
    }
  }

  async deleteDepartment(id: string) {
    const row = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, positions: true } } },
    });
    if (!row) throw new NotFoundException('Department not found');
    const onboarding = await this.prisma.onboardingRequest.count({ where: { departmentId: id } });
    if (row._count.employees || row._count.positions || onboarding) {
      throw new ConflictException(
        'This department is used by employees, job posts, or onboarding. Reassign those records before deleting it.',
      );
    }
    await this.prisma.department.delete({ where: { id } });
    return { ok: true };
  }

  designations() {
    return this.prisma.designation.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true, positions: true } } },
    });
  }

  async createDesignation(name: string) {
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Designation name is required');
    try {
      return await this.prisma.designation.create({ data: { name: clean } });
    } catch (err) {
      this.rethrowUnique(err, 'A designation with that name already exists');
    }
  }

  async updateDesignation(id: string, name: string) {
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Designation name is required');
    try {
      return await this.prisma.designation.update({
        where: { id },
        data: { name: clean },
      });
    } catch (err) {
      this.rethrowUnique(err, 'A designation with that name already exists');
    }
  }

  async deleteDesignation(id: string) {
    const row = await this.prisma.designation.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, positions: true } } },
    });
    if (!row) throw new NotFoundException('Designation not found');
    const onboarding = await this.prisma.onboardingRequest.count({ where: { designationId: id } });
    if (row._count.employees || row._count.positions || onboarding) {
      throw new ConflictException(
        'This designation is used by employees, job posts, or onboarding. Reassign those records before deleting it.',
      );
    }
    await this.prisma.designation.delete({ where: { id } });
    return { ok: true };
  }

  async requirePlacement(departmentId?: string | null, designationId?: string | null) {
    if (!departmentId) throw new BadRequestException('Select a department from HR configuration');
    if (!designationId) throw new BadRequestException('Select a designation from HR configuration');
    const names = await this.placementNames(departmentId, designationId);
    if (!names.department) {
      throw new BadRequestException('That department is not in HR configuration');
    }
    if (!names.designation) {
      throw new BadRequestException('That designation is not in HR configuration');
    }
    return { department: names.department, designation: names.designation };
  }

  async placementNames(departmentId?: string | null, designationId?: string | null) {
    const [department, designation] = await Promise.all([
      departmentId
        ? this.prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, code: true },
          })
        : null,
      designationId
        ? this.prisma.designation.findUnique({
            where: { id: designationId },
            select: { id: true, name: true },
          })
        : null,
    ]);
    return { department, designation };
  }

  private rethrowUnique(err: unknown, message: string): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw new ConflictException(message);
      if (err.code === 'P2025') throw new NotFoundException('Record not found');
    }
    throw err;
  }

  roles() {
    return this.prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateRolePermissions(
    roleId: string,
    permissions: { resource: string; action: string; allowed: boolean }[],
    actorId?: string,
  ) {
    for (const p of permissions) {
      await this.prisma.rolePermission.upsert({
        where: {
          roleId_resource_action: {
            roleId,
            resource: p.resource,
            action: p.action,
          },
        },
        create: { roleId, resource: p.resource, action: p.action, allowed: p.allowed },
        update: { allowed: p.allowed },
      });
    }
    await this.audit.log({
      actorId,
      action: 'UPDATE_PERMISSIONS',
      resource: 'ROLE',
      resourceId: roleId,
      metadata: { count: permissions.length },
    });
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
  }

  holidays() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  createHoliday(data: { name: string; date: string; type?: string; description?: string }) {
    return this.prisma.holiday.create({
      data: {
        name: data.name,
        date: new Date(data.date),
        type: (data.type as any) || 'PUBLIC',
        description: data.description,
      },
    });
  }

  policies() {
    return this.prisma.policy.findMany({ orderBy: { title: 'asc' } });
  }

  createPolicy(data: {
    title: string;
    category: string;
    description: string;
    documentUrl?: string;
    version?: string;
    effectiveDate: string;
  }) {
    return this.prisma.policy.create({
      data: {
        ...data,
        effectiveDate: new Date(data.effectiveDate),
      },
    });
  }

  updatePolicy(id: string, data: Partial<{
    title: string;
    category: string;
    description: string;
    documentUrl: string;
    version: string;
  }>) {
    return this.prisma.policy.update({ where: { id }, data });
  }

  deletePolicy(id: string) {
    return this.prisma.policy.delete({ where: { id } });
  }

  contacts() {
    return this.prisma.companyContact.findMany({ orderBy: { name: 'asc' } });
  }

  createContact(data: {
    name: string;
    role?: string;
    department?: string;
    phone?: string;
    email?: string;
    isEmergency?: boolean;
  }) {
    return this.prisma.companyContact.create({ data });
  }

  socialLinks() {
    return this.prisma.socialLink.findMany({ orderBy: { order: 'asc' } });
  }

  upsertSocialLink(data: { platform: string; url: string; order?: number }) {
    return this.prisma.socialLink.create({ data });
  }

  async getSettings() {
    const rows = await this.prisma.appSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setSetting(key: string, value: string, actorId?: string) {
    const row = await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await this.audit.log({
      actorId,
      action: 'UPDATE_SETTING',
      resource: 'SETTINGS',
      resourceId: key,
      metadata: { value },
    });
    return row;
  }

  async getColleaguePerformanceEnabled() {
    const s = await this.prisma.appSetting.findUnique({
      where: { key: 'colleague_performance_visible' },
    });
    return s?.value === 'true';
  }
}
