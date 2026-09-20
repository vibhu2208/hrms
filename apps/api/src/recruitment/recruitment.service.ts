import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  EmploymentType,
  RecruitmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'job'}-${suffix}`;
}

@Injectable()
export class RecruitmentService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  private withFlags<
    T extends {
      targetHireDate: Date;
      actualHireDate: Date | null;
      status: RecruitmentStatus;
      openingDate: Date;
      applicantsCount: number;
    },
  >(positions: T[]) {
    const today = new Date();
    return positions.map((p) => {
      let timeliness: 'ON_TRACK' | 'DELAYED' | 'FILLED' = 'ON_TRACK';
      if (p.status === 'FILLED') timeliness = 'FILLED';
      else if (p.targetHireDate < today && !p.actualHireDate) timeliness = 'DELAYED';
      const daysOpen = Math.ceil(
        ((p.actualHireDate || today).getTime() - p.openingDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return { ...p, timeliness, daysOpen };
    });
  }

  async list() {
    const positions = await this.prisma.jobPosition.findMany({
      include: {
        department: true,
        _count: { select: { applications: true } },
      },
      orderBy: { openingDate: 'desc' },
    });
    return this.withFlags(positions);
  }

  async getById(id: string) {
    const position = await this.prisma.jobPosition.findUnique({
      where: { id },
      include: {
        department: true,
        _count: { select: { applications: true } },
      },
    });
    if (!position) throw new NotFoundException('Position not found');
    return this.withFlags([position])[0];
  }

  create(data: {
    title: string;
    departmentId?: string;
    openingDate: string;
    targetHireDate: string;
    applicantsCount?: number;
    description?: string;
    location?: string;
    employmentType?: EmploymentType;
    salaryRange?: string;
    requirements?: string;
    isPublic?: boolean;
    status?: RecruitmentStatus;
  }) {
    const isPublic = data.isPublic !== false;
    return this.prisma.jobPosition.create({
      data: {
        title: data.title,
        slug: slugify(data.title),
        description: data.description,
        location: data.location,
        employmentType: data.employmentType || 'FULL_TIME',
        salaryRange: data.salaryRange,
        requirements: data.requirements,
        isPublic,
        publishedAt: isPublic ? new Date() : null,
        departmentId: data.departmentId || undefined,
        openingDate: new Date(data.openingDate),
        targetHireDate: new Date(data.targetHireDate),
        applicantsCount: data.applicantsCount ?? 0,
        status: data.status || 'OPEN',
      },
      include: { department: true },
    });
  }

  update(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      location: string;
      employmentType: EmploymentType;
      salaryRange: string;
      requirements: string;
      isPublic: boolean;
      status: RecruitmentStatus;
      actualHireDate: string;
      targetHireDate: string;
      applicantsCount: number;
      interviewsScheduled: number;
      interviewsCompleted: number;
      selectedCount: number;
      rejectedCount: number;
      departmentId: string;
    }>,
  ) {
    const patch: any = { ...data };
    if (data.actualHireDate !== undefined) {
      patch.actualHireDate = data.actualHireDate
        ? new Date(data.actualHireDate)
        : null;
    }
    if (data.targetHireDate) {
      patch.targetHireDate = new Date(data.targetHireDate);
    }
    if (data.isPublic === true) {
      patch.publishedAt = new Date();
    }
    if (data.isPublic === false) {
      patch.publishedAt = null;
    }
    return this.prisma.jobPosition.update({
      where: { id },
      data: patch,
      include: { department: true },
    });
  }

  async summary() {
    const list = await this.list();
    const pendingApps = await this.prisma.jobApplication.count({
      where: { status: { in: ['APPLIED', 'SCREENING'] } },
    });
    return {
      open: list.filter((p) => p.status === 'OPEN' || p.status === 'INTERVIEWING')
        .length,
      filled: list.filter((p) => p.status === 'FILLED').length,
      delayed: list.filter((p) => p.timeliness === 'DELAYED').length,
      totalApplicants: list.reduce(
        (s, p) => s + (p._count?.applications ?? p.applicantsCount),
        0,
      ),
      pendingApplications: pendingApps,
    };
  }

  /** Public careers board — only open/interviewing + isPublic */
  listPublicJobs() {
    return this.prisma.jobPosition.findMany({
      where: {
        isPublic: true,
        status: { in: ['OPEN', 'INTERVIEWING'] },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        location: true,
        employmentType: true,
        salaryRange: true,
        openingDate: true,
        publishedAt: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getPublicJob(idOrSlug: string) {
    const job = await this.prisma.jobPosition.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isPublic: true,
        status: { in: ['OPEN', 'INTERVIEWING'] },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        requirements: true,
        location: true,
        employmentType: true,
        salaryRange: true,
        openingDate: true,
        publishedAt: true,
        department: { select: { id: true, name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found or no longer open');
    return job;
  }

  async apply(
    idOrSlug: string,
    data: {
      fullName: string;
      email: string;
      phone?: string;
      resumeUrl?: string;
      coverLetter?: string;
      linkedInUrl?: string;
      experienceYears?: number;
      currentCompany?: string;
    },
  ) {
    if (!data.fullName?.trim() || !data.email?.trim()) {
      throw new BadRequestException('Full name and email are required');
    }

    const job = await this.prisma.jobPosition.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isPublic: true,
        status: { in: ['OPEN', 'INTERVIEWING'] },
      },
    });
    if (!job) throw new NotFoundException('Job not found or no longer accepting applications');

    const existing = await this.prisma.jobApplication.findFirst({
      where: {
        positionId: job.id,
        email: data.email.trim().toLowerCase(),
      },
    });
    if (existing) {
      throw new BadRequestException('You have already applied for this position');
    }

    const application = await this.prisma.jobApplication.create({
      data: {
        positionId: job.id,
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim(),
        resumeUrl: data.resumeUrl?.trim(),
        coverLetter: data.coverLetter?.trim(),
        linkedInUrl: data.linkedInUrl?.trim(),
        experienceYears: data.experienceYears,
        currentCompany: data.currentCompany?.trim(),
      },
      include: { position: { select: { title: true } } },
    });

    await this.prisma.jobPosition.update({
      where: { id: job.id },
      data: { applicantsCount: { increment: 1 } },
    });

    // Confirmation to candidate (best-effort)
    await this.email.send({
      to: application.email,
      subject: `Application received — ${job.title}`,
      text: `Hi ${application.fullName},\n\nThank you for applying for ${job.title}. Our HR team will review your application and get back to you.\n\n— Go Staff Careers`,
    });

    return {
      id: application.id,
      message: 'Application submitted successfully',
      positionTitle: job.title,
    };
  }

  listApplications(filters?: { positionId?: string; status?: ApplicationStatus }) {
    return this.prisma.jobApplication.findMany({
      where: {
        positionId: filters?.positionId,
        status: filters?.status,
      },
      include: {
        position: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApplication(id: string) {
    const app = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: {
        position: {
          include: { department: true },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async updateApplication(
    id: string,
    data: Partial<{
      status: ApplicationStatus;
      hrNotes: string;
      interviewAt: string;
      interviewLocation: string;
    }>,
  ) {
    const current = await this.getApplication(id);
    const patch: any = {
      hrNotes: data.hrNotes,
      interviewLocation: data.interviewLocation,
    };
    if (data.interviewAt !== undefined) {
      patch.interviewAt = data.interviewAt ? new Date(data.interviewAt) : null;
    }
    if (data.status) {
      patch.status = data.status;
    }

    const updated = await this.prisma.jobApplication.update({
      where: { id },
      data: patch,
      include: {
        position: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    // Keep aggregate counters roughly in sync on status transitions
    if (data.status && data.status !== current.status) {
      const counters: Record<string, any> = {};
      if (data.status === 'INTERVIEW' && current.status !== 'INTERVIEW') {
        counters.interviewsScheduled = { increment: 1 };
        counters.status = 'INTERVIEWING';
      }
      if (data.status === 'HIRED') {
        counters.selectedCount = { increment: 1 };
        counters.status = 'FILLED';
        counters.actualHireDate = new Date();
      }
      if (data.status === 'REJECTED' && current.status !== 'REJECTED') {
        counters.rejectedCount = { increment: 1 };
      }
      if (Object.keys(counters).length) {
        await this.prisma.jobPosition.update({
          where: { id: current.positionId },
          data: counters,
        });
      }
    }

    return updated;
  }

  async sendCandidateEmail(
    id: string,
    body: {
      type?: 'INTERVIEW' | 'REJECTION' | 'OFFER' | 'CUSTOM';
      subject?: string;
      message?: string;
      interviewAt?: string;
      interviewLocation?: string;
    },
  ) {
    const app = await this.getApplication(id);
    const type = body.type || 'CUSTOM';
    const interviewAt = body.interviewAt
      ? new Date(body.interviewAt)
      : app.interviewAt;
    const interviewLocation =
      body.interviewLocation || app.interviewLocation || 'To be confirmed';

    let subject = body.subject;
    let text = body.message;

    if (type === 'INTERVIEW') {
      if (!interviewAt) {
        throw new BadRequestException('Interview date/time is required');
      }
      subject =
        subject ||
        `Interview invitation — ${app.position.title}`;
      text =
        text ||
        `Hi ${app.fullName},\n\nThank you for applying for ${app.position.title}. We would like to invite you for an interview.\n\nWhen: ${interviewAt.toLocaleString()}\nWhere: ${interviewLocation}\n\nPlease reply to confirm your availability.\n\nBest regards,\nHR Team — Go Staff`;
    } else if (type === 'REJECTION') {
      subject = subject || `Update on your application — ${app.position.title}`;
      text =
        text ||
        `Hi ${app.fullName},\n\nThank you for your interest in ${app.position.title}. After careful review, we have decided to move forward with other candidates at this time.\n\nWe appreciate the time you invested and wish you the best.\n\nBest regards,\nHR Team — Go Staff`;
    } else if (type === 'OFFER') {
      subject = subject || `Offer — ${app.position.title}`;
      text =
        text ||
        `Hi ${app.fullName},\n\nWe are pleased to offer you the position of ${app.position.title}. Our HR team will follow up with next steps and documentation shortly.\n\nCongratulations!\n\nBest regards,\nHR Team — Go Staff`;
    }

    if (!subject?.trim() || !text?.trim()) {
      throw new BadRequestException('Subject and message are required');
    }

    const result = await this.email.send({
      to: app.email,
      subject,
      text,
    });

    const statusPatch: Partial<{
      status: ApplicationStatus;
      interviewAt: Date;
      interviewLocation: string;
    }> = {};
    if (type === 'INTERVIEW') {
      statusPatch.status = 'INTERVIEW';
      statusPatch.interviewAt = interviewAt || undefined;
      statusPatch.interviewLocation = interviewLocation;
    } else if (type === 'REJECTION') {
      statusPatch.status = 'REJECTED';
    } else if (type === 'OFFER') {
      statusPatch.status = 'OFFER';
    }

    const updated = await this.prisma.jobApplication.update({
      where: { id },
      data: {
        lastEmailAt: new Date(),
        lastEmailSubject: subject,
        ...statusPatch,
      },
      include: {
        position: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    if (type === 'INTERVIEW' && app.status !== 'INTERVIEW') {
      await this.prisma.jobPosition.update({
        where: { id: app.positionId },
        data: {
          interviewsScheduled: { increment: 1 },
          status: 'INTERVIEWING',
        },
      });
    }
    if (type === 'REJECTION' && app.status !== 'REJECTED') {
      await this.prisma.jobPosition.update({
        where: { id: app.positionId },
        data: { rejectedCount: { increment: 1 } },
      });
    }

    return { application: updated, email: result };
  }
}
