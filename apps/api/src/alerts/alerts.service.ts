import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { invoiceAgingBucket } from '@go-staff/shared';

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  listRules() {
    return this.prisma.alertRule.findMany({ orderBy: { name: 'asc' } });
  }

  upsertRule(data: { id?: string; name: string; type: string; threshold?: number; isActive?: boolean }) {
    if (data.id) {
      return this.prisma.alertRule.update({
        where: { id: data.id },
        data: {
          name: data.name,
          type: data.type,
          threshold: data.threshold,
          isActive: data.isActive ?? true,
        },
      });
    }
    return this.prisma.alertRule.create({
      data: {
        name: data.name,
        type: data.type,
        threshold: data.threshold,
        isActive: data.isActive ?? true,
      },
    });
  }

  /** Phase 4: run alert checks and notify owners */
  async runChecks() {
    const owners = await this.prisma.user.findMany({
      where: { role: { code: 'OWNER' } },
    });
    const fired: string[] = [];

    // Invoice 60+ days
    const invoices = await this.prisma.invoice.findMany({ where: { status: { not: 'PAID' } } });
    const today = new Date();
    const critical = invoices.filter((inv) => {
      const days = Math.ceil((today.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return invoiceAgingBucket(Math.max(0, days)).bucket === '61-90' ||
        invoiceAgingBucket(Math.max(0, days)).bucket === '90+';
    });
    if (critical.length) {
      for (const o of owners) {
        await this.notifications.create({
          userId: o.id,
          title: 'Invoices overdue 60+ days',
          body: `${critical.length} invoice(s) need attention`,
          type: 'INVOICE_OVERDUE',
          link: '/admin/accounts',
        });
      }
      fired.push('INVOICE_60_PLUS');
    }

    // Recruitment delayed
    const positions = await this.prisma.jobPosition.findMany({
      where: { status: { in: ['OPEN', 'INTERVIEWING', 'DELAYED'] } },
    });
    const delayed = positions.filter((p) => p.targetHireDate < today && !p.actualHireDate);
    if (delayed.length) {
      for (const o of owners) {
        await this.notifications.create({
          userId: o.id,
          title: 'Recruitment deadline missed',
          body: `${delayed.length} open position(s) past target hire date`,
          type: 'RECRUITMENT_DELAY',
          link: '/admin/recruitment',
        });
      }
      fired.push('RECRUITMENT_DELAY');
    }

    // Delayed orders
    const delayedOrders = await this.prisma.order.count({ where: { status: 'DELAYED' } });
    if (delayedOrders) {
      for (const o of owners) {
        await this.notifications.create({
          userId: o.id,
          title: 'Orders delayed',
          body: `${delayedOrders} order(s) marked delayed`,
          type: 'ORDER_DELAYED',
          link: '/admin/operations',
        });
      }
      fired.push('ORDER_DELAYED');
    }

    // Sales target miss (latest metrics)
    const metrics = await this.prisma.salespersonMetric.findMany({
      orderBy: { weekStart: 'desc' },
      take: 20,
    });
    const missed = metrics.filter((m) => m.target > 0 && m.revenueGenerated < m.target);
    if (missed.length) {
      for (const o of owners) {
        await this.notifications.create({
          userId: o.id,
          title: 'Sales target missed',
          body: `${missed.length} salesperson metric(s) below target`,
          type: 'SALES_TARGET_MISS',
          link: '/admin/sales',
        });
      }
      fired.push('SALES_TARGET_MISS');
    }

    await this.prisma.alertRule.updateMany({
      where: { type: { in: fired } },
      data: { lastFiredAt: new Date() },
    });

    return { fired, at: new Date() };
  }
}
