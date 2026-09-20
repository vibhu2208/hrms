import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(assignorId: string, data: {
    title: string;
    description?: string;
    assigneeId: string;
    dueDate?: string;
    isChecklist?: boolean;
    checklistItems?: string[];
  }) {
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        assignorId,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        isChecklist: data.isChecklist ?? false,
        checklistItems: data.checklistItems?.length
          ? {
              create: data.checklistItems.map((title, order) => ({ title, order })),
            }
          : undefined,
      },
      include: {
        assignee: { include: { user: true } },
        assignor: true,
        checklistItems: true,
      },
    });

    await this.notifications.create({
      userId: task.assignee.userId,
      title: 'New task assigned',
      body: data.title,
      type: 'TASK_ASSIGNED',
      link: '/employee/tasks',
    });

    return task;
  }

  async list(filters?: {
    status?: TaskStatus;
    assigneeId?: string;
    employeeId?: string;
  }) {
    await this.markOverdue();
    return this.prisma.task.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.assigneeId || filters?.employeeId
          ? { assigneeId: filters.assigneeId || filters.employeeId }
          : {}),
      },
      include: {
        assignee: { include: { department: true } },
        assignor: true,
        checklistItems: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async completionStats() {
    await this.markOverdue();
    const tasks = await this.prisma.task.findMany();
    const total = tasks.length || 1;
    const completed = tasks.filter((t) =>
      ['COMPLETED', 'COMPLETED_ON_TIME', 'COMPLETED_LATE'].includes(t.status),
    ).length;
    const overdue = tasks.filter((t) => t.status === 'OVERDUE').length;
    const pending = tasks.filter((t) => t.status === 'PENDING').length;
    return {
      total: tasks.length,
      completed,
      overdue,
      pending,
      completionPct: Math.round((completed / total) * 100),
    };
  }

  async complete(id: string, employeeId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException();
    const now = new Date();
    const onTime = !task.dueDate || now <= task.dueDate;
    return this.prisma.task.update({
      where: { id },
      data: {
        status: onTime ? TaskStatus.COMPLETED_ON_TIME : TaskStatus.COMPLETED_LATE,
        completedAt: now,
      },
      include: { checklistItems: true, assignee: true, assignor: true },
    });
  }

  async toggleChecklistItem(taskId: string, itemId: string, completed: boolean) {
    return this.prisma.checklistItem.update({
      where: { id: itemId },
      data: { completed },
    });
  }

  private async markOverdue() {
    const now = new Date();
    await this.prisma.task.updateMany({
      where: {
        status: TaskStatus.PENDING,
        dueDate: { lt: now },
      },
      data: { status: TaskStatus.OVERDUE },
    });
  }
}
