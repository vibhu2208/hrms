import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  @Roles('OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER', 'TEAM_LEADER')
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.tasks.create(user.employeeId, body);
  }

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('status') status?: any,
    @Query('assigneeId') assigneeId?: string,
    @Query('mine') mine?: string,
  ) {
    if (mine === 'true' || !['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'].includes(user.role)) {
      return this.tasks.list({ assigneeId: user.employeeId, status });
    }
    return this.tasks.list({ status, assigneeId });
  }

  @Get('stats')
  @Roles('OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER')
  stats() {
    return this.tasks.completionStats();
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasks.complete(id, user.employeeId);
  }

  @Patch(':taskId/items/:itemId')
  toggleItem(
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @Body() body: { completed: boolean },
  ) {
    return this.tasks.toggleChecklistItem(taskId, itemId, body.completed);
  }
}
