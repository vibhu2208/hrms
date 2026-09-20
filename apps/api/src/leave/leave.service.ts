import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  leaveTypes() {
    return this.prisma.leaveType.findMany();
  }

  async balances(employeeId: string, year = new Date().getFullYear()) {
    return this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
    });
  }

  async apply(employeeId: string, data: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
    attachmentUrl?: string;
  }) {
    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: data.reason,
        attachmentUrl: data.attachmentUrl,
      },
      include: { leaveType: true, employee: { include: { user: true } } },
    });

    const owners = await this.prisma.user.findMany({
      where: { role: { code: { in: ['OWNER', 'HR'] } } },
    });
    for (const o of owners) {
      await this.notifications.create({
        userId: o.id,
        title: 'Leave request received',
        body: `${request.employee.firstName} applied for ${request.leaveType.name}`,
        type: 'LEAVE_REQUEST',
        link: '/admin/leave',
      });
    }
    return request;
  }

  async myRequests(employeeId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: true, approver: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pending() {
    return this.prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.PENDING },
      include: {
        leaveType: true,
        employee: { include: { department: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async all(filters?: { status?: LeaveStatus; departmentId?: string }) {
    return this.prisma.leaveRequest.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.departmentId
          ? { employee: { departmentId: filters.departmentId } }
          : {}),
      },
      include: {
        leaveType: true,
        employee: { include: { department: true } },
        approver: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async review(
    id: string,
    action: 'APPROVE' | 'REJECT' | 'CLARIFICATION',
    approverEmployeeId: string,
    actorUserId: string,
    note?: string,
  ) {
    const req = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { include: { user: true } }, leaveType: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status !== LeaveStatus.PENDING && req.status !== LeaveStatus.CLARIFICATION) {
      throw new BadRequestException('Request not reviewable');
    }

    const statusMap = {
      APPROVE: LeaveStatus.APPROVED,
      REJECT: LeaveStatus.REJECTED,
      CLARIFICATION: LeaveStatus.CLARIFICATION,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        const year = new Date(req.startDate).getFullYear();
        const days =
          Math.ceil(
            (req.endDate.getTime() - req.startDate.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1;
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: req.employeeId,
              leaveTypeId: req.leaveTypeId,
              year,
            },
          },
        });
        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              used: balance.used + days,
              remaining: Math.max(0, balance.remaining - days),
            },
          });
        }
      }
      return tx.leaveRequest.update({
        where: { id },
        data: {
          status: statusMap[action],
          approverId: approverEmployeeId,
          reviewNote: note,
        },
        include: { leaveType: true, employee: true },
      });
    });

    await this.audit.log({
      actorId: actorUserId,
      action: `LEAVE_${action}`,
      resource: 'LEAVE',
      resourceId: id,
    });

    await this.notifications.create({
      userId: req.employee.userId,
      title: `Leave ${action.toLowerCase()}`,
      body: `Your ${req.leaveType.name} request was ${action.toLowerCase()}`,
      type: 'LEAVE_STATUS',
      link: '/employee/leave',
    });

    return updated;
  }

  async cancel(id: string, employeeId: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req || req.employeeId !== employeeId) throw new NotFoundException();
    if (req.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveStatus.CANCELLED },
    });
  }
}
