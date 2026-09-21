import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingStatus, LifecycleDocumentKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';

const ONBOARDING_CHECKLIST = [
  'Provision laptop / workstation',
  'Create company email',
  'Grant system access',
  'Orientation / welcome meeting',
  'Assign buddy / manager intro',
];

const includeAll = {
  documents: { orderBy: { uploadedAt: 'desc' as const } },
  checklistItems: { orderBy: { order: 'asc' as const } },
  requestedBy: { select: { id: true, email: true } },
  ownerApprover: { select: { id: true, email: true } },
  employee: true,
  application: { include: { position: true } },
};

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private email: EmailService,
    private users: UsersService,
  ) {}

  private async notifyOwners(title: string, body: string) {
    const owners = await this.prisma.user.findMany({
      where: { role: { code: 'OWNER' }, isActive: true },
    });
    for (const o of owners) {
      await this.notifications.create({
        userId: o.id,
        title,
        body,
        type: 'ONBOARDING_REQUEST',
        link: '/admin/onboarding',
      });
    }
  }

  async create(
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      employeeCode?: string;
      roleCode?: string;
      joiningDate: string;
      departmentId?: string;
      designationId?: string;
      managerId?: string;
      applicationId?: string;
    },
    requestedById: string,
  ) {
    if (!data.firstName?.trim() || !data.lastName?.trim() || !data.email?.trim()) {
      throw new BadRequestException('Name and email are required');
    }
    if (!data.joiningDate) {
      throw new BadRequestException('Joining date is required');
    }

    if (data.applicationId) {
      const app = await this.prisma.jobApplication.findUnique({
        where: { id: data.applicationId },
      });
      if (!app) throw new NotFoundException('Application not found');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    const request = await this.prisma.onboardingRequest.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone,
        employeeCode: data.employeeCode,
        roleCode: data.roleCode || 'EMPLOYEE',
        joiningDate: new Date(data.joiningDate),
        departmentId: data.departmentId,
        designationId: data.designationId,
        managerId: data.managerId,
        applicationId: data.applicationId,
        requestedById,
        status: OnboardingStatus.PENDING_OWNER,
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId: requestedById,
      action: 'ONBOARDING_CREATE',
      resource: 'ONBOARDING',
      resourceId: request.id,
    });

    await this.notifyOwners(
      'Onboarding approval needed',
      `${request.firstName} ${request.lastName} — pending owner approval`,
    );

    return request;
  }

  list(status?: OnboardingStatus) {
    return this.prisma.onboardingRequest.findMany({
      where: status ? { status } : undefined,
      include: includeAll,
      orderBy: { createdAt: 'desc' },
    });
  }

  pending() {
    return this.list(OnboardingStatus.PENDING_OWNER);
  }

  async findOne(id: string) {
    const req = await this.prisma.onboardingRequest.findUnique({
      where: { id },
      include: includeAll,
    });
    if (!req) throw new NotFoundException('Onboarding request not found');
    return req;
  }

  async review(
    id: string,
    action: 'APPROVE' | 'REJECT',
    ownerUserId: string,
    note?: string,
  ) {
    const req = await this.findOne(id);
    if (req.status !== OnboardingStatus.PENDING_OWNER) {
      throw new BadRequestException('Request is not pending owner approval');
    }

    if (action === 'REJECT') {
      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: {
          status: OnboardingStatus.REJECTED,
          ownerApproverId: ownerUserId,
          reviewNote: note,
        },
        include: includeAll,
      });
      await this.audit.log({
        actorId: ownerUserId,
        action: 'ONBOARDING_REJECT',
        resource: 'ONBOARDING',
        resourceId: id,
      });
      await this.notifications.create({
        userId: req.requestedById,
        title: 'Onboarding rejected',
        body: `${req.firstName} ${req.lastName} was rejected by owner`,
        type: 'ONBOARDING_STATUS',
        link: '/admin/onboarding',
      });
      return updated;
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        status: OnboardingStatus.OFFER_LETTER,
        ownerApproverId: ownerUserId,
        reviewNote: note,
        checklistItems: {
          create: ONBOARDING_CHECKLIST.map((title, order) => ({ title, order })),
        },
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId: ownerUserId,
      action: 'ONBOARDING_APPROVE',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    await this.notifications.create({
      userId: req.requestedById,
      title: 'Onboarding approved',
      body: `${req.firstName} ${req.lastName} approved — send offer letter`,
      type: 'ONBOARDING_STATUS',
      link: '/admin/onboarding',
    });

    return updated;
  }

  async sendOffer(
    id: string,
    actorId: string,
    body?: { subject?: string; message?: string },
  ) {
    const req = await this.findOne(id);
    if (req.status !== OnboardingStatus.OFFER_LETTER) {
      throw new BadRequestException('Request is not in offer letter stage');
    }

    const subject =
      body?.subject?.trim() ||
      `Offer of employment — ${req.firstName} ${req.lastName}`;
    const text =
      body?.message?.trim() ||
      `Hi ${req.firstName},\n\nWe are pleased to offer you a position at Go Staff` +
        (req.joiningDate
          ? `, with a proposed joining date of ${req.joiningDate.toLocaleDateString()}`
          : '') +
        `.\n\nOur HR team will follow up with documentation and next steps.\n\nCongratulations!\n\nBest regards,\nHR Team — Go Staff`;

    const result = await this.email.send({
      to: req.email,
      subject,
      text,
    });

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        offerSubject: subject,
        offerBody: text,
        offerSentAt: new Date(),
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_OFFER_SENT',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { delivered: result.delivered, mode: result.mode },
    });

    return { ...updated, emailResult: result };
  }

  async markOfferAccepted(id: string, actorId: string) {
    const req = await this.findOne(id);
    if (req.status !== OnboardingStatus.OFFER_LETTER) {
      throw new BadRequestException('Request is not in offer letter stage');
    }
    if (!req.offerSentAt) {
      throw new BadRequestException('Send the offer letter before marking accepted');
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        status: OnboardingStatus.DOCUMENTS,
        offerAcceptedAt: new Date(),
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_OFFER_ACCEPTED',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    return updated;
  }

  async addDocument(
    id: string,
    data: { kind?: LifecycleDocumentKind; title: string; url: string },
    actorId: string,
  ) {
    const req = await this.findOne(id);
    if (
      req.status !== OnboardingStatus.DOCUMENTS &&
      req.status !== OnboardingStatus.OFFER_LETTER &&
      req.status !== OnboardingStatus.CREATE_ACCOUNT &&
      req.status !== OnboardingStatus.IT_HR_CHECKLIST
    ) {
      throw new BadRequestException('Cannot add documents in current stage');
    }
    if (!data.title?.trim() || !data.url?.trim()) {
      throw new BadRequestException('Title and URL are required');
    }

    await this.prisma.lifecycleDocument.create({
      data: {
        onboardingId: id,
        kind: data.kind || LifecycleDocumentKind.OTHER,
        title: data.title.trim(),
        url: data.url.trim(),
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_DOCUMENT_ADD',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    return this.findOne(id);
  }

  async advance(id: string, actorId: string) {
    const req = await this.findOne(id);

    if (req.status === OnboardingStatus.DOCUMENTS) {
      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: { status: OnboardingStatus.CREATE_ACCOUNT },
        include: includeAll,
      });
      await this.audit.log({
        actorId,
        action: 'ONBOARDING_ADVANCE',
        resource: 'ONBOARDING',
        resourceId: id,
        metadata: { to: 'CREATE_ACCOUNT' },
      });
      return updated;
    }

    if (req.status === OnboardingStatus.IT_HR_CHECKLIST) {
      const pending = req.checklistItems.filter((i) => !i.completed);
      if (pending.length) {
        throw new BadRequestException(
          `Complete all checklist items first (${pending.length} remaining)`,
        );
      }
      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: { status: OnboardingStatus.COMPLETED },
        include: includeAll,
      });
      await this.audit.log({
        actorId,
        action: 'ONBOARDING_COMPLETE',
        resource: 'ONBOARDING',
        resourceId: id,
      });
      return updated;
    }

    throw new BadRequestException('Cannot advance from current stage');
  }

  async createAccount(
    id: string,
    actorId: string,
    body?: { password?: string; employeeCode?: string },
  ) {
    const req = await this.findOne(id);
    if (req.status !== OnboardingStatus.CREATE_ACCOUNT) {
      throw new BadRequestException('Request is not in create-account stage');
    }
    if (req.employeeId) {
      throw new BadRequestException('Account already created');
    }

    const employeeCode =
      body?.employeeCode?.trim() ||
      req.employeeCode?.trim() ||
      `GS-${Date.now().toString().slice(-6)}`;
    const password = body?.password?.trim() || 'password123';

    const user = await this.users.create(
      {
        email: req.email,
        password,
        roleCode: req.roleCode,
        employeeCode,
        firstName: req.firstName,
        lastName: req.lastName,
        phone: req.phone || undefined,
        joiningDate: req.joiningDate.toISOString(),
        departmentId: req.departmentId || undefined,
        designationId: req.designationId || undefined,
        managerId: req.managerId || undefined,
      },
      actorId,
    );

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        employeeId: user.employee!.id,
        employeeCode,
        status: OnboardingStatus.IT_HR_CHECKLIST,
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_ACCOUNT_CREATED',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { employeeId: user.employee!.id },
    });

    return updated;
  }

  async toggleChecklistItem(
    id: string,
    itemId: string,
    completed: boolean,
    actorId: string,
  ) {
    const req = await this.findOne(id);
    if (req.status !== OnboardingStatus.IT_HR_CHECKLIST) {
      throw new BadRequestException('Checklist is only editable in IT/HR stage');
    }
    const item = req.checklistItems.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found');

    await this.prisma.lifecycleChecklistItem.update({
      where: { id: itemId },
      data: { completed },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_CHECKLIST_TOGGLE',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { itemId, completed },
    });

    return this.findOne(id);
  }

  async cancel(id: string, actorId: string) {
    const req = await this.findOne(id);
    if (
      req.status === OnboardingStatus.COMPLETED ||
      req.status === OnboardingStatus.REJECTED ||
      req.status === OnboardingStatus.CANCELLED
    ) {
      throw new BadRequestException('Request is already closed');
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: { status: OnboardingStatus.CANCELLED },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_CANCEL',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    return updated;
  }
}
