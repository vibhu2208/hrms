import { PrismaClient, RoleCode, ExternalSourceType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Go Staff...');

  const resources = [
    'EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'TASKS', 'PERFORMANCE',
    'COLLEAGUE_PERFORMANCE', 'REVENUE', 'ACCOUNTS', 'SALES', 'OPERATIONS',
    'RECRUITMENT', 'POLICIES', 'BULLETIN', 'TICKETS', 'SUGGESTIONS',
    'REPORTS', 'SETTINGS', 'INTEGRATIONS', 'ROLES',
  ];
  const actions = ['VIEW', 'EDIT', 'APPROVE', 'MANAGE'];

  const roleDefs: { code: RoleCode; name: string; all?: boolean; extras?: string[] }[] = [
    { code: RoleCode.OWNER, name: 'Owner / Super Admin', all: true },
    { code: RoleCode.MANAGEMENT, name: 'Management', extras: ['REVENUE', 'ACCOUNTS', 'SALES', 'OPERATIONS', 'REPORTS', 'TASKS', 'PERFORMANCE', 'EMPLOYEES'] },
    { code: RoleCode.HR, name: 'HR Manager', extras: ['EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'RECRUITMENT', 'POLICIES', 'BULLETIN', 'PERFORMANCE', 'TICKETS'] },
    { code: RoleCode.DEPT_MANAGER, name: 'Department Manager', extras: ['TASKS', 'LEAVE', 'ATTENDANCE', 'PERFORMANCE', 'EMPLOYEES'] },
    { code: RoleCode.TEAM_LEADER, name: 'Team Leader', extras: ['TASKS', 'ATTENDANCE'] },
    { code: RoleCode.EMPLOYEE, name: 'Employee', extras: ['ATTENDANCE', 'LEAVE', 'TASKS', 'TICKETS', 'SUGGESTIONS'] },
  ];

  for (const rd of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: rd.code },
      create: { code: rd.code, name: rd.name },
      update: { name: rd.name },
    });
    for (const resource of resources) {
      for (const action of actions) {
        const allowed =
          rd.all ||
          (rd.extras?.includes(resource) && (action === 'VIEW' || action === 'EDIT' || (resource === 'LEAVE' && action === 'APPROVE')));
        await prisma.rolePermission.upsert({
          where: {
            roleId_resource_action: { roleId: role.id, resource, action },
          },
          create: { roleId: role.id, resource, action, allowed: !!allowed },
          update: { allowed: !!allowed },
        });
      }
    }
  }

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.OWNER } });
  const empRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.EMPLOYEE } });
  const hrRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.HR } });

  const eng = await prisma.department.upsert({
    where: { name: 'Engineering' },
    create: { name: 'Engineering', code: 'ENG' },
    update: {},
  });
  const sales = await prisma.department.upsert({
    where: { name: 'Sales' },
    create: { name: 'Sales', code: 'SAL' },
    update: {},
  });
  const hrDept = await prisma.department.upsert({
    where: { name: 'Human Resources' },
    create: { name: 'Human Resources', code: 'HR' },
    update: {},
  });

  const ceo = await prisma.designation.upsert({
    where: { name: 'Chief Executive Officer' },
    create: { name: 'Chief Executive Officer' },
    update: {},
  });
  const swEng = await prisma.designation.upsert({
    where: { name: 'Software Engineer' },
    create: { name: 'Software Engineer' },
    update: {},
  });
  const hrMgr = await prisma.designation.upsert({
    where: { name: 'HR Manager' },
    create: { name: 'HR Manager' },
    update: {},
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const ownerUser = await prisma.user.upsert({
    where: { email: 'connect@aithworld.com' },
    create: {
      email: 'connect@aithworld.com',
      passwordHash,
      roleId: ownerRole.id,
      employee: {
        create: {
          employeeCode: 'GS-001',
          firstName: 'Aarav',
          lastName: 'Mehta',
          phone: '+91 98765 00001',
          joiningDate: new Date('2020-01-15'),
          dateOfBirth: new Date('1985-06-20'),
          departmentId: eng.id,
          designationId: ceo.id,
        },
      },
    },
    update: {},
    include: { employee: true },
  });

  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@gostaff.local' },
    create: {
      email: 'hr@gostaff.local',
      passwordHash,
      roleId: hrRole.id,
      employee: {
        create: {
          employeeCode: 'GS-002',
          firstName: 'Priya',
          lastName: 'Sharma',
          phone: '+91 98765 00002',
          joiningDate: new Date('2021-03-01'),
          dateOfBirth: new Date('1990-09-12'),
          departmentId: hrDept.id,
          designationId: hrMgr.id,
          managerId: ownerUser.employee!.id,
        },
      },
    },
    update: {},
    include: { employee: true },
  });

  const empUser = await prisma.user.upsert({
    where: { email: 'employee@gostaff.local' },
    create: {
      email: 'employee@gostaff.local',
      passwordHash,
      roleId: empRole.id,
      employee: {
        create: {
          employeeCode: 'GS-003',
          firstName: 'Rohan',
          lastName: 'Patel',
          phone: '+91 98765 00003',
          joiningDate: new Date('2023-07-10'),
          dateOfBirth: new Date('1995-03-25'),
          departmentId: eng.id,
          designationId: swEng.id,
          managerId: ownerUser.employee!.id,
        },
      },
    },
    update: {},
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
  for (const emp of [ownerUser.employee!, hrUser.employee!, empUser.employee!]) {
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: emp.id,
            leaveTypeId: lt.id,
            year,
          },
        },
        create: {
          employeeId: emp.id,
          leaveTypeId: lt.id,
          year,
          allocated: lt.annualAllocation,
          used: 0,
          remaining: lt.annualAllocation,
        },
        update: {},
      });
    }
  }

  await prisma.holiday.createMany({
    data: [
      { name: 'Republic Day', date: new Date('2026-01-26'), type: 'PUBLIC' },
      { name: 'Independence Day', date: new Date('2026-08-15'), type: 'PUBLIC' },
      { name: 'Diwali', date: new Date('2026-11-08'), type: 'FESTIVAL' },
      { name: 'Company Foundation Day', date: new Date('2026-04-01'), type: 'COMPANY' },
    ],

  });

  await prisma.policy.createMany({
    data: [
      {
        title: 'Attendance Policy',
        category: 'attendance',
        description: 'Office hours 9:30–18:30. Late after 9:30.',
        effectiveDate: new Date('2026-01-01'),
        version: '1.0',
      },
      {
        title: 'Leave Policy',
        category: 'leave',
        description: 'Apply leave at least 2 days in advance for CL.',
        effectiveDate: new Date('2026-01-01'),
        version: '1.0',
      },
      {
        title: 'Code of Conduct',
        category: 'conduct',
        description: 'Professional behaviour and respect for colleagues.',
        effectiveDate: new Date('2026-01-01'),
        version: '1.0',
      },
    ],

  });

  await prisma.announcement.create({
    data: {
      title: 'Welcome to Go Staff',
      body: 'Your unified HRMS and business command center is live. Use self-service for attendance and leave.',
      pinned: true,
    },
  });

  await prisma.socialLink.createMany({
    data: [
      { platform: 'LinkedIn', url: 'https://linkedin.com/company/gostaff', order: 1 },
      { platform: 'Website', url: 'https://gostaff.example.com', order: 2 },
    ],

  });

  await prisma.companyContact.createMany({
    data: [
      { name: 'HR Desk', role: 'HR', department: 'Human Resources', email: 'hr@gostaff.local', phone: '+91 98765 00002' },
      { name: 'IT Support', role: 'IT', department: 'Engineering', email: 'it@gostaff.local', isEmergency: false },
      { name: 'Emergency', role: 'Security', phone: '100', isEmergency: true },
    ],

  });

  await prisma.appSetting.upsert({
    where: { key: 'colleague_performance_visible' },
    create: { key: 'colleague_performance_visible', value: 'false' },
    update: {},
  });

  await prisma.task.create({
    data: {
      title: 'Complete onboarding checklist',
      description: 'Finish HR and IT onboarding items',
      assigneeId: empUser.employee!.id,
      assignorId: hrUser.employee!.id,
      dueDate: new Date(Date.now() + 7 * 86400000),
      isChecklist: true,
      checklistItems: {
        create: [
          { title: 'Submit documents', order: 0 },
          { title: 'Setup workstation', order: 1 },
          { title: 'Meet team', order: 2 },
        ],
      },
    },
  });

  await prisma.jobPosition.create({
    data: {
      title: 'Senior Backend Engineer',
      slug: 'senior-backend-engineer-demo',
      description:
        'Build and scale NestJS APIs powering Go Staff HRMS. You will own services around attendance, leave, and integrations.',
      requirements:
        '4+ years Node.js/TypeScript\nStrong PostgreSQL/Prisma experience\nFamiliarity with NestJS or similar frameworks',
      location: 'Bengaluru / Hybrid',
      employmentType: 'FULL_TIME',
      salaryRange: '₹25–35 LPA',
      isPublic: true,
      publishedAt: new Date('2026-08-01'),
      departmentId: eng.id,
      openingDate: new Date('2026-08-01'),
      targetHireDate: new Date('2026-09-30'),
      applicantsCount: 1,
      interviewsScheduled: 0,
      interviewsCompleted: 0,
      status: 'OPEN',
      applications: {
        create: {
          fullName: 'Asha Patel',
          email: 'asha.patel@example.com',
          phone: '+91 98765 43210',
          resumeUrl: 'https://example.com/resume/asha',
          coverLetter: 'Excited to join Go Staff and help scale the HR platform.',
          experienceYears: 5,
          currentCompany: 'Acme Soft',
          status: 'APPLIED',
        },
      },
    },
  });

  await prisma.jobPosition.create({
    data: {
      title: 'HR Executive',
      slug: 'hr-executive-demo',
      description:
        'Own end-to-end hiring for corporate roles — sourcing, screening, and coordinating interviews.',
      requirements: '2+ years recruitment experience\nStrong communication skills',
      location: 'Remote',
      employmentType: 'FULL_TIME',
      salaryRange: '₹6–9 LPA',
      isPublic: true,
      publishedAt: new Date(),
      departmentId: hrDept.id,
      openingDate: new Date(),
      targetHireDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    },
  });

  const rawKey = `gs_${crypto.randomBytes(24).toString('hex')}`;
  const source = await prisma.externalSource.create({
    data: {
      name: 'Demo CRM / Accounts',
      type: ExternalSourceType.ACCOUNTS,
      apiKeyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      apiKeyPrefix: rawKey.slice(0, 10),
      lastSyncAt: new Date(),
    },
  });

  await prisma.financialSnapshot.createMany({
    data: [
      {
        externalId: 'fin-jul',
        sourceId: source.id,
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        vertical: 'Retail',
        revenue: 1100000,
        grossProfit: 380000,
        netProfit: 220000,
        expenses: 880000,
        margin: 20,
      },
      {
        externalId: 'fin-aug',
        sourceId: source.id,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        vertical: 'Retail',
        revenue: 1250000,
        grossProfit: 420000,
        netProfit: 260000,
        expenses: 990000,
        margin: 20.8,
      },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      {
        externalId: 'inv-1',
        sourceId: source.id,
        invoiceNumber: 'INV-1001',
        customerName: 'Acme Corp',
        amount: 85000,
        paidAmount: 0,
        status: 'OVERDUE',
        issueDate: new Date('2026-06-01'),
        dueDate: new Date('2026-07-01'),
      },
      {
        externalId: 'inv-2',
        sourceId: source.id,
        invoiceNumber: 'INV-1002',
        customerName: 'Beta Ltd',
        amount: 42000,
        paidAmount: 42000,
        status: 'PAID',
        issueDate: new Date('2026-08-15'),
        dueDate: new Date('2026-09-15'),
        paidDate: new Date('2026-09-10'),
      },
      {
        externalId: 'inv-3',
        sourceId: source.id,
        invoiceNumber: 'INV-1003',
        customerName: 'Gamma Inc',
        amount: 120000,
        paidAmount: 0,
        status: 'PENDING',
        issueDate: new Date('2026-09-01'),
        dueDate: new Date('2026-10-01'),
      },
    ],
  });

  await prisma.lead.createMany({
    data: [
      { externalId: 'l1', sourceId: source.id, name: 'Lead A', status: 'NEW', leadSource: 'Website', revenue: 0 },
      { externalId: 'l2', sourceId: source.id, name: 'Lead B', status: 'FOLLOW_UP', leadSource: 'Referral', revenue: 0 },
      { externalId: 'l3', sourceId: source.id, name: 'Lead C', status: 'CONVERTED', leadSource: 'Ads', revenue: 150000 },
      { externalId: 'l4', sourceId: source.id, name: 'Lead D', status: 'LOST', leadSource: 'Cold', revenue: 0 },
    ],
  });

  await prisma.salespersonMetric.create({
    data: {
      externalId: 'spm-1',
      sourceId: source.id,
      salespersonName: 'Neha Kapoor',
      weekStart: new Date('2026-09-08'),
      leadsAssigned: 20,
      leadsContacted: 16,
      leadsConverted: 4,
      revenueGenerated: 280000,
      target: 300000,
    },
  });

  await prisma.order.createMany({
    data: [
      {
        externalId: 'o1',
        sourceId: source.id,
        orderNumber: 'ORD-501',
        customerName: 'Acme Corp',
        status: 'DELIVERED',
        orderDate: new Date('2026-09-01'),
        promisedDate: new Date('2026-09-05'),
        deliveredAt: new Date('2026-09-04'),
        isOnTime: true,
      },
      {
        externalId: 'o2',
        sourceId: source.id,
        orderNumber: 'ORD-502',
        customerName: 'Beta Ltd',
        status: 'DELAYED',
        orderDate: new Date('2026-09-02'),
        promisedDate: new Date('2026-09-06'),
        isOnTime: false,
      },
      {
        externalId: 'o3',
        sourceId: source.id,
        orderNumber: 'ORD-503',
        customerName: 'Gamma Inc',
        status: 'PROCESSING',
        orderDate: new Date('2026-09-10'),
        promisedDate: new Date('2026-09-18'),
      },
    ],
  });

  await prisma.alertRule.createMany({
    data: [
      { name: 'Invoice 60+ days', type: 'INVOICE_60_PLUS', threshold: 60 },
      { name: 'Recruitment delay', type: 'RECRUITMENT_DELAY' },
      { name: 'Order delayed', type: 'ORDER_DELAYED' },
      { name: 'Sales target miss', type: 'SALES_TARGET_MISS' },
    ],

  });

  const existingOnboarding = await prisma.onboardingRequest.findFirst({
    where: { email: 'neha.gupta@example.com' },
  });
  if (!existingOnboarding) {
    await prisma.onboardingRequest.create({
      data: {
        firstName: 'Neha',
        lastName: 'Gupta',
        email: 'neha.gupta@example.com',
        phone: '+91 98765 11111',
        employeeCode: 'GS-010',
        roleCode: 'EMPLOYEE',
        joiningDate: new Date(Date.now() + 14 * 86400000),
        departmentId: eng.id,
        designationId: swEng.id,
        requestedById: hrUser.id,
        status: 'PENDING_OWNER',
      },
    });
  }

  const existingOffboarding = await prisma.offboardingRequest.findFirst({
    where: {
      employeeId: empUser.employee!.id,
      status: 'PENDING_OWNER',
    },
  });
  if (!existingOffboarding) {
    await prisma.offboardingRequest.create({
      data: {
        employeeId: empUser.employee!.id,
        lastWorkingDay: new Date(Date.now() + 30 * 86400000),
        reason: 'Resignation — pursuing higher studies (demo case)',
        requestedById: hrUser.id,
        status: 'PENDING_OWNER',
      },
    });
  }

  console.log('Seed complete.');
  console.log('Login: connect@aithworld.com / password123');
  console.log('       hr@gostaff.local / password123');
  console.log('       employee@gostaff.local / password123');
  console.log('Demo ingest API key (save this):', rawKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
