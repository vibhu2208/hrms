import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Headers,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
export class IntegrationsController {
  constructor(private integrations: IntegrationsService) {}

  @Get('integrations/sources')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER', 'MANAGEMENT')
  listSources() {
    return this.integrations.listSources();
  }

  @Post('integrations/sources')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER')
  createSource(@Body() body: { name: string; type: any }, @CurrentUser() user: any) {
    return this.integrations.createSource(body, user.id);
  }

  @Post('integrations/sources/:id/rotate-key')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER')
  rotateKey(@Param('id') id: string, @CurrentUser() user: any) {
    return this.integrations.rotateKey(id, user.id);
  }

  @Get('integrations/jobs')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER', 'MANAGEMENT')
  jobs() {
    return this.integrations.listJobs();
  }

  @Get('integrations/templates/:domain')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER', 'MANAGEMENT', 'HR')
  template(@Param('domain') domain: string, @Res() res: Response) {
    const t = this.integrations.csvTemplate(domain);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${t.filename}"`);
    res.send(t.sample);
  }

  @Post('integrations/upload/:domain')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER', 'MANAGEMENT')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('domain') domain: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Body() body: { sourceId?: string },
  ) {
    if (!file) throw new BadRequestException('CSV file required');
    const rows = this.integrations.parseCsv(file.buffer);
    return this.integrations.ingestWithNullableSource(domain, rows, {
      sourceId: body.sourceId,
      method: 'CSV',
      createdById: user.id,
    });
  }

  @Post('integrations/manual/:domain')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER', 'MANAGEMENT')
  manual(
    @Param('domain') domain: string,
    @Body() body: { rows: Record<string, any>[]; sourceId?: string },
    @CurrentUser() user: any,
  ) {
    return this.integrations.ingestWithNullableSource(domain, body.rows || [], {
      sourceId: body.sourceId,
      method: 'MANUAL',
      createdById: user.id,
    });
  }

  /** External apps push data here with X-API-Key */
  @Post('ingest/:domain')
  async ingestApi(
    @Param('domain') domain: string,
    @Headers('x-api-key') apiKey: string,
    @Body() body: { rows?: Record<string, any>[]; data?: Record<string, any> },
  ) {
    const source = await this.integrations.authenticateApiKey(apiKey);
    const rows = body.rows || (body.data ? [body.data] : []);
    if (!rows.length) throw new BadRequestException('Provide rows[] or data');
    return this.integrations.ingestRows(domain, rows, {
      sourceId: source.id,
      method: 'API',
    });
  }

  @Post('webhooks/:domain')
  webhook(
    @Param('domain') domain: string,
    @Headers('x-api-key') apiKey: string,
    @Body() body: any,
  ) {
    return this.integrations.handleWebhook(domain, body, apiKey);
  }

  @Get('integrations/webhooks')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER')
  listWebhooks() {
    return this.integrations.listWebhooks();
  }

  @Post('integrations/webhooks')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Roles('OWNER')
  createWebhook(@Body() body: { sourceId?: string; url: string; domain: string }) {
    return this.integrations.createWebhook(body);
  }
}
