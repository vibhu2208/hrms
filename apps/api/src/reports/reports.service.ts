import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(
    private dashboard: DashboardService,
    private prisma: PrismaService,
  ) {}

  async generate(type: string, filters?: Record<string, string>) {
    switch (type) {
      case 'hr-attendance':
        return {
          type,
          generatedAt: new Date(),
          rows: await this.prisma.attendance.findMany({
            include: { employee: { include: { department: true } } },
            take: 500,
            orderBy: { date: 'desc' },
          }),
        };
      case 'hr-leave':
        return {
          type,
          generatedAt: new Date(),
          rows: await this.prisma.leaveRequest.findMany({
            include: { employee: true, leaveType: true },
            take: 500,
            orderBy: { createdAt: 'desc' },
          }),
        };
      case 'hr-performance':
        return {
          type,
          generatedAt: new Date(),
          rows: await this.prisma.performanceScore.findMany({
            include: { employee: { include: { department: true } } },
            take: 500,
            orderBy: { periodEnd: 'desc' },
          }),
        };
      case 'hr-recruitment':
        return {
          type,
          generatedAt: new Date(),
          rows: await this.prisma.jobPosition.findMany({ include: { department: true } }),
        };
      case 'sales':
        return { type, generatedAt: new Date(), data: await this.dashboard.sales() };
      case 'accounts':
        return { type, generatedAt: new Date(), data: await this.dashboard.accounts() };
      case 'operations':
        return { type, generatedAt: new Date(), data: await this.dashboard.operations() };
      case 'revenue':
        return {
          type,
          generatedAt: new Date(),
          data: await this.dashboard.revenue(filters?.period, filters?.from, filters?.to),
        };
      default:
        return { type, generatedAt: new Date(), error: 'Unknown report type' };
    }
  }

  toCsv(rows: Record<string, any>[]): string {
    if (!rows.length) return '';
    const flat = rows.map((r) => this.flatten(r));
    const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
    const lines = [
      headers.join(','),
      ...flat.map((r) =>
        headers.map((h) => JSON.stringify(r[h] ?? '')).join(','),
      ),
    ];
    return lines.join('\n');
  }

  private flatten(obj: any, prefix = ''): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
        Object.assign(out, this.flatten(v, key));
      } else if (!Array.isArray(v)) {
        out[key] = v instanceof Date ? v.toISOString() : v;
      }
    }
    return out;
  }
}
