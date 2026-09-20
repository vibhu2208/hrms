import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private todayDate() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  async checkIn(employeeId: string) {
    const date = this.todayDate();
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (existing?.checkIn) throw new BadRequestException('Already checked in');

    const now = new Date();
    const lateThreshold = new Date(date);
    lateThreshold.setUTCHours(9, 30, 0, 0);
    const status = now > lateThreshold ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { employeeId, date, checkIn: now, status },
      update: { checkIn: now, status },
    });
  }

  async checkOut(employeeId: string) {
    const date = this.todayDate();
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (!existing?.checkIn) throw new BadRequestException('Check in first');
    if (existing.checkOut) throw new BadRequestException('Already checked out');

    const now = new Date();
    const workingMinutes = Math.round(
      (now.getTime() - existing.checkIn.getTime()) / 60000,
    );
    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut: now, workingMinutes },
    });
  }

  async history(employeeId: string, from?: string, to?: string) {
    return this.prisma.attendance.findMany({
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
      orderBy: { date: 'desc' },
    });
  }

  async listAll(query?: { date?: string; departmentId?: string }) {
    return this.prisma.attendance.findMany({
      where: {
        ...(query?.date ? { date: new Date(query.date) } : {}),
        ...(query?.departmentId
          ? { employee: { departmentId: query.departmentId } }
          : {}),
      },
      include: {
        employee: {
          include: { department: true, designation: true },
        },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  async mark(employeeId: string, data: { date: string; status: AttendanceStatus; notes?: string }) {
    const date = new Date(data.date);
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { employeeId, date, status: data.status, notes: data.notes },
      update: { status: data.status, notes: data.notes },
    });
  }

  async todayStatus(employeeId: string) {
    return this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: this.todayDate() } },
    });
  }
}
