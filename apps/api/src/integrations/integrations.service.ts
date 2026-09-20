import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import {
  ExternalSourceType,
  IngestJobStatus,
  InvoiceStatus,
  LeadStatus,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private hashKey(key: string) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async createSource(data: { name: string; type: ExternalSourceType }, actorId?: string) {
    const rawKey = `gs_${crypto.randomBytes(24).toString('hex')}`;
    const source = await this.prisma.externalSource.create({
      data: {
        name: data.name,
        type: data.type,
        apiKeyHash: this.hashKey(rawKey),
        apiKeyPrefix: rawKey.slice(0, 10),
      },
    });
    await this.audit.log({
      actorId,
      action: 'CREATE_SOURCE',
      resource: 'INTEGRATION',
      resourceId: source.id,
    });
    return { ...source, apiKey: rawKey };
  }

  listSources() {
    return this.prisma.externalSource.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async rotateKey(id: string, actorId?: string) {
    const rawKey = `gs_${crypto.randomBytes(24).toString('hex')}`;
    const source = await this.prisma.externalSource.update({
      where: { id },
      data: {
        apiKeyHash: this.hashKey(rawKey),
        apiKeyPrefix: rawKey.slice(0, 10),
      },
    });
    await this.audit.log({
      actorId,
      action: 'ROTATE_API_KEY',
      resource: 'INTEGRATION',
      resourceId: id,
    });
    return { ...source, apiKey: rawKey };
  }

  async authenticateApiKey(apiKey: string) {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const hash = this.hashKey(apiKey);
    const source = await this.prisma.externalSource.findFirst({
      where: { apiKeyHash: hash, isActive: true },
    });
    if (!source) throw new UnauthorizedException('Invalid API key');
    return source;
  }

  listJobs() {
    return this.prisma.ingestJob.findMany({
      include: { source: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  csvTemplate(domain: string): { filename: string; headers: string[]; sample: string } {
    const templates: Record<string, { headers: string[]; sample: string }> = {
      invoices: {
        headers: [
          'external_id',
          'invoice_number',
          'customer_name',
          'amount',
          'paid_amount',
          'status',
          'issue_date',
          'due_date',
          'paid_date',
        ],
        sample:
          'inv-001,INV-2026-001,Acme Corp,50000,0,PENDING,2026-08-01,2026-09-01,\n',
      },
      leads: {
        headers: [
          'external_id',
          'name',
          'email',
          'phone',
          'status',
          'lead_source',
          'revenue',
        ],
        sample: 'lead-001,Jane Doe,jane@ex.com,9999999999,NEW,Website,0\n',
      },
      financial: {
        headers: [
          'external_id',
          'period_start',
          'period_end',
          'vertical',
          'revenue',
          'gross_profit',
          'net_profit',
          'expenses',
          'margin',
        ],
        sample: 'fin-2026-08,2026-08-01,2026-08-31,Retail,1200000,400000,250000,950000,20.8\n',
      },
      orders: {
        headers: [
          'external_id',
          'order_number',
          'customer_name',
          'status',
          'order_date',
          'promised_date',
          'dispatched_at',
          'delivered_at',
        ],
        sample: 'ord-001,ORD-1001,Beta Ltd,DELIVERED,2026-09-01,2026-09-05,2026-09-03,2026-09-04\n',
      },
      'salesperson-metrics': {
        headers: [
          'external_id',
          'salesperson_name',
          'week_start',
          'leads_assigned',
          'leads_contacted',
          'leads_converted',
          'revenue_generated',
          'target',
        ],
        sample: 'spm-001,Rahul Sharma,2026-09-08,20,15,5,250000,300000\n',
      },
    };
    const t = templates[domain];
    if (!t) throw new BadRequestException(`Unknown domain: ${domain}`);
    return {
      filename: `go-staff-${domain}-template.csv`,
      headers: t.headers,
      sample: `${t.headers.join(',')}\n${t.sample}`,
    };
  }

  async ingestRows(
    domain: string,
    rows: Record<string, any>[],
    opts: {
      sourceId?: string;
      method: 'API' | 'CSV' | 'MANUAL' | 'WEBHOOK';
      createdById?: string;
    },
  ) {
    const job = await this.prisma.ingestJob.create({
      data: {
        sourceId: opts.sourceId,
        domain,
        method: opts.method,
        status: IngestJobStatus.PROCESSING,
        totalRows: rows.length,
        createdById: opts.createdById,
      },
    });

    const errors: { row: number; error: string }[] = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      try {
        await this.upsertRow(domain, rows[i], opts.sourceId);
        success++;
      } catch (e: any) {
        errors.push({ row: i + 1, error: e.message || 'Unknown error' });
      }
    }

    const status =
      errors.length === 0
        ? IngestJobStatus.COMPLETED
        : success === 0
          ? IngestJobStatus.FAILED
          : IngestJobStatus.PARTIAL;

    if (opts.sourceId) {
      await this.prisma.externalSource.update({
        where: { id: opts.sourceId },
        data: { lastSyncAt: new Date() },
      });
    }

    return this.prisma.ingestJob.update({
      where: { id: job.id },
      data: {
        status,
        successRows: success,
        failedRows: errors.length,
        errors: errors.length ? errors : undefined,
        completedAt: new Date(),
      },
    });
  }

  private norm(row: Record<string, any>, key: string) {
    const found = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/-/g, '_') === key.toLowerCase().replace(/-/g, '_'),
    );
    return found ? row[found] : undefined;
  }

  private async upsertByExternal(
    model: 'invoice' | 'lead' | 'financialSnapshot' | 'order' | 'salespersonMetric',
    sourceId: string | undefined,
    externalId: string,
    data: Record<string, any>,
  ) {
    const existing = await (this.prisma as any)[model].findFirst({
      where: { externalId, sourceId: sourceId ?? null },
    });
    if (existing) {
      return (this.prisma as any)[model].update({
        where: { id: existing.id },
        data: { ...data, syncedAt: new Date() },
      });
    }
    return (this.prisma as any)[model].create({
      data: { ...data, externalId, sourceId, syncedAt: new Date() },
    });
  }

  private async upsertRow(domain: string, row: Record<string, any>, sourceId?: string) {
    const externalId = String(this.norm(row, 'external_id') || '');
    if (!externalId) throw new Error('external_id required');

    switch (domain) {
      case 'invoices': {
        await this.upsertByExternal('invoice', sourceId, externalId, {
          invoiceNumber: String(this.norm(row, 'invoice_number') || externalId),
          customerName: this.norm(row, 'customer_name') || null,
          amount: Number(this.norm(row, 'amount') || 0),
          paidAmount: Number(this.norm(row, 'paid_amount') || 0),
          status: String(this.norm(row, 'status') || 'PENDING').toUpperCase() as InvoiceStatus,
          issueDate: new Date(this.norm(row, 'issue_date') || Date.now()),
          dueDate: new Date(this.norm(row, 'due_date') || Date.now()),
          paidDate: this.norm(row, 'paid_date')
            ? new Date(this.norm(row, 'paid_date'))
            : null,
        });
        break;
      }
      case 'leads': {
        await this.upsertByExternal('lead', sourceId, externalId, {
          name: this.norm(row, 'name'),
          email: this.norm(row, 'email'),
          phone: this.norm(row, 'phone'),
          status: String(this.norm(row, 'status') || 'NEW').toUpperCase() as LeadStatus,
          leadSource: this.norm(row, 'lead_source'),
          revenue: Number(this.norm(row, 'revenue') || 0),
        });
        break;
      }
      case 'financial': {
        const revenue = Number(this.norm(row, 'revenue') || 0);
        const expenses = Number(this.norm(row, 'expenses') || 0);
        const netProfit = Number(this.norm(row, 'net_profit') || revenue - expenses);
        const grossProfit = Number(this.norm(row, 'gross_profit') || netProfit);
        const margin = Number(
          this.norm(row, 'margin') || (revenue ? (netProfit / revenue) * 100 : 0),
        );
        await this.upsertByExternal('financialSnapshot', sourceId, externalId, {
          periodStart: new Date(this.norm(row, 'period_start') || Date.now()),
          periodEnd: new Date(this.norm(row, 'period_end') || Date.now()),
          vertical: this.norm(row, 'vertical'),
          revenue,
          grossProfit,
          netProfit,
          expenses,
          margin,
        });
        break;
      }
      case 'orders': {
        const deliveredAt = this.norm(row, 'delivered_at')
          ? new Date(this.norm(row, 'delivered_at'))
          : null;
        const promisedDate = this.norm(row, 'promised_date')
          ? new Date(this.norm(row, 'promised_date'))
          : null;
        await this.upsertByExternal('order', sourceId, externalId, {
          orderNumber: String(this.norm(row, 'order_number') || externalId),
          customerName: this.norm(row, 'customer_name'),
          status: String(this.norm(row, 'status') || 'NEW').toUpperCase() as OrderStatus,
          orderDate: new Date(this.norm(row, 'order_date') || Date.now()),
          promisedDate,
          dispatchedAt: this.norm(row, 'dispatched_at')
            ? new Date(this.norm(row, 'dispatched_at'))
            : null,
          deliveredAt,
          isOnTime:
            deliveredAt && promisedDate ? deliveredAt <= promisedDate : undefined,
        });
        break;
      }
      case 'salesperson-metrics': {
        await this.upsertByExternal('salespersonMetric', sourceId, externalId, {
          salespersonName: String(this.norm(row, 'salesperson_name') || 'Unknown'),
          weekStart: new Date(this.norm(row, 'week_start') || Date.now()),
          leadsAssigned: Number(this.norm(row, 'leads_assigned') || 0),
          leadsContacted: Number(this.norm(row, 'leads_contacted') || 0),
          leadsConverted: Number(this.norm(row, 'leads_converted') || 0),
          revenueGenerated: Number(this.norm(row, 'revenue_generated') || 0),
          target: Number(this.norm(row, 'target') || 0),
        });
        break;
      }
      default:
        throw new BadRequestException(`Unsupported domain: ${domain}`);
    }
  }

  parseCsv(buffer: Buffer): Record<string, any>[] {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  async createWebhook(data: { sourceId?: string; url: string; domain: string }) {
    const secret = crypto.randomBytes(16).toString('hex');
    return this.prisma.webhookEndpoint.create({
      data: {
        sourceId: data.sourceId,
        url: data.url,
        domain: data.domain,
        secret,
      },
    });
  }

  listWebhooks() {
    return this.prisma.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async handleWebhook(
    domain: string,
    payload: { rows?: Record<string, any>[]; data?: Record<string, any> },
    apiKey: string,
  ) {
    const source = await this.authenticateApiKey(apiKey);
    const rows = payload.rows || (payload.data ? [payload.data] : []);
    if (!rows.length) throw new BadRequestException('No rows in payload');
    return this.ingestRows(domain, rows, {
      sourceId: source.id,
      method: 'WEBHOOK',
    });
  }

  // Fix upsert for null sourceId - use findFirst + create/update pattern for manual uploads
  async ingestWithNullableSource(
    domain: string,
    rows: Record<string, any>[],
    opts: {
      sourceId?: string;
      method: 'API' | 'CSV' | 'MANUAL' | 'WEBHOOK';
      createdById?: string;
    },
  ) {
    // Use a dedicated "manual" source if none provided
    let sourceId = opts.sourceId;
    if (!sourceId) {
      let manual = await this.prisma.externalSource.findFirst({
        where: { name: 'Manual / CSV Upload' },
      });
      if (!manual) {
        const created = await this.createSource({
          name: 'Manual / CSV Upload',
          type: ExternalSourceType.ACCOUNTS,
        });
        sourceId = created.id;
      } else {
        sourceId = manual.id;
      }
    }
    return this.ingestRows(domain, rows, { ...opts, sourceId });
  }
}
