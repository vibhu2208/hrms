import { Controller, Get } from '@nestjs/common';
import { getTenantContext } from './tenant.context';

@Controller('tenant')
export class TenantController {
  @Get('current')
  current() {
    const tenant = getTenantContext()?.tenant;
    return {
      name: tenant?.name || '',
      slug: tenant?.slug || '',
    };
  }
}
