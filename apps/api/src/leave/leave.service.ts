import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveFrequency, LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  chargeableDays,
  carriedDays,
  normalizeWeekOffs,
  noticeGap,
  resolveDaysPerPeriod,
  yearlyTotal,
  type LeaveFrequencyCode,
} from './leave.logic';

type LeaveStore = PrismaService | Prisma.TransactionClient;

const OPEN_STATUSES: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.CLARIFICATION];

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  leaveTypes() {
    return this.prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
  }

  async weekOff() {
    const policy = await this.prisma.attendancePolicy.findUnique({
      where: { id: 'default' },
      select: { weekOffDays: true },
    });
    return { days: normalizeWeekOffs(policy?.weekOffDays) };
  }

  async saveWeekOff(days: unknown, actorId: string) {
    if (!Array.isArray(days)) throw new BadRequestException('Choose the weekly off days');
    const invalid = days.some((day) => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6);
    if (invalid) throw new BadRequestException('Week off days must be between Sunday and Saturday');
    const normalized = normalizeWeekOffs(days);
    if (normalized.length > 6) throw new BadRequestException('At least one weekday must be a working day');
    await this.prisma.attendancePolicy.upsert({
      where: { id: 'default' },
      update: { weekOffDays: normalized },
      create: { id: 'default', weekOffDays: normalized },
    });
    await this.syncBalances();
    await this.audit.log({
      actorId,
      action: 'WEEK_OFF_UPDATE',
      resource: 'LEAVE',
      resourceId: 'default',
      metadata: { weekOffDays: normalized },
    });
    return { days: normalized };
  }

  private async weekOffDays(db: LeaveStore = this.prisma) {
    const policy = await db.attendancePolicy.findUnique({
      where: { id: 'default' },
      select: { weekOffDays: true },
    });
    return normalizeWeekOffs(policy?.weekOffDays);
  }

  allocations() {
    return this.prisma.leaveAllocation.findMany({
      include: {
        leaveType: true,
        department: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, departmentId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createType(data: Record<string, unknown>, actorUserId?: string) {
    const payload = this.typePayload(data, true);
    const created = await this.prisma.leaveType.create({ data: payload });
    await this.syncBalances({ leaveTypeIds: [created.id] });
    await this.audit.log({
      actorId: actorUserId,
      action: 'LEAVE_TYPE_CREATE',
      resource: 'LEAVE',
      resourceId: created.id,
    });
    return created;
  }

  async updateType(id: string, data: Record<string, unknown>, actorUserId?: string) {
    const existing = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave type not found');
    const payload = this.typePayload(data, false, existing);
    const updated = await this.prisma.leaveType.update({ where: { id }, data: payload });
    await this.syncBalances({ leaveTypeIds: [id] });
    await this.audit.log({
      actorId: actorUserId,
      action: 'LEAVE_TYPE_UPDATE',
      resource: 'LEAVE',
      resourceId: id,
    });
    return updated;
  }

  async createAllocation(data: Record<string, unknown>, actorUserId?: string) {
    const payload = await this.allocationPayload(data);
    const existing = await this.prisma.leaveAllocation.findFirst({
      where: {
        leaveTypeId: payload.leaveTypeId,
        departmentId: payload.departmentId,
        employeeId: payload.employeeId,
      },
    });
    if (existing) throw new BadRequestException('An allocation already exists for this leave and target');
    const created = await this.prisma.leaveAllocation.create({
      data: payload,
      include: { leaveType: true, department: true, employee: true },
    });
    await this.syncAllocation(created.leaveTypeId, created.departmentId, created.employeeId);
    await this.audit.log({
      actorId: actorUserId,
      action: 'LEAVE_ALLOCATION_CREATE',
      resource: 'LEAVE',
      resourceId: created.id,
    });
    return created;
  }

  async updateAllocation(id: string, data: Record<string, unknown>, actorUserId?: string) {
    const existing = await this.prisma.leaveAllocation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Allocation not found');
    const days = this.wholeDays(data.days, 'Days');
    const updated = await this.prisma.leaveAllocation.update({
      where: { id },
      data: { days },
      include: { leaveType: true, department: true, employee: true },
    });
    await this.syncAllocation(updated.leaveTypeId, updated.departmentId, updated.employeeId);
    await this.audit.log({
      actorId: actorUserId,
      action: 'LEAVE_ALLOCATION_UPDATE',
      resource: 'LEAVE',
      resourceId: id,
    });
    return updated;
  }

  async deleteAllocation(id: string, actorUserId?: string) {
    const existing = await this.prisma.leaveAllocation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Allocation not found');
    await this.prisma.leaveAllocation.delete({ where: { id } });
    await this.syncAllocation(existing.leaveTypeId, existing.departmentId, existing.employeeId);
    await this.audit.log({
      actorId: actorUserId,
      action: 'LEAVE_ALLOCATION_DELETE',
      resource: 'LEAVE',
      resourceId: id,
    });
    return { ok: true };
  }

  async balances(employeeId: string, year = new Date().getFullYear()) {
    await this.syncBalances({ employeeIds: [employeeId], year });
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, departmentId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const rows = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year, leaveType: { active: true } },
      include: { leaveType: true },
      orderBy: { leaveType: { name: 'asc' } },
    });
    const typeIds = rows.map((row) => row.leaveTypeId);
    const [pending, allocations, previous] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          leaveTypeId: { in: typeIds },
          status: { in: OPEN_STATUSES },
          startDate: this.yearWindow(year),
        },
        select: { leaveTypeId: true, startDate: true, endDate: true },
      }),
      this.prisma.leaveAllocation.findMany({
        where: {
          leaveTypeId: { in: typeIds },
          OR: [{ employeeId }, ...(employee.departmentId ? [{ departmentId: employee.departmentId }] : [])],
        },
      }),
      this.prisma.leaveBalance.findMany({
        where: { employeeId, year: year - 1, leaveTypeId: { in: typeIds } },
      }),
    ]);

    const weekOffs = await this.weekOffDays();
    const pendingByType = new Map<string, number>();
    for (const request of pending) {
      pendingByType.set(
        request.leaveTypeId,
        (pendingByType.get(request.leaveTypeId) || 0) + chargeableDays(request.startDate, request.endDate, weekOffs),
      );
    }
    const previousByType = new Map(previous.map((row) => [row.leaveTypeId, row.remaining]));

    return rows.map((row) => {
      const resolved = resolveDaysPerPeriod({
        employeeId,
        departmentId: employee.departmentId,
        leaveTypeId: row.leaveTypeId,
        defaultDays: row.leaveType.days,
        allocations,
      });
      const carried = carriedDays(
        previousByType.get(row.leaveTypeId) || 0,
        row.leaveType.carryForward,
        row.leaveType.maxCarryDays,
      );
      const pendingDays = pendingByType.get(row.leaveTypeId) || 0;
      return {
        ...row,
        pending: pendingDays,
        available: Math.max(0, row.remaining - pendingDays),
        source: resolved.source,
        daysPerPeriod: resolved.daysPerPeriod,
        carried,
        frequency: row.leaveType.frequency,
      };
    });
  }

  async apply(
    employeeId: string,
    data: {
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
      attachmentUrl?: string;
    },
  ) {
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: data.leaveTypeId } });
    if (!leaveType || !leaveType.active) throw new BadRequestException('This leave type is not available');
    const reason = String(data.reason || '').trim();
    if (!reason) throw new BadRequestException('A reason is required');
    const startDate = this.parseDay(data.startDate, 'Start date');
    const endDate = this.parseDay(data.endDate, 'End date');
    if (endDate < startDate) throw new BadRequestException('End date is before the start date');
    const weekOffs = await this.weekOffDays();
    const days = chargeableDays(startDate, endDate, weekOffs);
    if (!days) throw new BadRequestException('This range falls only on weekly offs');
    if (leaveType.maxConsecutiveDays && days > leaveType.maxConsecutiveDays) {
      throw new BadRequestException(
        `${leaveType.name} can be taken for at most ${leaveType.maxConsecutiveDays} consecutive day(s)`,
      );
    }
    const gap = noticeGap(startDate, leaveType.minNoticeDays);
    if (gap > 0) {
      throw new BadRequestException(
        `${leaveType.name} must be applied at least ${leaveType.minNoticeDays} day(s) before it starts`,
      );
    }
    const attachmentUrl = data.attachmentUrl?.trim() || null;
    if (leaveType.requiresDocument && !attachmentUrl) {
      throw new BadRequestException(`${leaveType.name} requires a document`);
    }

    const year = startDate.getUTCFullYear();
    const request = await this.prisma.$transaction(async (tx) => {
      await this.syncBalances({ employeeIds: [employeeId], leaveTypeIds: [leaveType.id], year }, tx);
      await this.lockBalance(tx, employeeId, leaveType.id, year);
      const balance = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: leaveType.id, year } },
      });
      const open = await tx.leaveRequest.findMany({
        where: {
          employeeId,
          leaveTypeId: leaveType.id,
          status: { in: OPEN_STATUSES },
          startDate: this.yearWindow(year),
        },
        select: { startDate: true, endDate: true },
      });
      const pendingDays = open.reduce((sum, row) => sum + chargeableDays(row.startDate, row.endDate, weekOffs), 0);
      const available = Math.max(0, (balance?.remaining ?? 0) - pendingDays);
      if (days > available) {
        if (available <= 0) {
          throw new BadRequestException(`You have no ${leaveType.name} left for ${year}`);
        }
        throw new BadRequestException(
          `You have ${available} day(s) of ${leaveType.name} left, and this request is ${days} day(s)`,
        );
      }
      return tx.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          reason,
          attachmentUrl,
        },
        include: { leaveType: true, employee: { include: { user: true } } },
      });
    });

    const owners = await this.prisma.user.findMany({
      where: { role: { code: { in: ['OWNER', 'HR'] } } },
    });
    for (const owner of owners) {
      await this.notifications.create({
        userId: owner.id,
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

  private requestInclude() {
    return {
      leaveType: true,
      employee: { include: { department: true, designation: true } },
      approver: true,
    } as const;
  }

  async overview() {
    const today = this.todayUtc();
    const [pendingRows, requestRows, todayRows] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.PENDING },
        include: this.requestInclude(),
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        include: this.requestInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: LeaveStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: this.requestInclude(),
        orderBy: [{ startDate: 'asc' }],
      }),
    ]);
    const decorated = await this.attachAvailability([...pendingRows, ...requestRows, ...todayRows]);
    const byId = new Map(decorated.map((row) => [row.id, row]));
    return {
      pending: pendingRows.map((row) => byId.get(row.id)),
      requests: requestRows.map((row) => byId.get(row.id)),
      onLeaveToday: todayRows.map((row) => byId.get(row.id)),
    };
  }

  async pending() {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.PENDING },
      include: this.requestInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return this.attachAvailability(rows);
  }

  async all(filters?: { status?: LeaveStatus; departmentId?: string }) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.departmentId
          ? { employee: { departmentId: filters.departmentId } }
          : {}),
      },
      include: this.requestInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return this.attachAvailability(rows);
  }

  private todayUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private async attachAvailability<T extends { id: string; employeeId: string; leaveTypeId: string; startDate: Date }>(rows: T[]) {
    if (!rows.length) return [];
    const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
    const typeIds = [...new Set(rows.map((row) => row.leaveTypeId))];
    const years = [...new Set(rows.map((row) => row.startDate.getUTCFullYear()))];
    for (const year of years) {
      await this.syncBalances({ employeeIds, year });
    }
    const [balances, open] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: { employeeId: { in: employeeIds }, leaveTypeId: { in: typeIds }, year: { in: years } },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          leaveTypeId: { in: typeIds },
          status: { in: OPEN_STATUSES },
          startDate: {
            gte: new Date(Date.UTC(Math.min(...years), 0, 1)),
            lt: new Date(Date.UTC(Math.max(...years) + 1, 0, 1)),
          },
        },
        select: { employeeId: true, leaveTypeId: true, startDate: true, endDate: true },
      }),
    ]);
    const balanceByKey = new Map(
      balances.map((row) => [`${row.employeeId}:${row.leaveTypeId}:${row.year}`, row]),
    );
    const weekOffs = await this.weekOffDays();
    const pendingByKey = new Map<string, number>();
    for (const request of open) {
      const key = `${request.employeeId}:${request.leaveTypeId}:${request.startDate.getUTCFullYear()}`;
      pendingByKey.set(key, (pendingByKey.get(key) || 0) + chargeableDays(request.startDate, request.endDate, weekOffs));
    }
    return rows.map((row) => {
      const year = row.startDate.getUTCFullYear();
      const key = `${row.employeeId}:${row.leaveTypeId}:${year}`;
      const balance = balanceByKey.get(key);
      const pending = pendingByKey.get(key) || 0;
      const remaining = balance?.remaining ?? 0;
      return {
        ...row,
        availability: {
          allocated: balance?.allocated ?? 0,
          used: balance?.used ?? 0,
          remaining,
          pending,
          available: Math.max(0, remaining - pending),
        },
      };
    });
  }

  async review(
    id: string,
    action: 'APPROVE' | 'REJECT' | 'CLARIFICATION',
    approverEmployeeId: string,
    actorUserId: string,
    note?: string,
  ) {
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { include: { user: true } }, leaveType: true },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status !== LeaveStatus.PENDING && existing.status !== LeaveStatus.CLARIFICATION) {
      throw new BadRequestException('Request not reviewable');
    }

    const statusMap = {
      APPROVE: LeaveStatus.APPROVED,
      REJECT: LeaveStatus.REJECTED,
      CLARIFICATION: LeaveStatus.CLARIFICATION,
    };
    const year = existing.startDate.getUTCFullYear();
    const weekOffs = await this.weekOffDays();
    const days = chargeableDays(existing.startDate, existing.endDate, weekOffs);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        await this.syncBalances(
          { employeeIds: [existing.employeeId], leaveTypeIds: [existing.leaveTypeId], year },
          tx,
        );
        await this.lockBalance(tx, existing.employeeId, existing.leaveTypeId, year);
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: existing.employeeId,
              leaveTypeId: existing.leaveTypeId,
              year,
            },
          },
        });
        if (!balance || days > balance.remaining) {
          const left = balance?.remaining ?? 0;
          throw new BadRequestException(
            left <= 0
              ? `${existing.employee.firstName} has no ${existing.leaveType.name} left for ${year}`
              : `Only ${left} day(s) of ${existing.leaveType.name} remain, and this request is ${days} day(s)`,
          );
        }
      }
      const saved = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: statusMap[action],
          approverId: approverEmployeeId,
          reviewNote: note,
        },
        include: { leaveType: true, employee: true },
      });
      if (action === 'APPROVE') {
        await this.syncBalances(
          { employeeIds: [existing.employeeId], leaveTypeIds: [existing.leaveTypeId], year },
          tx,
        );
      }
      return saved;
    });

    await this.audit.log({
      actorId: actorUserId,
      action: `LEAVE_${action}`,
      resource: 'LEAVE',
      resourceId: id,
    });

    await this.notifications.create({
      userId: existing.employee.userId,
      title: `Leave ${action.toLowerCase()}`,
      body: `Your ${existing.leaveType.name} request was ${action.toLowerCase()}`,
      type: 'LEAVE_STATUS',
      link: '/employee/leave',
    });

    return updated;
  }

  async cancel(id: string, employeeId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request || request.employeeId !== employeeId) throw new NotFoundException();
    if (request.status !== LeaveStatus.PENDING && request.status !== LeaveStatus.APPROVED) {
      throw new BadRequestException('Only pending or approved requests can be cancelled');
    }
    const year = request.startDate.getUTCFullYear();
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.leaveRequest.update({
        where: { id },
        data: { status: LeaveStatus.CANCELLED },
      });
      if (request.status === LeaveStatus.APPROVED) {
        await this.syncBalances(
          { employeeIds: [employeeId], leaveTypeIds: [request.leaveTypeId], year },
          tx,
        );
      }
      return saved;
    });
  }

  async syncBalances(
    filter: { employeeIds?: string[]; leaveTypeIds?: string[]; year?: number } = {},
    db: LeaveStore = this.prisma,
  ) {
    if (filter.employeeIds && !filter.employeeIds.length) return;
    if (filter.leaveTypeIds && !filter.leaveTypeIds.length) return;
    const year = filter.year ?? new Date().getFullYear();
    const employees = await db.employee.findMany({
      where: filter.employeeIds?.length ? { id: { in: filter.employeeIds } } : {},
      select: { id: true, departmentId: true },
    });
    if (!employees.length) return;

    const types = await db.leaveType.findMany({
      where: filter.leaveTypeIds?.length ? { id: { in: filter.leaveTypeIds } } : {},
    });
    if (!types.length) return;

    const employeeIds = employees.map((employee) => employee.id);
    const typeIds = types.map((type) => type.id);
    const [allocations, approved, previous] = await Promise.all([
      db.leaveAllocation.findMany({ where: { leaveTypeId: { in: typeIds } } }),
      db.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          leaveTypeId: { in: typeIds },
          status: LeaveStatus.APPROVED,
          startDate: this.yearWindow(year),
        },
        select: { employeeId: true, leaveTypeId: true, startDate: true, endDate: true },
      }),
      db.leaveBalance.findMany({
        where: { employeeId: { in: employeeIds }, leaveTypeId: { in: typeIds }, year: year - 1 },
      }),
    ]);

    const weekOffs = await this.weekOffDays(db);
    const used = new Map<string, number>();
    for (const request of approved) {
      const key = `${request.employeeId}:${request.leaveTypeId}`;
      used.set(key, (used.get(key) || 0) + chargeableDays(request.startDate, request.endDate, weekOffs));
    }
    const previousRemaining = new Map(
      previous.map((row) => [`${row.employeeId}:${row.leaveTypeId}`, row.remaining]),
    );

    for (const employee of employees) {
      for (const type of types) {
        const resolved = resolveDaysPerPeriod({
          employeeId: employee.id,
          departmentId: employee.departmentId,
          leaveTypeId: type.id,
          defaultDays: type.days,
          allocations,
        });
        const yearly = yearlyTotal(resolved.daysPerPeriod, type.frequency);
        const carried = carriedDays(
          previousRemaining.get(`${employee.id}:${type.id}`) || 0,
          type.carryForward,
          type.maxCarryDays,
        );
        const allocated = yearly + carried;
        const spent = used.get(`${employee.id}:${type.id}`) || 0;
        const remaining = Math.max(0, allocated - spent);
        await db.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: employee.id,
              leaveTypeId: type.id,
              year,
            },
          },
          create: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            year,
            allocated,
            used: spent,
            remaining,
          },
          update: { allocated, used: spent, remaining },
        });
      }
    }
  }

  private async syncAllocation(leaveTypeId: string, departmentId: string | null, employeeId: string | null) {
    if (employeeId) {
      await this.syncBalances({ employeeIds: [employeeId], leaveTypeIds: [leaveTypeId] });
      return;
    }
    if (!departmentId) return;
    const employees = await this.prisma.employee.findMany({
      where: { departmentId },
      select: { id: true },
    });
    await this.syncBalances({
      employeeIds: employees.map((employee) => employee.id),
      leaveTypeIds: [leaveTypeId],
    });
  }

  private async lockBalance(tx: Prisma.TransactionClient, employeeId: string, leaveTypeId: string, year: number) {
    await tx.$queryRaw`
      SELECT id FROM "LeaveBalance"
      WHERE "employeeId" = ${employeeId} AND "leaveTypeId" = ${leaveTypeId} AND year = ${year}
      FOR UPDATE
    `;
  }

  private yearWindow(year: number) {
    return {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  private typePayload(
    data: Record<string, unknown>,
    creating: boolean,
    existing?: {
      name: string;
      code: string;
      days: number;
      frequency: LeaveFrequency;
      paid: boolean;
      carryForward: boolean;
      maxCarryDays: number;
      maxConsecutiveDays: number | null;
      minNoticeDays: number;
      requiresDocument: boolean;
      active: boolean;
      description: string | null;
    },
  ): Prisma.LeaveTypeCreateInput {
    const name = data.name === undefined && existing ? existing.name : this.requiredText(data.name, 'Name');
    const code = data.code === undefined && existing
      ? existing.code
      : this.requiredText(data.code, 'Code').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) throw new BadRequestException('Code must use letters or numbers');
    const frequency = (data.frequency === undefined && existing
      ? existing.frequency
      : this.frequency(data.frequency)) as LeaveFrequency;
    const days = data.days === undefined && existing ? existing.days : this.wholeDays(data.days, 'Days');
    const paid = data.paid === undefined && existing ? existing.paid : Boolean(data.paid);
    const carryForward = data.carryForward === undefined && existing ? existing.carryForward : Boolean(data.carryForward);
    const maxCarryDays = data.maxCarryDays === undefined && existing
      ? existing.maxCarryDays
      : this.wholeDays(data.maxCarryDays ?? 0, 'Max carry days');
    const minNoticeDays = data.minNoticeDays === undefined && existing
      ? existing.minNoticeDays
      : this.wholeDays(data.minNoticeDays ?? 0, 'Minimum notice');
    const requiresDocument = data.requiresDocument === undefined && existing
      ? existing.requiresDocument
      : Boolean(data.requiresDocument);
    const active = data.active === undefined && existing ? existing.active : data.active === undefined ? true : Boolean(data.active);
    const description = data.description === undefined && existing
      ? existing.description
      : this.optionalText(data.description);
    const maxConsecutiveDays = data.maxConsecutiveDays === undefined && existing
      ? existing.maxConsecutiveDays
      : this.optionalDays(data.maxConsecutiveDays, 'Maximum consecutive days');

    if (!creating && data.name === undefined && data.code === undefined && data.days === undefined && data.frequency === undefined
      && data.paid === undefined && data.carryForward === undefined && data.maxCarryDays === undefined
      && data.maxConsecutiveDays === undefined && data.minNoticeDays === undefined && data.requiresDocument === undefined
      && data.active === undefined && data.description === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    return {
      name,
      code,
      days,
      frequency,
      annualAllocation: yearlyTotal(days, frequency as LeaveFrequencyCode),
      paid,
      carryForward,
      maxCarryDays,
      maxConsecutiveDays,
      minNoticeDays,
      requiresDocument,
      active,
      description,
    };
  }

  private async allocationPayload(data: Record<string, unknown>) {
    const leaveTypeId = this.requiredText(data.leaveTypeId, 'Leave type');
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    const departmentId = this.optionalText(data.departmentId);
    const employeeId = this.optionalText(data.employeeId);
    if (Boolean(departmentId) === Boolean(employeeId)) {
      throw new BadRequestException('Choose either a department or an employee');
    }
    if (departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) throw new NotFoundException('Department not found');
    }
    if (employeeId) {
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new NotFoundException('Employee not found');
    }
    return {
      leaveTypeId,
      departmentId,
      employeeId,
      days: this.wholeDays(data.days, 'Days'),
    };
  }

  private frequency(value: unknown): LeaveFrequencyCode {
    const code = String(value || '').toUpperCase();
    if (code === 'YEARLY' || code === 'MONTHLY' || code === 'QUARTERLY') return code;
    throw new BadRequestException('Frequency must be yearly, monthly, or quarterly');
  }

  private wholeDays(value: unknown, label: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 366) {
      throw new BadRequestException(`${label} must be a whole number from 0 to 366`);
    }
    return parsed;
  }

  private optionalDays(value: unknown, label: string) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = this.wholeDays(value, label);
    if (parsed === 0) return null;
    return parsed;
  }

  private requiredText(value: unknown, label: string) {
    const text = String(value ?? '').trim();
    if (!text) throw new BadRequestException(`${label} is required`);
    return text;
  }

  private optionalText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private parseDay(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new BadRequestException(`${label} is required`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid`);
    return date;
  }
}
