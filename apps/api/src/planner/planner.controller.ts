import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreatePlannerBucketDto, CreatePlannerPlanDto, CreatePlannerTaskDto, RenamePlannerBucketDto, UpdatePlannerTaskDto } from './dto/planner.dto';
import { PlannerService } from './planner.service';

@Controller('planner')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlannerController {
  constructor(private planner: PlannerService) {}

  @Get('board')
  board(@CurrentUser() user: { id: string }, @Query('planId') planId?: string) {
    return this.planner.board(user.id, planId || undefined);
  }

  @Get('plans')
  plans(@CurrentUser() user: { id: string }) {
    return this.planner.plans(user.id);
  }

  @Post('plans')
  createPlan(@CurrentUser() user: { id: string }, @Body() dto: CreatePlannerPlanDto) {
    return this.planner.createPlan(user.id, dto.title);
  }

  @Post('buckets')
  createBucket(@CurrentUser() user: { id: string }, @Body() dto: CreatePlannerBucketDto) {
    return this.planner.createBucket(user.id, dto.planId, dto.name);
  }

  @Patch('buckets/:id')
  renameBucket(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: RenamePlannerBucketDto) {
    return this.planner.renameBucket(user.id, id, dto.name);
  }

  @Post('tasks')
  createTask(@CurrentUser() user: { id: string }, @Body() dto: CreatePlannerTaskDto) {
    return this.planner.createTask(user.id, dto);
  }

  @Get('tasks')
  tasks(@CurrentUser() user: { id: string }, @Query('refresh') refresh?: string) {
    return this.planner.tasks(user.id, refresh === '1');
  }

  @Get('tasks/:id')
  task(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.planner.task(user.id, id);
  }

  @Patch('tasks/:id')
  updateTask(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdatePlannerTaskDto) {
    return this.planner.updateTask(user.id, id, dto);
  }

  @Delete('tasks/:id')
  deleteTask(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.planner.deleteTask(user.id, id);
  }
}
