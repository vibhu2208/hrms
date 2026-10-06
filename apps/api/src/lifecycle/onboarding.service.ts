import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingStatus, LifecycleDocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { OrgService } from '../org/org.service';
import { StorageService } from '../storage/storage.service';

const ONBOARDING_CHECKLIST = [
  'Provision laptop / workstation',
  'Create company email',
  'Grant system access',
  'Orientation / welcome meeting',
  'Assign buddy / manager intro',
];

const listSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  joiningDate: true,
  status: true,
  employeeCode: true,
  roleCode: true,
  departmentId: true,
  designationId: true,
  createdAt: true,
} as const;

const PROFILE_KEYS = [
  'gender',
  'dateOfBirth',
  'bloodGroup',
  'maritalStatus',
  'fatherOrSpouseName',
  'personalEmail',
  'alternatePhone',
  'currentAddress',
  'city',
  'state',
  'pincode',
  'permanentAddress',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelation',
  'employmentType',
  'workLocation',
  'aadhaarNumber',
  'panNumber',
  'bankName',
  'bankAccountNumber',
  'bankIfsc',
] as const;

type UploadFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

const caseSelect = {
  id: true,
  status: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  employeeCode: true,
  roleCode: true,
  joiningDate: true,
  departmentId: true,
  designationId: true,
  managerId: true,
  employeeId: true,
  requestedById: true,
  offerSentAt: true,
  checklistItems: { select: { id: true, completed: true, title: true, order: true }, orderBy: { order: 'asc' as const } },
  employee: { select: { id: true, userId: true, employeeCode: true } },
} as const;

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private email: EmailService,
    private users: UsersService,
    private storage: StorageService,
    private org: OrgService,
  ) {}

  private async notifyOwners(title: string, body: string) {
    const owners = await this.prisma.user.findMany({
      where: { role: { code: 'OWNER' }, isActive: true },
    });
    for (const o of owners) {
      await this.notifications.create({
        userId: o.id,
        title,
        body,
        type: 'ONBOARDING_REQUEST',
        link: '/admin/onboarding',
      });
    }
  }

  async create(
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      employeeCode?: string;
      roleCode?: string;
      joiningDate: string;
      departmentId?: string;
      designationId?: string;
      managerId?: string;
      applicationId?: string;
      document1Kind?: string;
      document1Title?: string;
      document2Kind?: string;
      document2Title?: string;
    },
    requestedById: string,
    files?: { document1?: UploadFile; document2?: UploadFile; photo?: UploadFile },
  ) {
    if (!data.firstName?.trim() || !data.lastName?.trim() || !data.email?.trim()) {
      throw new BadRequestException('Name and email are required');
    }
    if (!data.joiningDate) {
      throw new BadRequestException('Joining date is required');
    }
    const profile = profileFrom(data);
    assertProfile(data, profile);
    if (!files?.document1 || !files?.document2) {
      throw new BadRequestException('Upload two verification documents');
    }
    assertUpload(files.document1, false);
    assertUpload(files.document2, false);
    if (files.photo) assertUpload(files.photo, true);

    if (data.applicationId) {
      const app = await this.prisma.jobApplication.findUnique({
        where: { id: data.applicationId },
      });
      if (!app) throw new NotFoundException('Application not found');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    await this.org.requirePlacement(data.departmentId, data.designationId);

    const request = await this.prisma.onboardingRequest.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: digits(data.phone || '') || data.phone,
        employeeCode: data.employeeCode,
        roleCode: data.roleCode || 'EMPLOYEE',
        joiningDate: new Date(data.joiningDate),
        departmentId: data.departmentId,
        designationId: data.designationId,
        managerId: data.managerId,
        applicationId: data.applicationId || undefined,
        profile,
        requestedById,
        status: OnboardingStatus.PENDING_OWNER,
      },
    });

    try {
      await this.storeCaseFile(
        request.id,
        files.document1,
        data.document1Kind,
        data.document1Title,
        requestedById,
      );
      await this.storeCaseFile(
        request.id,
        files.document2,
        data.document2Kind,
        data.document2Title,
        requestedById,
      );
      if (files.photo) {
        await this.storeCaseFile(request.id, files.photo, 'PHOTO', 'Profile photo', requestedById);
      }
    } catch (err) {
      await this.prisma.onboardingRequest.delete({ where: { id: request.id } }).catch(() => undefined);
      throw err;
    }

    await this.audit.log({
      actorId: requestedById,
      action: 'ONBOARDING_CREATE',
      resource: 'ONBOARDING',
      resourceId: request.id,
    });

    await this.notifyOwners(
      'Onboarding approval needed',
      `${request.firstName} ${request.lastName} — pending owner approval`,
    );

    return this.findOne(request.id);
  }

  list(status?: OnboardingStatus) {
    return this.prisma.onboardingRequest.findMany({
      where: status ? { status } : undefined,
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireCase(id: string) {
    const req = await this.prisma.onboardingRequest.findUnique({
      where: { id },
      select: caseSelect,
    });
    if (!req) throw new NotFoundException('Onboarding request not found');
    return req;
  }

  pending() {
    return this.list(OnboardingStatus.PENDING_OWNER);
  }

  async findOne(id: string) {
    const req = await this.prisma.onboardingRequest.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { uploadedAt: 'desc' } },
        checklistItems: { orderBy: { order: 'asc' } },
        requestedBy: { select: { id: true, email: true } },
        ownerApprover: { select: { id: true, email: true } },
        employee: true,
        application: { include: { position: true } },
      },
    });
    if (!req) throw new NotFoundException('Onboarding request not found');
    const placement = await this.org.placementNames(req.departmentId, req.designationId);
    return {
      ...req,
      ...placement,
      documents: await this.storage.attachPreviewUrls(req.documents),
    };
  }

  async review(
    id: string,
    action: 'APPROVE' | 'REJECT',
    ownerUserId: string,
    note?: string,
  ) {
    const req = await this.requireCase(id);
    if (req.status !== OnboardingStatus.PENDING_OWNER) {
      throw new BadRequestException('Request is not pending owner approval');
    }

    if (action === 'REJECT') {
      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: {
          status: OnboardingStatus.REJECTED,
          ownerApproverId: ownerUserId,
          reviewNote: note,
        },
      });
      await this.audit.log({
        actorId: ownerUserId,
        action: 'ONBOARDING_REJECT',
        resource: 'ONBOARDING',
        resourceId: id,
      });
      await this.notifications.create({
        userId: req.requestedById,
        title: 'Onboarding rejected',
        body: `${req.firstName} ${req.lastName} was rejected by owner`,
        type: 'ONBOARDING_STATUS',
        link: '/admin/onboarding',
      });
      return updated;
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        status: OnboardingStatus.OFFER_LETTER,
        ownerApproverId: ownerUserId,
        reviewNote: note,
        checklistItems: {
          create: ONBOARDING_CHECKLIST.map((title, order) => ({ title, order })),
        },
      },
      include: { checklistItems: { orderBy: { order: 'asc' } } },
    });

    await this.audit.log({
      actorId: ownerUserId,
      action: 'ONBOARDING_APPROVE',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    await this.notifications.create({
      userId: req.requestedById,
      title: 'Onboarding approved',
      body: `${req.firstName} ${req.lastName} approved — send offer letter`,
      type: 'ONBOARDING_STATUS',
      link: '/admin/onboarding',
    });

    return updated;
  }

  async sendOffer(
    id: string,
    actorId: string,
    body?: { subject?: string; message?: string },
  ) {
    const req = await this.requireCase(id);
    if (req.status !== OnboardingStatus.OFFER_LETTER) {
      throw new BadRequestException('Request is not in offer letter stage');
    }

    const subject =
      body?.subject?.trim() ||
      `Offer of employment — ${req.firstName} ${req.lastName}`;
    const text =
      body?.message?.trim() ||
      `Hi ${req.firstName},\n\nWe are pleased to offer you a position at Go Staff` +
        (req.joiningDate
          ? `, with a proposed joining date of ${req.joiningDate.toLocaleDateString()}`
          : '') +
        `.\n\nOur HR team will follow up with documentation and next steps.\n\nCongratulations!\n\nBest regards,\nHR Team — Go Staff`;

    const result = await this.email.send({
      to: req.email,
      subject,
      text,
    });

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        offerSubject: subject,
        offerBody: text,
        offerSentAt: new Date(),
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_OFFER_SENT',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { delivered: result.delivered, mode: result.mode },
    });

    return { ...updated, emailResult: result };
  }

  async markOfferAccepted(id: string, actorId: string) {
    const req = await this.requireCase(id);
    if (req.status !== OnboardingStatus.OFFER_LETTER) {
      throw new BadRequestException('Request is not in offer letter stage');
    }
    if (!req.offerSentAt) {
      throw new BadRequestException('Send the offer letter before marking accepted');
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        status: OnboardingStatus.DOCUMENTS,
        offerAcceptedAt: new Date(),
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_OFFER_ACCEPTED',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    return updated;
  }

  async addDocument(
    id: string,
    data: { kind?: LifecycleDocumentKind; title: string; url: string },
    actorId: string,
  ) {
    const req = await this.requireCase(id);
    if (
      req.status !== OnboardingStatus.DOCUMENTS &&
      req.status !== OnboardingStatus.OFFER_LETTER &&
      req.status !== OnboardingStatus.CREATE_ACCOUNT &&
      req.status !== OnboardingStatus.IT_HR_CHECKLIST
    ) {
      throw new BadRequestException('Cannot add documents in current stage');
    }
    if (!data.title?.trim() || !data.url?.trim()) {
      throw new BadRequestException('Title and URL are required');
    }

    const doc = await this.prisma.lifecycleDocument.create({
      data: {
        onboardingId: id,
        employeeId: req.employeeId,
        kind: data.kind || LifecycleDocumentKind.OTHER,
        title: data.title.trim(),
        url: data.url.trim(),
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_DOCUMENT_ADD',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    const [withPreview] = await this.storage.attachPreviewUrls([doc]);
    return withPreview;
  }

  async uploadDocument(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    data: { kind?: string; title?: string },
    actorId: string,
  ) {
    const req = await this.requireCase(id);
    if (
      req.status !== OnboardingStatus.DOCUMENTS &&
      req.status !== OnboardingStatus.OFFER_LETTER &&
      req.status !== OnboardingStatus.CREATE_ACCOUNT &&
      req.status !== OnboardingStatus.IT_HR_CHECKLIST &&
      req.status !== OnboardingStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot add documents in current stage');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a file to upload');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new BadRequestException('File must be 15 MB or smaller');
    }

    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Upload a PDF, image, or Word document');
    }

    const safeName = (file.originalname || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const storagePath = `${id}/${Date.now()}-${safeName}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);

    const kind = (Object.values(LifecycleDocumentKind) as string[]).includes(data.kind || '')
      ? (data.kind as LifecycleDocumentKind)
      : LifecycleDocumentKind.OTHER;

    const title = data.title?.trim() || file.originalname || 'Document';
    const doc = await this.prisma.lifecycleDocument.create({
      data: {
        onboardingId: id,
        employeeId: req.employeeId,
        kind,
        title,
        url: storagePath,
        storagePath,
        mimeType: file.mimetype,
        fileName: file.originalname,
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_DOCUMENT_UPLOAD',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { storagePath, bucket: this.storage.bucket() },
    });

    const [withPreview] = await this.storage.attachPreviewUrls([doc]);
    return withPreview;
  }

  async advance(id: string, actorId: string) {
    const req = await this.requireCase(id);

    if (req.status === OnboardingStatus.DOCUMENTS) {
      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: { status: OnboardingStatus.CREATE_ACCOUNT },
      });
      await this.audit.log({
        actorId,
        action: 'ONBOARDING_ADVANCE',
        resource: 'ONBOARDING',
        resourceId: id,
        metadata: { to: 'CREATE_ACCOUNT' },
      });
      return updated;
    }

    if (req.status === OnboardingStatus.IT_HR_CHECKLIST) {
      const pending = req.checklistItems.filter((i) => !i.completed);
      if (pending.length) {
        throw new BadRequestException(
          `Complete all checklist items first (${pending.length} remaining)`,
        );
      }

      let employeeId = req.employeeId;
      let userId = req.employee?.userId;
      if (!employeeId) {
        const created = await this.provisionAccount(req, actorId);
        employeeId = created.employeeId;
        userId = created.employee?.userId;
      }

      if (!userId) {
        throw new BadRequestException('Employee portal account could not be created');
      }

      const creds = await this.users.issueTemporaryPassword(userId);
      const emailResult = await this.users.sendPortalCredentials({
        to: creds.email,
        firstName: creds.firstName || req.firstName,
        employeeCode: creds.employeeCode || req.employeeCode || '',
        password: creds.password,
      });

      if (!emailResult.delivered) {
        const reason = emailResult.error ? `: ${emailResult.error}` : '. Check mail settings and try again';
        throw new BadRequestException(
          `Portal account ${creds.employeeCode} is ready, but the login email was not sent${reason}.`,
        );
      }

      const updated = await this.prisma.onboardingRequest.update({
        where: { id },
        data: { status: OnboardingStatus.COMPLETED },
      });
      await this.audit.log({
        actorId,
        action: 'ONBOARDING_COMPLETE',
        resource: 'ONBOARDING',
        resourceId: id,
        metadata: {
          employeeId,
          delivered: emailResult.delivered,
          mode: emailResult.mode,
        },
      });
      return { ...updated, emailResult };
    }

    throw new BadRequestException('Cannot advance from current stage');
  }

  async createAccount(
    id: string,
    actorId: string,
    body?: { password?: string; employeeCode?: string },
  ) {
    const req = await this.requireCase(id);
    if (req.status !== OnboardingStatus.CREATE_ACCOUNT) {
      throw new BadRequestException('Request is not in create-account stage');
    }
    if (req.employeeId) {
      throw new BadRequestException('Account already created');
    }
    return this.provisionAccount(req, actorId, body);
  }

  private async provisionAccount(
    req: { id: string; email: string; firstName: string; lastName: string; phone: string | null; joiningDate: Date; departmentId: string | null; designationId: string | null; managerId: string | null; roleCode: string; employeeCode: string | null },
    actorId: string,
    body?: { password?: string; employeeCode?: string },
  ) {
    const stored = await this.prisma.onboardingRequest.findUnique({
      where: { id: req.id },
      include: {
        documents: { where: { kind: LifecycleDocumentKind.PHOTO }, orderBy: { uploadedAt: 'desc' }, take: 1 },
      },
    });
    const profile = profileRecord(stored?.profile);
    const user = await this.users.create(
      {
        email: req.email,
        password: body?.password?.trim() || undefined,
        roleCode: req.roleCode,
        firstName: req.firstName,
        lastName: req.lastName,
        phone: req.phone || undefined,
        joiningDate: req.joiningDate.toISOString(),
        departmentId: req.departmentId || undefined,
        designationId: req.designationId || undefined,
        managerId: req.managerId || undefined,
        ...profile,
      },
      actorId,
    );
    const photoPath = stored?.documents[0]?.storagePath;
    if (user.employee?.id && (Object.keys(profile).length || photoPath)) {
      await this.users.update(
        user.employee.id,
        {
          ...profile,
          ...(photoPath ? { photoUrl: photoPath } : {}),
        },
        actorId,
      );
    }
    const employeeCode = user.employee?.employeeCode || '';

    await this.prisma.lifecycleDocument.updateMany({
      where: { onboardingId: req.id },
      data: { employeeId: user.employee!.id },
    });

    const updated = await this.prisma.onboardingRequest.update({
      where: { id: req.id },
      data: {
        employeeId: user.employee!.id,
        employeeCode,
        status: OnboardingStatus.IT_HR_CHECKLIST,
      },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_ACCOUNT_CREATED',
      resource: 'ONBOARDING',
      resourceId: req.id,
      metadata: { employeeId: user.employee!.id },
    });

    return {
      ...updated,
      employee: user.employee,
    };
  }

  async toggleChecklistItem(
    id: string,
    itemId: string,
    completed: boolean,
    actorId: string,
  ) {
    const item = await this.prisma.lifecycleChecklistItem.findFirst({
      where: { id: itemId, onboardingId: id },
      select: { id: true, onboarding: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Checklist item not found');
    if (item.onboarding?.status !== OnboardingStatus.IT_HR_CHECKLIST) {
      throw new BadRequestException('Checklist is only editable in IT/HR stage');
    }

    const updated = await this.prisma.lifecycleChecklistItem.update({
      where: { id: itemId },
      data: { completed },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_CHECKLIST_TOGGLE',
      resource: 'ONBOARDING',
      resourceId: id,
      metadata: { itemId, completed },
    });

    return updated;
  }

  async cancel(id: string, actorId: string) {
    const req = await this.requireCase(id);
    if (
      req.status === OnboardingStatus.COMPLETED ||
      req.status === OnboardingStatus.REJECTED ||
      req.status === OnboardingStatus.CANCELLED
    ) {
      throw new BadRequestException('Request is already closed');
    }

    const updated = await this.prisma.onboardingRequest.update({
      where: { id },
      data: { status: OnboardingStatus.CANCELLED },
    });

    await this.audit.log({
      actorId,
      action: 'ONBOARDING_CANCEL',
      resource: 'ONBOARDING',
      resourceId: id,
    });

    return updated;
  }

  private async storeCaseFile(
    onboardingId: string,
    file: UploadFile,
    kind: string | undefined,
    title: string | undefined,
    actorId: string,
  ) {
    const safeName = (file.originalname || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const storagePath = `${onboardingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);
    const resolved = (Object.values(LifecycleDocumentKind) as string[]).includes(kind || '')
      ? (kind as LifecycleDocumentKind)
      : LifecycleDocumentKind.OTHER;
    await this.prisma.lifecycleDocument.create({
      data: {
        onboardingId,
        kind: resolved,
        title: title?.trim() || file.originalname || 'Document',
        url: storagePath,
        storagePath,
        mimeType: file.mimetype,
        fileName: file.originalname,
      },
    });
    await this.audit.log({
      actorId,
      action: 'ONBOARDING_DOCUMENT_UPLOAD',
      resource: 'ONBOARDING',
      resourceId: onboardingId,
      metadata: { storagePath, bucket: this.storage.bucket() },
    });
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function profileFrom(data: Record<string, unknown>) {
  const profile: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const value = text(data[key]);
    if (!value) continue;
    if (key === 'panNumber' || key === 'bankIfsc') profile[key] = value.toUpperCase();
    else if (key === 'aadhaarNumber' || key === 'emergencyContactPhone' || key === 'alternatePhone') {
      profile[key] = digits(value);
    } else profile[key] = value;
  }
  return profile as Prisma.InputJsonObject;
}

function profileRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === 'string' && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

function assertProfile(
  data: { phone?: string; departmentId?: string; designationId?: string },
  profile: Prisma.InputJsonObject,
) {
  const phone = digits(data.phone || '');
  if (phone.length < 10) throw new BadRequestException('Enter a valid phone number');
  const emergency = digits(String(profile.emergencyContactPhone || ''));
  if (!text(profile.emergencyContactName) || emergency.length < 10) {
    throw new BadRequestException('Emergency contact name and phone are required');
  }
  if (!text(profile.gender) || !text(profile.dateOfBirth)) {
    throw new BadRequestException('Gender and date of birth are required');
  }
  if (!text(profile.currentAddress) || !text(profile.city) || !text(profile.state)) {
    throw new BadRequestException('Current address, city, and state are required');
  }
  if (!/^\d{6}$/.test(String(profile.pincode || ''))) {
    throw new BadRequestException('PIN code must be 6 digits');
  }
  if (!/^\d{12}$/.test(digits(String(profile.aadhaarNumber || '')))) {
    throw new BadRequestException('Aadhaar number must be 12 digits');
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(profile.panNumber || ''))) {
    throw new BadRequestException('Enter a valid PAN (for example ABCDE1234F)');
  }
  if (!data.departmentId || !data.designationId) {
    throw new BadRequestException('Department and designation are required');
  }
  const personalEmail = text(profile.personalEmail);
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
    throw new BadRequestException('Enter a valid personal email');
  }
  const bankIfsc = text(profile.bankIfsc);
  if (bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
    throw new BadRequestException('Enter a valid IFSC');
  }
}

function assertUpload(file: UploadFile, photo: boolean) {
  if (!file?.buffer?.length) throw new BadRequestException(photo ? 'Choose a photo to upload' : 'Choose a file to upload');
  const limit = photo ? 5 * 1024 * 1024 : 15 * 1024 * 1024;
  if ((file.size || 0) > limit) {
    throw new BadRequestException(photo ? 'Photo must be 5 MB or smaller' : 'Each file must be 15 MB or smaller');
  }
  const allowed = photo
    ? new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    : new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]);
  if (!file.mimetype || !allowed.has(file.mimetype)) {
    throw new BadRequestException(photo ? 'Upload a JPG, PNG, or WebP photo' : 'Upload a PDF, image, or Word document');
  }
}
