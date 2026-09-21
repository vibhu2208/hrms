import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OffboardingStatus, LifecycleDocumentKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';

const OFFBOARDING_CHECKLIST = [
  'Knowledge transfer completed',
  'Return laptop / assets',
  'Revoke building access',
  'Handoff pending work',
  'Exit interview scheduled',
];

const includeAll = {
  documents: { orderBy: { uploadedAt: 'desc' as const } },
  checklistItems: { orderBy: { order: 'asc' as const } },
  requestedBy: { select: { id: true, email: true } },
  ownerApprover: { select: { id: true, email: true } },
  employee: {
    include: {
      department: true,
      designation: true,
      user: { select: { id: true, email: true, isActive: true } },
    },
  },
};

@Injectable()
export class OffboardingService {
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
        type: 'OFFBOARDING_REQUEST',
        link: '/admin/offboarding',
      });
    }
  }

  async create(
    data: { employeeId: string; lastWorkingDay: string; reason: string },
    requestedById: string,
  ) {
    if (!data.employeeId || !data.lastWorkingDay || !data.reason?.trim()) {
      throw new BadRequestException('Employee, last working day, and reason are required');
    }

    const emp = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { user: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!emp.user.isActive) {
      throw new BadRequestException('Employee is already inactive');
    }

    const open = await this.prisma.offboardingRequest.findFirst({
      where: {
        employeeId: data.employeeId,
        status: {
          notIn: [
            OffboardingStatus.COMPLETED,
            OffboardingStatus.REJECTED,
            OffboardingStatus.CANCELLED,
          ],
        },
      },
    });
    if (open) {
      throw new BadRequestException('An open offboarding request already exists for this employee');
    }

    const request = await this.prisma.offboardingRequest.create({
      data: {
        employeeId: data.employeeId,
        lastWorkingDay: new Date(data.lastWorkingDay),
        reason: data.reason.trim(),
        requestedById,
        status: OffboardingStatus.PENDING_OWNER,
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId: requestedById,
      action: 'OFFBOARDING_CREATE',
      resource: 'OFFBOARDING',
      resourceId: request.id,
    });

    await this.notifyOwners(
      'Offboarding approval needed',
      `${emp.firstName} ${emp.lastName} — pending owner approval`,
    );

    return request;
  }

  list(status?: OffboardingStatus) {
    return this.prisma.offboardingRequest.findMany({
      where: status ? { status } : undefined,
      include: includeAll,
      orderBy: { createdAt: 'desc' },
    });
  }

  pending() {
    return this.list(OffboardingStatus.PENDING_OWNER);
  }

  async findOne(id: string) {
    const req = await this.prisma.offboardingRequest.findUnique({
      where: { id },
      include: includeAll,
    });
    if (!req) throw new NotFoundException('Offboarding request not found');
    return req;
  }

  async review(
    id: string,
    action: 'APPROVE' | 'REJECT',
    ownerUserId: string,
    note?: string,
  ) {
    const req = await this.findOne(id);
    if (req.status !== OffboardingStatus.PENDING_OWNER) {
      throw new BadRequestException('Request is not pending owner approval');
    }

    if (action === 'REJECT') {
      const updated = await this.prisma.offboardingRequest.update({
        where: { id },
        data: {
          status: OffboardingStatus.REJECTED,
          ownerApproverId: ownerUserId,
          reviewNote: note,
        },
        include: includeAll,
      });
      await this.audit.log({
        actorId: ownerUserId,
        action: 'OFFBOARDING_REJECT',
        resource: 'OFFBOARDING',
        resourceId: id,
      });
      await this.notifications.create({
        userId: req.requestedById,
        title: 'Offboarding rejected',
        body: `${req.employee.firstName} ${req.employee.lastName} offboarding was rejected`,
        type: 'OFFBOARDING_STATUS',
        link: '/admin/offboarding',
      });
      return updated;
    }

    const updated = await this.prisma.offboardingRequest.update({
      where: { id },
      data: {
        status: OffboardingStatus.EXIT_CLEARANCE,
        ownerApproverId: ownerUserId,
        reviewNote: note,
        checklistItems: {
          create: OFFBOARDING_CHECKLIST.map((title, order) => ({ title, order })),
        },
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId: ownerUserId,
      action: 'OFFBOARDING_APPROVE',
      resource: 'OFFBOARDING',
      resourceId: id,
    });

    await this.notifications.create({
      userId: req.requestedById,
      title: 'Offboarding approved',
      body: `${req.employee.firstName} ${req.employee.lastName} — start exit clearance`,
      type: 'OFFBOARDING_STATUS',
      link: '/admin/offboarding',
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
      req.status !== OffboardingStatus.EXIT_CLEARANCE &&
      req.status !== OffboardingStatus.FINAL_DOCUMENTS &&
      req.status !== OffboardingStatus.REVOKE_ACCESS
    ) {
      throw new BadRequestException('Cannot add documents in current stage');
    }
    if (!data.title?.trim() || !data.url?.trim()) {
      throw new BadRequestException('Title and URL are required');
    }

    await this.prisma.lifecycleDocument.create({
      data: {
        offboardingId: id,
        kind: data.kind || LifecycleDocumentKind.OTHER,
        title: data.title.trim(),
        url: data.url.trim(),
      },
    });

    await this.audit.log({
      actorId,
      action: 'OFFBOARDING_DOCUMENT_ADD',
      resource: 'OFFBOARDING',
      resourceId: id,
    });

    return this.findOne(id);
  }

  async toggleChecklistItem(
    id: string,
    itemId: string,
    completed: boolean,
    actorId: string,
  ) {
    const req = await this.findOne(id);
    if (req.status !== OffboardingStatus.EXIT_CLEARANCE) {
      throw new BadRequestException('Checklist is only editable in exit clearance stage');
    }
    const item = req.checklistItems.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found');

    await this.prisma.lifecycleChecklistItem.update({
      where: { id: itemId },
      data: { completed },
    });

    await this.audit.log({
      actorId,
      action: 'OFFBOARDING_CHECKLIST_TOGGLE',
      resource: 'OFFBOARDING',
      resourceId: id,
      metadata: { itemId, completed },
    });

    return this.findOne(id);
  }

  async advance(id: string, actorId: string) {
    const req = await this.findOne(id);

    if (req.status === OffboardingStatus.EXIT_CLEARANCE) {
      const pending = req.checklistItems.filter((i) => !i.completed);
      if (pending.length) {
        throw new BadRequestException(
          `Complete all checklist items first (${pending.length} remaining)`,
        );
      }
      const updated = await this.prisma.offboardingRequest.update({
        where: { id },
        data: { status: OffboardingStatus.FINAL_DOCUMENTS },
        include: includeAll,
      });
      await this.audit.log({
        actorId,
        action: 'OFFBOARDING_ADVANCE',
        resource: 'OFFBOARDING',
        resourceId: id,
        metadata: { to: 'FINAL_DOCUMENTS' },
      });
      return updated;
    }

    if (req.status === OffboardingStatus.FINAL_DOCUMENTS) {
      const updated = await this.prisma.offboardingRequest.update({
        where: { id },
        data: { status: OffboardingStatus.REVOKE_ACCESS },
        include: includeAll,
      });
      await this.audit.log({
        actorId,
        action: 'OFFBOARDING_ADVANCE',
        resource: 'OFFBOARDING',
        resourceId: id,
        metadata: { to: 'REVOKE_ACCESS' },
      });
      return updated;
    }

    throw new BadRequestException('Cannot advance from current stage');
  }

  async sendFinalDocsEmail(
    id: string,
    actorId: string,
    body?: { subject?: string; message?: string },
  ) {
    const req = await this.findOne(id);
    if (
      req.status !== OffboardingStatus.FINAL_DOCUMENTS &&
      req.status !== OffboardingStatus.REVOKE_ACCESS
    ) {
      throw new BadRequestException('Not in final documents stage');
    }

    const email = req.employee.user?.email;
    if (!email) throw new BadRequestException('Employee email not found');

    const subject =
      body?.subject?.trim() ||
      `Exit documentation — ${req.employee.firstName} ${req.employee.lastName}`;
    const text =
      body?.message?.trim() ||
      `Hi ${req.employee.firstName},\n\nPlease find attached / linked your exit documentation (relieving letter, experience letter, and final settlement details) as part of your offboarding process.\n\nLast working day: ${req.lastWorkingDay.toLocaleDateString()}\n\nBest regards,\nHR Team — Go Staff`;

    const result = await this.email.send({ to: email, subject, text });

    await this.audit.log({
      actorId,
      action: 'OFFBOARDING_FINAL_EMAIL',
      resource: 'OFFBOARDING',
      resourceId: id,
      metadata: { delivered: result.delivered, mode: result.mode },
    });

    return { ...(await this.findOne(id)), emailResult: result };
  }

  async revokeAccess(id: string, actorId: string) {
    const req = await this.findOne(id);
    if (req.status !== OffboardingStatus.REVOKE_ACCESS) {
      throw new BadRequestException('Request is not in revoke-access stage');
    }

    await this.users.deactivate(
      req.employeeId,
      req.lastWorkingDay.toISOString(),
      actorId,
    );

    const updated = await this.prisma.offboardingRequest.update({
      where: { id },
      data: {
        status: OffboardingStatus.COMPLETED,
        accessRevokedAt: new Date(),
      },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'OFFBOARDING_REVOKE_ACCESS',
      resource: 'OFFBOARDING',
      resourceId: id,
    });

    return updated;
  }

  async cancel(id: string, actorId: string) {
    const req = await this.findOne(id);
    if (
      req.status === OffboardingStatus.COMPLETED ||
      req.status === OffboardingStatus.REJECTED ||
      req.status === OffboardingStatus.CANCELLED
    ) {
      throw new BadRequestException('Request is already closed');
    }

    const updated = await this.prisma.offboardingRequest.update({
      where: { id },
      data: { status: OffboardingStatus.CANCELLED },
      include: includeAll,
    });

    await this.audit.log({
      actorId,
      action: 'OFFBOARDING_CANCEL',
      resource: 'OFFBOARDING',
      resourceId: id,
    });

    return updated;
  }
}
