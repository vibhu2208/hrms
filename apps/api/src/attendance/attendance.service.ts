import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceApprovalStatus, AttendanceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LocationFix,
  OfficePolicy,
  displayedStatus,
  storedArrivalStatus,
  isPlausibleIpRule,
  overtimeMinutes,
  resolvePublicIp,
  verifyAttendance,
} from './attendance.logic';
import {
  CloseMissedClockOutDto,
  ExceptionRequestDto,
  LocationFixDto,
  ManualAttendanceDto,
  MissedClockOutDto,
  UpdateAttendancePolicyDto,
} from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private policyCache: { at: number; row: OfficePolicy & { id: string } } | null = null;
  private listCache = new Map<string, { at: number; rows: any[] }>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private clearReadCache() {
    this.listCache.clear();
  }

  private async labelRows<T extends { status?: string | null; checkIn?: Date | string | null }>(rows: T[]) {
    if (!rows.length) return rows;
    const shiftStart = (await this.policy()).shiftStart;
    return rows.map((row) => {
      if (!row.status) return row;
      const status = displayedStatus(row.status, row.checkIn, shiftStart);
      return status === row.status ? row : { ...row, status };
    });
  }

  private async labelRow<T extends { status?: string | null; checkIn?: Date | string | null }>(row: T) {
    const [labeled] = await this.labelRows([row]);
    return labeled;
  }

  private todayDate() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private async policy(): Promise<OfficePolicy & { id: string }> {
    if (this.policyCache && Date.now() - this.policyCache.at < 60_000) return this.policyCache.row;
    const existing = await this.prisma.attendancePolicy.findUnique({ where: { id: 'default' } });
    const row =
      existing ||
      (await this.prisma.attendancePolicy.create({ data: { id: 'default' } }));
    this.policyCache = { at: Date.now(), row };
    return row;
  }

  private fixOf(dto: LocationFixDto): LocationFix {
    return {
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      capturedAt: dto.capturedAt,
    };
  }

  private async evaluate(peerIp: string, dto: LocationFixDto) {
    const [publicIp, policy] = await Promise.all([resolvePublicIp(peerIp), this.policy()]);
    return { policy, verification: verifyAttendance(policy, publicIp, this.fixOf(dto)) };
  }

  private evidence(verification: ReturnType<typeof verifyAttendance>) {
    return {
      latitude: verification.latitude,
      longitude: verification.longitude,
      locationAccuracy: verification.accuracy,
      locationCapturedAt: verification.capturedAt,
      officeDistance: verification.distanceMeters,
      locationVerified: verification.locationVerified,
      publicIp: verification.publicIp,
      networkVerified: verification.networkVerified,
    };
  }

  private async todayRow(employeeId: string) {
    return this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: this.todayDate() } },
    });
  }

  private access(existing: { checkIn: Date | null; status: AttendanceStatus; approvalStatus: AttendanceApprovalStatus } | null, bothVerified: boolean, hrApproval: boolean) {
    if (existing?.approvalStatus === AttendanceApprovalStatus.PENDING) {
      return {
        canAutoMark: false,
        canRequestApproval: false,
        blockedReason: 'An attendance request is already waiting for HR approval.',
      };
    }
    const closed =
      existing?.checkIn &&
      existing.approvalStatus !== AttendanceApprovalStatus.REJECTED &&
      existing.status !== AttendanceStatus.REJECTED;
    if (closed) {
      return {
        canAutoMark: false,
        canRequestApproval: false,
        blockedReason: 'Already checked in today.',
      };
    }
    if (bothVerified) {
      return { canAutoMark: true, canRequestApproval: false, blockedReason: null };
    }
    if (!hrApproval) {
      return {
        canAutoMark: false,
        canRequestApproval: false,
        blockedReason: 'HR approval for exceptions is turned off. Contact HR.',
      };
    }
    return { canAutoMark: false, canRequestApproval: true, blockedReason: null };
  }

  async preview(employeeId: string | undefined, publicIp: string, dto: LocationFixDto) {
    this.requireEmployee(employeeId);
    const [{ policy, verification }, today] = await Promise.all([
      this.evaluate(publicIp, dto),
      this.todayRow(employeeId!),
    ]);
    const access = this.access(
      today,
      verification.locationVerified && verification.networkVerified,
      policy.hrApprovalForExceptions,
    );
    return {
      ...verification,
      requireLocation: policy.requireLocation,
      requireNetwork: policy.requireNetwork,
      hrApprovalForExceptions: policy.hrApprovalForExceptions,
      allowedRadiusMeters: policy.allowedRadiusMeters,
      officeConfigured: policy.officeLatitude != null && policy.officeLongitude != null,
      networkConfigured: policy.authorizedIps.some((ip) => ip.trim()),
      ...access,
      today: today ? await this.labelRow(today) : null,
    };
  }

  async checkIn(employeeId: string | undefined, actorId: string, publicIp: string, dto: LocationFixDto) {
    const id = this.requireEmployee(employeeId);
    const [{ policy, verification }, existing] = await Promise.all([
      this.evaluate(publicIp, dto),
      this.todayRow(id),
    ]);
    const access = this.access(
      existing,
      verification.locationVerified && verification.networkVerified,
      policy.hrApprovalForExceptions,
    );
    if (access.blockedReason) throw new BadRequestException(access.blockedReason);
    if (!verification.locationVerified || !verification.networkVerified) {
      throw new BadRequestException(
        'Office location and office network must both be verified before attendance can be marked automatically.',
      );
    }

    const date = this.todayDate();
    const now = new Date();
    const status = storedArrivalStatus(now, policy.shiftStart);
    const saved = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: id, date } },
      create: {
        employeeId: id,
        date,
        checkIn: now,
        status,
        overtimeMinutes: 0,
        approvalStatus: AttendanceApprovalStatus.NOT_REQUIRED,
        ...this.evidence(verification),
      },
      update: {
        checkIn: now,
        checkOut: null,
        workingMinutes: null,
        overtimeMinutes: 0,
        status,
        approvalStatus: AttendanceApprovalStatus.NOT_REQUIRED,
        exceptionReason: null,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        ...this.evidence(verification),
      },
    });

    this.clearReadCache();
    void this.audit.log({
      actorId,
      action: 'CHECK_IN',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: this.auditMeta(id, existing?.status ?? null, saved, null),
    });
    return this.labelRow(saved);
  }

  async requestException(
    employeeId: string | undefined,
    actorId: string,
    publicIp: string,
    dto: ExceptionRequestDto,
  ) {
    const id = this.requireEmployee(employeeId);
    const [{ policy, verification }, existing] = await Promise.all([
      this.evaluate(publicIp, dto),
      this.todayRow(id),
    ]);
    if (verification.locationVerified && verification.networkVerified) {
      throw new BadRequestException('Both checks passed. Mark attendance directly.');
    }
    if (!policy.hrApprovalForExceptions) {
      throw new BadRequestException('HR approval for exceptions is turned off. Contact HR.');
    }

    const date = this.todayDate();
    const now = new Date();
    const access = this.access(existing, false, true);
    if (!access.canRequestApproval) {
      throw new BadRequestException(access.blockedReason || 'An exception cannot be submitted.');
    }
    const saved = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: id, date } },
      create: {
        employeeId: id,
        date,
        checkIn: now,
        status: AttendanceStatus.PENDING_APPROVAL,
        approvalStatus: AttendanceApprovalStatus.PENDING,
        exceptionReason: dto.reason.trim(),
        ...this.evidence(verification),
      },
      update: {
        checkIn: now,
        checkOut: null,
        workingMinutes: null,
        status: AttendanceStatus.PENDING_APPROVAL,
        approvalStatus: AttendanceApprovalStatus.PENDING,
        exceptionReason: dto.reason.trim(),
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        ...this.evidence(verification),
      },
    });

    this.clearReadCache();
    void this.audit.log({
      actorId,
      action: 'EXCEPTION_REQUEST',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: this.auditMeta(id, existing?.status ?? null, saved, dto.reason.trim()),
    });
    return saved;
  }

  async checkOut(employeeId: string | undefined, actorId: string, publicIp: string) {
    const id = this.requireEmployee(employeeId);
    const existing = await this.todayRow(id);
    if (!existing?.checkIn) throw new BadRequestException('Check in first');
    if (existing.approvalStatus === AttendanceApprovalStatus.PENDING) {
      throw new BadRequestException('Attendance is waiting for HR approval.');
    }
    if (
      existing.status === AttendanceStatus.REJECTED ||
      existing.approvalStatus === AttendanceApprovalStatus.REJECTED
    ) {
      throw new BadRequestException('Today’s attendance was rejected.');
    }
    if (existing.checkOut) throw new BadRequestException('Already checked out');
    if (
      existing.status !== AttendanceStatus.PRESENT &&
      existing.status !== AttendanceStatus.LATE &&
      existing.status !== AttendanceStatus.HALF_DAY &&
      existing.status !== AttendanceStatus.WFH
    ) {
      throw new BadRequestException('This attendance record cannot be checked out.');
    }

    const now = new Date();
    const policy = await this.policy();
    const workingMinutes = Math.round((now.getTime() - existing.checkIn.getTime()) / 60000);
    const saved = await this.prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut: now, workingMinutes, overtimeMinutes: overtimeMinutes(now, policy.shiftEnd) },
    });
    this.clearReadCache();
    void resolvePublicIp(publicIp).then((ip) =>
      this.audit.log({
        actorId,
        action: 'CHECK_OUT',
        resource: 'ATTENDANCE',
        resourceId: saved.id,
        metadata: {
          ...this.auditMeta(id, existing.status, saved, null),
          publicIp: ip,
        },
      }),
    );
    return this.labelRow(saved);
  }

  async history(employeeId: string | undefined, from?: string, to?: string) {
    const id = this.requireEmployee(employeeId);
    return this.recordsFor(id, from, to);
  }

  async historyFor(employeeId: string, from?: string, to?: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.recordsFor(employeeId, from, to);
  }

  private async recordsFor(employeeId: string, from?: string, to?: string) {
    const rows = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        approvedBy: { select: { id: true, email: true } },
      },
      orderBy: { date: 'desc' },
    });
    if (!rows.length) return rows;
    const extra = await this.prisma.$queryRaw<any[]>`
      SELECT id, "missedClockOutReason", "proposedCheckOut"
      FROM "Attendance"
      WHERE id IN (${Prisma.join(rows.map((row) => row.id))})
    `;
    const byId = new Map(extra.map((row) => [row.id, row]));
    return this.labelRows(rows.map((row) => ({ ...row, ...(byId.get(row.id) || {}) })));
  }

  async todayStatus(employeeId: string | undefined) {
    if (!employeeId) return null;
    const row = await this.todayRow(employeeId);
    return row ? this.labelRow(row) : null;
  }

  async listAll(query?: { date?: string; departmentId?: string }) {
    const key = `list:${query?.date || ''}:${query?.departmentId || ''}`;
    const cached = this.listCache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.rows;

    const date = query?.date ? new Date(query.date) : null;
    const departmentId = query?.departmentId || null;
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT a.id,
             a.date,
             a.status::text AS status,
             a."approvalStatus"::text AS "approvalStatus",
             a."locationVerified",
             a.latitude,
             a.longitude,
             a."officeDistance",
             a."networkVerified",
             a."overtimeMinutes",
             a."checkIn",
             a."checkOut",
             json_build_object(
               'firstName', e."firstName",
               'lastName', e."lastName",
               'employeeCode', e."employeeCode",
               'department', d.name
             ) AS employee
      FROM "Attendance" a
      JOIN "Employee" e ON e.id = a."employeeId"
      LEFT JOIN "Department" d ON d.id = e."departmentId"
      WHERE (${date}::timestamptz IS NULL OR a.date = ${date})
        AND (${departmentId}::text IS NULL OR e."departmentId" = ${departmentId})
      ORDER BY a.date DESC
      LIMIT 500
    `;
    const labeled = await this.labelRows(rows);
    this.listCache.set(key, { at: Date.now(), rows: labeled });
    return labeled;
  }

  async approvals() {
    const key = 'approvals';
    const cached = this.listCache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.rows;

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT a.id,
             a.date,
             a.status::text AS status,
             a."approvalStatus"::text AS "approvalStatus",
             a."checkIn",
             a.latitude,
             a.longitude,
             a."locationAccuracy",
             a."officeDistance",
             a."locationVerified",
             a."networkVerified",
             a."publicIp",
             a."exceptionReason",
             a."rejectionReason",
             a."approvedAt",
             a."createdAt",
             json_build_object(
               'firstName', e."firstName",
               'lastName', e."lastName",
               'employeeCode', e."employeeCode"
             ) AS employee,
             CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
               'id', u.id,
               'email', u.email,
               'employee', CASE WHEN approver.id IS NULL THEN NULL ELSE json_build_object(
                 'firstName', approver."firstName",
                 'lastName', approver."lastName"
               ) END
             ) END AS "approvedBy"
      FROM "Attendance" a
      JOIN "Employee" e ON e.id = a."employeeId"
      LEFT JOIN "User" u ON u.id = a."approvedById"
      LEFT JOIN "Employee" approver ON approver."userId" = u.id
      WHERE a."approvalStatus"::text <> 'NOT_REQUIRED'
      ORDER BY a."createdAt" DESC
      LIMIT 200
    `;
    this.listCache.set(key, { at: Date.now(), rows });
    return rows;
  }

  async approve(attendanceId: string, actorId: string) {
    const existing = await this.prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!existing) throw new NotFoundException('Attendance request not found');
    if (existing.approvalStatus !== AttendanceApprovalStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved.');
    }
    const policy = await this.policy();
    const status = existing.checkIn ? storedArrivalStatus(existing.checkIn, policy.shiftStart) : AttendanceStatus.PRESENT;
    const saved = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status,
        approvalStatus: AttendanceApprovalStatus.APPROVED,
        approvedById: actorId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
    this.clearReadCache();
    await this.audit.log({
      actorId,
      action: 'APPROVE',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: this.auditMeta(existing.employeeId, existing.status, saved, existing.exceptionReason),
    });
    return this.labelRow(saved);
  }

  async reject(attendanceId: string, actorId: string, rejectionReason: string) {
    const existing = await this.prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!existing) throw new NotFoundException('Attendance request not found');
    if (existing.approvalStatus !== AttendanceApprovalStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected.');
    }
    const saved = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.REJECTED,
        approvalStatus: AttendanceApprovalStatus.REJECTED,
        approvedById: actorId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
      },
    });
    this.clearReadCache();
    await this.audit.log({
      actorId,
      action: 'REJECT',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: this.auditMeta(existing.employeeId, existing.status, saved, rejectionReason.trim()),
    });
    return saved;
  }

  async reportMissedClockOut(employeeId: string | undefined, actorId: string, dto: MissedClockOutDto) {
    const id = this.requireEmployee(employeeId);
    const existing = await this.openClockOut(dto.attendanceId);
    if (!existing || existing.employeeId !== id) throw new NotFoundException('Attendance record not found');

    const checkOut = new Date(dto.checkOut);
    if (Number.isNaN(checkOut.getTime()) || checkOut <= existing.checkIn || checkOut > new Date()) {
      throw new BadRequestException('Clock-out must be after check-in and cannot be in the future.');
    }

    const reason = dto.reason.trim();
    await this.prisma.$executeRaw`
      UPDATE "Attendance"
      SET "missedClockOutReason" = ${reason},
          "proposedCheckOut" = ${checkOut},
          "updatedAt" = NOW()
      WHERE id = ${existing.id}
    `;
    this.clearReadCache();
    await this.audit.log({
      actorId,
      action: 'MISSED_CLOCK_OUT',
      resource: 'ATTENDANCE',
      resourceId: existing.id,
      metadata: this.auditMeta(id, existing.status, existing, reason),
    });
    return { ...existing, missedClockOutReason: reason, proposedCheckOut: checkOut };
  }

  async missedClockOuts() {
    const key = 'missed-clock-outs';
    const cached = this.listCache.get(key);
    if (cached && Date.now() - cached.at < 15_000) return cached.rows;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT a.id,
             a.date,
             a.status::text AS status,
             a."approvalStatus"::text AS "approvalStatus",
             a."checkIn",
             a."checkOut",
             a."proposedCheckOut",
             a."missedClockOutReason",
             a.latitude,
             a.longitude,
             a."officeDistance",
             a."locationVerified",
             a."networkVerified",
             a."publicIp",
             json_build_object(
               'firstName', e."firstName",
               'lastName', e."lastName",
               'employeeCode', e."employeeCode"
             ) AS employee
      FROM "Attendance" a
      JOIN "Employee" e ON e.id = a."employeeId"
      WHERE a."checkOut" IS NULL
        AND a."checkIn" IS NOT NULL
        AND a."checkIn" <= ${cutoff}
        AND a.status::text <> 'REJECTED'
        AND a."approvalStatus"::text <> 'REJECTED'
      ORDER BY a."checkIn" ASC
      LIMIT 200
    `;
    const shaped = rows.map((row) => ({
      ...row,
      reason: row.missedClockOutReason || 'No clock-out was recorded within 24 hours of check-in.',
    }));
    this.listCache.set(key, { at: Date.now(), rows: shaped });
    return shaped;
  }

  async closeMissedClockOut(attendanceId: string, actorId: string, dto: CloseMissedClockOutDto) {
    const existing = await this.openClockOut(attendanceId);
    if (!existing) throw new NotFoundException('Attendance record not found');

    const checkOut = new Date(dto.checkOut);
    if (Number.isNaN(checkOut.getTime()) || checkOut <= existing.checkIn || checkOut > new Date()) {
      throw new BadRequestException('Clock-out must be after check-in and cannot be in the future.');
    }

    const policy = await this.policy();
    const reason = dto.reason.trim();
    const workingMinutes = Math.round((checkOut.getTime() - existing.checkIn.getTime()) / 60000);
    const extra = overtimeMinutes(checkOut, policy.shiftEnd);
    await this.prisma.$executeRaw`
      UPDATE "Attendance"
      SET "checkOut" = ${checkOut},
          "workingMinutes" = ${workingMinutes},
          "overtimeMinutes" = ${extra},
          "missedClockOutReason" = ${reason},
          "proposedCheckOut" = COALESCE("proposedCheckOut", ${checkOut}),
          "updatedAt" = NOW()
      WHERE id = ${existing.id}
    `;
    this.clearReadCache();
    await this.audit.log({
      actorId,
      action: 'MISSED_CLOCK_OUT_CLOSED',
      resource: 'ATTENDANCE',
      resourceId: existing.id,
      metadata: this.auditMeta(existing.employeeId, existing.status, { ...existing, status: existing.status }, reason),
    });
    return { ...existing, checkOut, workingMinutes, overtimeMinutes: extra, missedClockOutReason: reason };
  }

  private async openClockOut(attendanceId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id,
             "employeeId",
             date,
             "checkIn",
             "checkOut",
             status::text AS status,
             "approvalStatus"::text AS "approvalStatus",
             "publicIp",
             latitude,
             longitude,
             "locationAccuracy",
             "officeDistance",
             "locationVerified",
             "networkVerified",
             "approvedById",
             "exceptionReason",
             "rejectionReason"
      FROM "Attendance"
      WHERE id = ${attendanceId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (!row.checkIn || row.checkOut) throw new BadRequestException('This day is not an open clock-out.');
    if (row.status === 'REJECTED' || row.approvalStatus === 'REJECTED') {
      throw new BadRequestException('This attendance was rejected.');
    }
    const checkIn = new Date(row.checkIn);
    if (Date.now() - checkIn.getTime() < 24 * 60 * 60 * 1000) {
      throw new BadRequestException('A missed clock-out can be reviewed after 24 hours.');
    }
    return { ...row, checkIn };
  }

  async mark(employeeId: string, actorId: string, data: ManualAttendanceDto) {
    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    const saved = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        employeeId,
        date,
        status: data.status,
        notes: data.notes,
        approvalStatus: AttendanceApprovalStatus.NOT_REQUIRED,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      update: {
        status: data.status,
        notes: data.notes,
        approvedById: actorId,
        approvedAt: new Date(),
      },
    });
    this.clearReadCache();
    await this.audit.log({
      actorId,
      action: 'MANUAL_MARK',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: this.auditMeta(employeeId, existing?.status ?? null, saved, data.notes ?? null),
    });
    return saved;
  }

  async getConfig(observedIp: string) {
    const policy = await this.policy();
    return { ...policy, observedIp: await resolvePublicIp(observedIp) };
  }

  async updateConfig(actorId: string, dto: UpdateAttendancePolicyDto) {
    const authorizedIps = [...new Set(dto.authorizedIps.map((ip) => ip.trim()).filter(Boolean))];
    const invalid = authorizedIps.filter((ip) => !isPlausibleIpRule(ip));
    if (invalid.length) {
      throw new BadRequestException(`Invalid IP or CIDR: ${invalid.join(', ')}`);
    }
    if (dto.requireLocation && (dto.officeLatitude == null || dto.officeLongitude == null)) {
      throw new BadRequestException('Office latitude and longitude are required when location verification is on.');
    }
    if (dto.requireNetwork && !authorizedIps.length) {
      throw new BadRequestException('Add at least one authorized office IP when network verification is on.');
    }
    const shiftStart = dto.shiftStart ?? null;
    const shiftEnd = dto.shiftEnd ?? null;
    if (shiftStart && shiftEnd && shiftEnd <= shiftStart) {
      throw new BadRequestException('Out time must be later than in time.');
    }

    this.policyCache = null;
    const saved = await this.prisma.attendancePolicy.upsert({
      where: { id: 'default' },
      update: {
        officeLatitude: dto.officeLatitude ?? null,
        officeLongitude: dto.officeLongitude ?? null,
        allowedRadiusMeters: dto.allowedRadiusMeters,
        authorizedIps,
        requireLocation: dto.requireLocation,
        requireNetwork: dto.requireNetwork,
        hrApprovalForExceptions: dto.hrApprovalForExceptions,
        shiftStart,
        shiftEnd,
      },
      create: {
        id: 'default',
        officeLatitude: dto.officeLatitude ?? null,
        officeLongitude: dto.officeLongitude ?? null,
        allowedRadiusMeters: dto.allowedRadiusMeters,
        authorizedIps,
        requireLocation: dto.requireLocation,
        requireNetwork: dto.requireNetwork,
        hrApprovalForExceptions: dto.hrApprovalForExceptions,
        shiftStart,
        shiftEnd,
      },
    });
    await this.audit.log({
      actorId,
      action: 'CONFIG_UPDATE',
      resource: 'ATTENDANCE',
      resourceId: saved.id,
      metadata: {
        officeLatitude: saved.officeLatitude,
        officeLongitude: saved.officeLongitude,
        allowedRadiusMeters: saved.allowedRadiusMeters,
        authorizedIps: saved.authorizedIps,
        requireLocation: saved.requireLocation,
        requireNetwork: saved.requireNetwork,
        hrApprovalForExceptions: saved.hrApprovalForExceptions,
        shiftStart: saved.shiftStart,
        shiftEnd: saved.shiftEnd,
      },
    });
    return saved;
  }

  async auditTrail() {
    const key = 'audit';
    const cached = this.listCache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.rows;

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT al.id,
             al.action,
             al.metadata,
             al."createdAt",
             CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
               'email', u.email,
               'employee', CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object(
                 'firstName', e."firstName",
                 'lastName', e."lastName",
                 'employeeCode', e."employeeCode"
               ) END
             ) END AS actor
      FROM "AuditLog" al
      LEFT JOIN "User" u ON u.id = al."actorId"
      LEFT JOIN "Employee" e ON e."userId" = u.id
      WHERE al.resource = 'ATTENDANCE'
      ORDER BY al."createdAt" DESC
      LIMIT 200
    `;
    this.listCache.set(key, { at: Date.now(), rows });
    return rows;
  }

  private requireEmployee(employeeId?: string) {
    if (!employeeId) throw new BadRequestException('Your account is not linked to an employee profile.');
    return employeeId;
  }

  private auditMeta(
    employeeId: string,
    previousStatus: string | null,
    row: {
      date: Date;
      status: string;
      approvalStatus: string;
      publicIp: string | null;
      latitude: number | null;
      longitude: number | null;
      locationAccuracy: number | null;
      officeDistance: number | null;
      locationVerified: boolean;
      networkVerified: boolean;
      approvedById: string | null;
      exceptionReason: string | null;
      rejectionReason: string | null;
    },
    reason: string | null,
  ) {
    return {
      employeeId,
      date: row.date.toISOString(),
      publicIp: row.publicIp,
      latitude: row.latitude,
      longitude: row.longitude,
      locationAccuracy: row.locationAccuracy,
      distanceMeters: row.officeDistance,
      locationVerified: row.locationVerified,
      networkVerified: row.networkVerified,
      previousStatus,
      newStatus: row.status,
      approvalStatus: row.approvalStatus,
      approvedById: row.approvedById,
      reason: reason || row.exceptionReason || row.rejectionReason,
    };
  }
}
