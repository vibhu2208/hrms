import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class MicrosoftSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { authMethod?: string } | undefined;
    if (user?.authMethod === 'microsoft') return true;
    throw new ForbiddenException('Microsoft Planner is available after you sign in with Microsoft.');
  }
}
