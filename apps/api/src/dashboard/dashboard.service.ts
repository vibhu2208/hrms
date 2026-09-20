import { Injectable } from '@nestjs/common';
import { invoiceAgingBucket } from '@go-staff/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { RecruitmentService } from '../recruitment/recruitment.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private recruitment: RecruitmentService,
  ) {}

  private periodRange(period?: string, from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date();
    if (!from) {
      switch (period) {
        case 'today':
          start.setHours(0, 0, 0, 0);
          break;
        case 'week':
          start.setDate(end.getDate() - 7);
          break;
        case 'quarter':
          start.setMonth(end.getMonth() - 3);
          break;
        case 'year':
          start.setFullYear(end.getFullYear() - 1);
          break;
        case 'month':
        default:
          start.setMonth(end.getMonth() - 1);
          break;
      }
    }
    return { start, end };
  }

  async overview() {
    const [employees, taskStats, recruitment, invoices, leads, orders] =
      await Promise.all([
        this.prisma.employee.count(),
        this.tasks.completionStats(),
        this.recruitment.summary(),
        this.prisma.invoice.count(),
        this.prisma.lead.count(),
        this.prisma.order.count(),
      ]);

    const overdueInvoices = await this.aging().then((a) => a.buckets['61-90'] + a.buckets['90+']);

    return {
      employees,
      taskStats,
      recruitment,
      invoices,
      leads,
      orders,
      overdueInvoices,
    };
  }

  async revenue(period?: string, from?: string, to?: string) {
    const { start, end } = this.periodRange(period, from, to);
    const snaps = await this.prisma.financialSnapshot.findMany({
      where: {
        periodStart: { lte: end },
        periodEnd: { gte: start },
      },
      include: { source: true },
      orderBy: { periodStart: 'asc' },
    });

    const totals = snaps.reduce(
      (acc, s) => {
        acc.revenue += s.revenue;
        acc.grossProfit += s.grossProfit;
        acc.netProfit += s.netProfit;
        acc.expenses += s.expenses;
        return acc;
      },
      { revenue: 0, grossProfit: 0, netProfit: 0, expenses: 0 },
    );
    const margin = totals.revenue ? (totals.netProfit / totals.revenue) * 100 : 0;

    const byVertical: Record<string, number> = {};
    for (const s of snaps) {
      const key = s.vertical || 'General';
      byVertical[key] = (byVertical[key] || 0) + s.revenue;
    }

    const lastSync = snaps.map((s) => s.syncedAt).sort((a, b) => b.getTime() - a.getTime())[0];
    const sources = [...new Set(snaps.map((s) => s.source?.name).filter(Boolean))];

    return {
      period: { start, end },
      ...totals,
      margin: Math.round(margin * 10) / 10,
      byVertical,
      trend: snaps.map((s) => ({
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        revenue: s.revenue,
        netProfit: s.netProfit,
        expenses: s.expenses,
      })),
      meta: { lastSync, sources },
    };
  }

  async accounts() {
    const invoices = await this.prisma.invoice.findMany({ include: { source: true } });
    const totalSales = invoices.reduce((s, i) => s + i.amount, 0);
    const paid = invoices.filter((i) => i.status === 'PAID');
    const pending = invoices.filter((i) => i.status === 'PENDING' || i.status === 'GENERATED');
    const overdue = invoices.filter((i) => i.status === 'OVERDUE');
    const collection = paid.reduce((s, i) => s + i.paidAmount, 0);
    const outstanding = invoices.reduce((s, i) => s + (i.amount - i.paidAmount), 0);

    return {
      totalSales,
      purchases: 0,
      receivables: outstanding,
      payables: 0,
      outstanding,
      collection,
      collectionEfficiency: totalSales ? Math.round((collection / totalSales) * 1000) / 10 : 0,
      counts: {
        total: invoices.length,
        paid: paid.length,
        pending: pending.length,
        overdue: overdue.length,
      },
      aging: await this.aging(),
    };
  }

  async aging() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { not: 'PAID' } },
      include: { source: true },
    });
    const today = new Date();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const items: Record<string, any[]> = {
      '0-30': [],
      '31-60': [],
      '61-90': [],
      '90+': [],
    };

    for (const inv of invoices) {
      const days = Math.ceil((today.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const outstandingDays = Math.max(0, days);
      const { bucket, label } = invoiceAgingBucket(outstandingDays);
      buckets[bucket]++;
      items[bucket].push({
        ...inv,
        daysOutstanding: outstandingDays,
        agingLabel: label,
      });
    }

    return { buckets, items };
  }

  async sales() {
    const leads = await this.prisma.lead.findMany({ include: { source: true } });
    const byStatus = leads.reduce(
      (acc, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const converted = byStatus['CONVERTED'] || 0;
    const conversionRate = leads.length ? Math.round((converted / leads.length) * 1000) / 10 : 0;
    const revenue = leads.reduce((s, l) => s + l.revenue, 0);
    const metrics = await this.prisma.salespersonMetric.findMany({
      orderBy: { weekStart: 'desc' },
      take: 50,
    });

    return {
      counts: byStatus,
      totalLeads: leads.length,
      conversionRate,
      revenue,
      weekly: metrics,
      salesperson: metrics.map((m) => ({
        name: m.salespersonName,
        leadsAssigned: m.leadsAssigned,
        leadsContacted: m.leadsContacted,
        leadsConverted: m.leadsConverted,
        revenueGenerated: m.revenueGenerated,
        target: m.target,
        conversionPct: m.leadsAssigned
          ? Math.round((m.leadsConverted / m.leadsAssigned) * 1000) / 10
          : 0,
        achievementPct: m.target
          ? Math.round((m.revenueGenerated / m.target) * 1000) / 10
          : 0,
      })),
      meta: {
        lastSync: leads.map((l) => l.syncedAt).sort((a, b) => b.getTime() - a.getTime())[0],
      },
    };
  }

  async operations() {
    const orders = await this.prisma.order.findMany({ include: { source: true } });
    const byStatus = orders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const delivered = orders.filter((o) => o.deliveredAt);
    const onTime = delivered.filter((o) => o.isOnTime === true).length;
    const onTimePct = delivered.length
      ? Math.round((onTime / delivered.length) * 1000) / 10
      : 0;

    return {
      counts: byStatus,
      total: orders.length,
      onTimePct,
      delayed: byStatus['DELAYED'] || 0,
      summary: `${onTimePct}% on-time`,
    };
  }
}
