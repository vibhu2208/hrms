import { PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export async function seedMinimalCompany(prisma: PrismaClient) {
  const companyName = (process.env.SEED_COMPANY_NAME || 'Company').trim();
  const ownerEmail = (process.env.SEED_OWNER_EMAIL || 'owner@company.local').trim().toLowerCase();
  const ownerFirst = (process.env.SEED_OWNER_FIRST || 'Company').trim();
  const ownerLast = (process.env.SEED_OWNER_LAST || 'Owner').trim();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'password123';
  const employeeCode = (process.env.SEED_EMPLOYEE_CODE || 'GS-001').trim();

  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existing) {
    console.log(`${companyName} already seeded (${ownerEmail}).`);
    return;
  }

  console.log(`Seeding ${companyName}...`);
  const ownerRole = await seedRoles(prisma);
  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const department = await prisma.department.upsert({
    where: { name: 'General' },
    create: { name: 'General', code: 'GEN' },
    update: {},
  });
  const designation = await prisma.designation.upsert({
    where: { name: 'Owner' },
    create: { name: 'Owner' },
    update: {},
  });

  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      passwordHash,
      roleId: ownerRole.id,
      employee: {
        create: {
          employeeCode,
          firstName: ownerFirst,
          lastName: ownerLast,
          joiningDate: new Date(),
          departmentId: department.id,
          designationId: designation.id,
        },
      },
    },
    include: { employee: true },
  });

  for (const [name, code, alloc] of [
    ['Casual Leave', 'CL', 12],
    ['Sick Leave', 'SL', 10],
    ['Earned Leave', 'EL', 15],
  ] as const) {
    await prisma.leaveType.upsert({
      where: { code },
      create: { name, code, days: alloc, annualAllocation: alloc, frequency: 'YEARLY' },
      update: {},
    });
  }

  const leaveTypes = await prisma.leaveType.findMany();
  const year = new Date().getFullYear();
  if (owner.employee) {
    for (const leaveType of leaveTypes) {
      await prisma.leaveBalance.create({
        data: {
          employeeId: owner.employee.id,
          leaveTypeId: leaveType.id,
          year,
          allocated: leaveType.annualAllocation,
          used: 0,
          remaining: leaveType.annualAllocation,
        },
      });
    }
  }

  await prisma.holiday.createMany({
    data: [
      { name: 'Republic Day', date: new Date('2026-01-26'), type: 'PUBLIC' },
      { name: 'Independence Day', date: new Date('2026-08-15'), type: 'PUBLIC' },
      { name: 'Diwali', date: new Date('2026-11-08'), type: 'FESTIVAL' },
    ],
  });

  await prisma.announcement.create({
    data: {
      title: `Welcome to ${companyName}`,
      body: `${companyName} is live on Go Staff. Use self-service for attendance and leave.`,
      pinned: true,
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'colleague_performance_visible' },
    create: { key: 'colleague_performance_visible', value: 'false' },
    update: {},
  });

  const mailFrom = (process.env.SEED_MAIL_FROM || ownerEmail).trim().toLowerCase();
  await prisma.appSetting.upsert({
    where: { key: 'mail_from' },
    create: { key: 'mail_from', value: mailFrom },
    update: { value: mailFrom },
  });

  console.log(`Seed complete for ${companyName}.`);
  console.log(`Login: ${ownerEmail} / ${ownerPassword}`);
}

async function seedRoles(prisma: PrismaClient) {
  const resources = [
    'EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'TASKS', 'PERFORMANCE',
    'COLLEAGUE_PERFORMANCE', 'REVENUE', 'ACCOUNTS', 'SALES', 'OPERATIONS',
    'RECRUITMENT', 'POLICIES', 'BULLETIN', 'TICKETS', 'SUGGESTIONS',
    'REPORTS', 'SETTINGS', 'INTEGRATIONS', 'ROLES',
  ];
  const actions = ['VIEW', 'EDIT', 'APPROVE', 'MANAGE'];
  const roleDefs: { code: RoleCode; name: string; all?: boolean; extras?: string[] }[] = [
    { code: RoleCode.OWNER, name: 'Owner', all: true },
    { code: RoleCode.MANAGEMENT, name: 'Management', extras: ['REVENUE', 'ACCOUNTS', 'SALES', 'OPERATIONS', 'REPORTS', 'TASKS', 'PERFORMANCE', 'EMPLOYEES'] },
    { code: RoleCode.HR, name: 'HR Manager', extras: ['EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'RECRUITMENT', 'POLICIES', 'BULLETIN', 'PERFORMANCE', 'TICKETS'] },
    { code: RoleCode.DEPT_MANAGER, name: 'Department Manager', extras: ['TASKS', 'LEAVE', 'ATTENDANCE', 'PERFORMANCE', 'EMPLOYEES'] },
    { code: RoleCode.TEAM_LEADER, name: 'Team Leader', extras: ['TASKS', 'ATTENDANCE'] },
    { code: RoleCode.EMPLOYEE, name: 'Employee', extras: ['ATTENDANCE', 'LEAVE', 'TASKS', 'TICKETS', 'SUGGESTIONS'] },
  ];

  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      create: { code: roleDef.code, name: roleDef.name },
      update: { name: roleDef.name },
    });
    for (const resource of resources) {
      for (const action of actions) {
        const allowed =
          roleDef.all ||
          (roleDef.extras?.includes(resource) &&
            (action === 'VIEW' || action === 'EDIT' || (resource === 'LEAVE' && action === 'APPROVE')));
        await prisma.rolePermission.upsert({
          where: { roleId_resource_action: { roleId: role.id, resource, action } },
          create: { roleId: role.id, resource, action, allowed: !!allowed },
          update: { allowed: !!allowed },
        });
      }
    }
  }

  return prisma.role.findUniqueOrThrow({ where: { code: RoleCode.OWNER } });
}
