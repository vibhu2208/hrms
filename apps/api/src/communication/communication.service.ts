import { Injectable, NotFoundException } from '@nestjs/common';
import { SuggestionStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommunicationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  announcements() {
    return this.prisma.announcement.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  createAnnouncement(data: {
    title: string;
    body: string;
    pinned?: boolean;
    expiresAt?: string;
    attachmentUrl?: string;
    createdBy?: string;
  }) {
    return this.prisma.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        pinned: data.pinned ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        attachmentUrl: data.attachmentUrl,
        createdBy: data.createdBy,
      },
    });
  }

  updateAnnouncement(id: string, data: Partial<{
    title: string;
    body: string;
    pinned: boolean;
    expiresAt: string | null;
    attachmentUrl: string;
  }>) {
    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...data,
        expiresAt:
          data.expiresAt === null
            ? null
            : data.expiresAt
              ? new Date(data.expiresAt)
              : undefined,
      },
    });
  }

  deleteAnnouncement(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }

  async createTicket(requesterId: string, data: {
    subject: string;
    description: string;
    category: string;
    priority?: string;
    attachmentUrl?: string;
  }) {
    const ticket = await this.prisma.ticket.create({
      data: {
        requesterId,
        subject: data.subject,
        description: data.description,
        category: data.category as any,
        priority: data.priority || 'MEDIUM',
        attachmentUrl: data.attachmentUrl,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: { code: { in: ['OWNER', 'HR'] } } },
    });
    for (const a of admins) {
      await this.notifications.create({
        userId: a.id,
        title: 'New support ticket',
        body: data.subject,
        type: 'TICKET',
        link: '/admin/tickets',
      });
    }
    return ticket;
  }

  myTickets(requesterId: string) {
    return this.prisma.ticket.findMany({
      where: { requesterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  allTickets(status?: TicketStatus) {
    return this.prisma.ticket.findMany({
      where: status ? { status } : undefined,
      include: {
        requester: true,
        assignee: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTicket(
    id: string,
    data: { status?: TicketStatus; assigneeId?: string; priority?: string },
  ) {
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data,
      include: { requester: { include: { user: true } } },
    });
    await this.notifications.create({
      userId: ticket.requester.userId,
      title: 'Ticket updated',
      body: `${ticket.subject} → ${ticket.status}`,
      type: 'TICKET_UPDATE',
      link: '/employee/tickets',
    });
    return ticket;
  }

  async createSuggestion(
    authorId: string | null,
    data: {
      subject: string;
      category: string;
      description: string;
      attachmentUrl?: string;
      isAnonymous?: boolean;
    },
  ) {
    const suggestion = await this.prisma.suggestion.create({
      data: {
        subject: data.subject,
        category: data.category,
        description: data.description,
        attachmentUrl: data.attachmentUrl,
        isAnonymous: data.isAnonymous ?? false,
        authorId: data.isAnonymous ? null : authorId || undefined,
      },
    });

    const owners = await this.prisma.user.findMany({
      where: { role: { code: { in: ['OWNER', 'HR'] } } },
    });
    for (const o of owners) {
      await this.notifications.create({
        userId: o.id,
        title: 'New suggestion',
        body: data.subject,
        type: 'SUGGESTION',
        link: '/admin/suggestions',
      });
    }
    return suggestion;
  }

  suggestions() {
    return this.prisma.suggestion.findMany({
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateSuggestion(id: string, status: SuggestionStatus) {
    return this.prisma.suggestion.update({ where: { id }, data: { status } });
  }
}
