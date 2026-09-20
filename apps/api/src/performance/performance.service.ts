import { Injectable, ForbiddenException } from '@nestjs/common';
import { PERFORMANCE_WEIGHTS, performanceBand } from '@go-staff/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrgService } from '../org/org.service';

@Injectable()
export class PerformanceService {
  constructor(
    private prisma: PrismaService,
    private org: OrgService,
  ) {}

  async computeForEmployee(employeeId: string, periodStart: Date, periodEnd: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeId: employeeId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });
    const completed = tasks.filter((t) =>
      ['COMPLETED', 'COMPLETED_ON_TIME', 'COMPLETED_LATE'].includes(t.status),
    );
    const onTime = tasks.filter((t) => t.status === 'COMPLETED_ON_TIME');
    const taskCompletion = tasks.length ? (completed.length / tasks.length) * 100 : 80;
    const timeliness = completed.length ? (onTime.length / completed.length) * 100 : 80;

    const attendance = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: { gte: periodStart, lte: periodEnd },
      },
    });
    const good = attendance.filter((a) =>
      ['PRESENT', 'WFH', 'HOLIDAY', 'LEAVE'].includes(a.status),
    ).length;
    const attendanceScore = attendance.length ? (good / attendance.length) * 100 : 85;
    const productivity = Math.min(100, taskCompletion * 0.9 + 10);

    const overall =
      taskCompletion * PERFORMANCE_WEIGHTS.taskCompletion +
      attendanceScore * PERFORMANCE_WEIGHTS.attendance +
      timeliness * PERFORMANCE_WEIGHTS.timeliness +
      productivity * PERFORMANCE_WEIGHTS.productivity;

    return this.prisma.performanceScore.create({
      data: {
        employeeId,
        periodStart,
        periodEnd,
        taskCompletion: Math.round(taskCompletion * 10) / 10,
        attendance: Math.round(attendanceScore * 10) / 10,
        timeliness: Math.round(timeliness * 10) / 10,
        productivity: Math.round(productivity * 10) / 10,
        overall: Math.round(overall * 10) / 10,
      },
    });
  }

  async list(filters?: {
    departmentId?: string;
    employeeId?: string;
    minScore?: number;
    maxScore?: number;
  }) {
    const scores = await this.prisma.performanceScore.findMany({
      where: {
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters?.minScore != null || filters?.maxScore != null
          ? {
              overall: {
                ...(filters.minScore != null ? { gte: filters.minScore } : {}),
                ...(filters.maxScore != null ? { lte: filters.maxScore } : {}),
              },
            }
          : {}),
        ...(filters?.departmentId
          ? { employee: { departmentId: filters.departmentId } }
          : {}),
      },
      include: {
        employee: {
          include: { department: true, designation: true },
        },
      },
      orderBy: { periodEnd: 'desc' },
    });

    return scores.map((s) => ({
      ...s,
      band: performanceBand(s.overall),
    }));
  }

  async myLatest(employeeId: string) {
    const score = await this.prisma.performanceScore.findFirst({
      where: { employeeId },
      orderBy: { periodEnd: 'desc' },
    });
    if (!score) return null;
    return { ...score, band: performanceBand(score.overall) };
  }

  async history(employeeId: string) {
    const scores = await this.prisma.performanceScore.findMany({
      where: { employeeId },
      orderBy: { periodStart: 'asc' },
    });
    return scores.map((s) => ({ ...s, band: performanceBand(s.overall) }));
  }

  async colleagues(requesterRole: string) {
    const enabled = await this.org.getColleaguePerformanceEnabled();
    if (!enabled && requesterRole === 'EMPLOYEE') {
      throw new ForbiddenException('Colleague performance visibility is disabled');
    }
    const latest = await this.prisma.performanceScore.findMany({
      distinct: ['employeeId'],
      orderBy: { periodEnd: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true,
            designation: true,
          },
        },
      },
    });
    return latest.map((s) => ({
      employeeId: s.employeeId,
      name: `${s.employee.firstName} ${s.employee.lastName}`,
      department: s.employee.department?.name,
      designation: s.employee.designation?.name,
      overall: s.overall,
      band: performanceBand(s.overall),
    }));
  }

  async recomputeAll() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const employees = await this.prisma.employee.findMany({ select: { id: true } });
    const results: Awaited<ReturnType<PerformanceService['computeForEmployee']>>[] = [];
    for (const e of employees) {
      results.push(await this.computeForEmployee(e.id, start, end));
    }
    return { computed: results.length };
  }
}
