import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Roles('OWNER', 'MANAGEMENT', 'HR')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get(':type')
  async get(
    @Param('type') type: string,
    @Query('format') format: string,
    @Query('period') period: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.generate(type, { period, from, to });
    if (format === 'csv') {
      const rows = Array.isArray((result as any).rows)
        ? (result as any).rows
        : [(result as any).data || result];
      const csv = this.reports.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
      return csv;
    }
    return result;
  }
}
