import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrgService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  departments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  createDepartment(name: string, code?: string) {
    return this.prisma.department.create({ data: { name, code } });
  }

  designations() {
    return this.prisma.designation.findMany({ orderBy: { name: 'asc' } });
  }

  createDesignation(name: string) {
    return this.prisma.designation.create({ data: { name } });
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
