import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BloodGroup, EmploymentType, Gender, LifecycleDocumentKind, MaritalStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OrgService } from '../org/org.service';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { LeaveService } from '../leave/leave.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private employeeListCache: { at: number; rows: any[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
    private storage: StorageService,
    private org: OrgService,
    private leave: LeaveService,
  ) {}

  private clearEmployeeListCache() {
    this.employeeListCache = null;
  }

  private async employeeList() {
    if (this.employeeListCache && Date.now() - this.employeeListCache.at < 60_000) {
      return this.employeeListCache.rows;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        employeeCode: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        dateOfBirth: Date | null;
        joiningDate: Date;
        lastWorkingDay: Date | null;
        isActive: boolean | null;
        departmentId: string | null;
        departmentName: string | null;
        designationId: string | null;
        designationName: string | null;
        email: string | null;
        roleCode: string | null;
        roleName: string | null;
        documentCount: number;
      }>
    >`
      SELECT e.id,
             e."employeeCode",
             e."firstName",
             e."lastName",
             e.phone,
             e."dateOfBirth",
             e."joiningDate",
             e."lastWorkingDay",
             d.id AS "departmentId",
             d.name AS "departmentName",
             g.id AS "designationId",
             g.name AS "designationName",
             u.email,
             u."isActive" AS "isActive",
             r.code::text AS "roleCode",
             r.name AS "roleName",
             (
               SELECT COUNT(*)::int
               FROM "LifecycleDocument" doc
               WHERE doc."employeeId" = e.id
             ) AS "documentCount"
      FROM "Employee" e
      LEFT JOIN "Department" d ON d.id = e."departmentId"
      LEFT JOIN "Designation" g ON g.id = e."designationId"
      LEFT JOIN "User" u ON u.id = e."userId"
      LEFT JOIN "Role" r ON r.id = u."roleId"
      ORDER BY e."firstName" ASC
    `;

    const mapped = rows.map((row) => ({
      id: row.id,
      employeeCode: row.employeeCode,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      dateOfBirth: row.dateOfBirth,
      joiningDate: row.joiningDate,
      lastWorkingDay: row.lastWorkingDay,
      isActive: row.isActive !== false,
      department: row.departmentId ? { id: row.departmentId, name: row.departmentName } : null,
      designation: row.designationId ? { id: row.designationId, name: row.designationName } : null,
      user: {
        email: row.email,
        role: row.roleCode ? { code: row.roleCode, name: row.roleName } : null,
      },
      documentCount: Number(row.documentCount) || 0,
    }));
    this.employeeListCache = { at: Date.now(), rows: mapped };
    return mapped;
  }

  async findAll(query?: { departmentId?: string; search?: string }) {
    let rows = await this.employeeList();
    if (query?.departmentId) {
      rows = rows.filter((row) => row.department?.id === query.departmentId);
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.firstName.toLowerCase().includes(q) ||
          row.lastName.toLowerCase().includes(q) ||
          row.employeeCode.toLowerCase().includes(q),
      );
    }
    return rows;
  }

  async findOne(id: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        employeeCode: string;
        firstName: string;
        lastName: string;
        gender: string | null;
        dateOfBirth: Date | null;
        bloodGroup: string | null;
        maritalStatus: string | null;
        fatherOrSpouseName: string | null;
        phone: string | null;
        alternatePhone: string | null;
        personalEmail: string | null;
        photoUrl: string | null;
        currentAddress: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
        permanentAddress: string | null;
        emergencyContactName: string | null;
        emergencyContactPhone: string | null;
        emergencyContactRelation: string | null;
        aadhaarNumber: string | null;
        panNumber: string | null;
        joiningDate: Date;
        lastWorkingDay: Date | null;
        isActive: boolean | null;
        employmentType: string | null;
        workLocation: string | null;
        bankName: string | null;
        bankAccountNumber: string | null;
        bankIfsc: string | null;
        department: { id: string; name: string } | null;
        designation: { id: string; name: string } | null;
        manager: { id: string; firstName: string; lastName: string } | null;
        email: string | null;
        roleCode: string | null;
        roleName: string | null;
        reports: any;
        onboardingRequests: any;
        documents: any;
      }>
    >`
      SELECT e.id,
             e."employeeCode",
             e."firstName",
             e."lastName",
             e.gender::text AS gender,
             e."dateOfBirth",
             e."bloodGroup"::text AS "bloodGroup",
             e."maritalStatus"::text AS "maritalStatus",
             e."fatherOrSpouseName",
             e.phone,
             e."alternatePhone",
             e."personalEmail",
             e."photoUrl",
             e."currentAddress",
             e.city,
             e.state,
             e.pincode,
             e."permanentAddress",
             e."emergencyContactName",
             e."emergencyContactPhone",
             e."emergencyContactRelation",
             e."aadhaarNumber",
             e."panNumber",
             e."joiningDate",
             e."employmentType"::text AS "employmentType",
             e."workLocation",
             e."bankName",
             e."bankAccountNumber",
             e."bankIfsc",
             CASE WHEN d.id IS NULL THEN NULL
                  ELSE json_build_object('id', d.id, 'name', d.name) END AS department,
             CASE WHEN g.id IS NULL THEN NULL
                  ELSE json_build_object('id', g.id, 'name', g.name) END AS designation,
             CASE WHEN m.id IS NULL THEN NULL
                  ELSE json_build_object('id', m.id, 'firstName', m."firstName", 'lastName', m."lastName") END AS manager,
             e."lastWorkingDay",
             u.email,
             u."isActive" AS "isActive",
             r.code::text AS "roleCode",
             r.name AS "roleName",
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', rep.id,
                 'firstName', rep."firstName",
                 'lastName', rep."lastName",
                 'employeeCode', rep."employeeCode"
               ) ORDER BY rep."firstName")
               FROM "Employee" rep
               WHERE rep."managerId" = e.id
             ), '[]'::json) AS reports,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', ob.id,
                 'status', ob.status::text,
                 'email', ob.email,
                 'joiningDate', ob."joiningDate"
               ) ORDER BY ob."createdAt" DESC)
               FROM "OnboardingRequest" ob
               WHERE ob."employeeId" = e.id
             ), '[]'::json) AS "onboardingRequests",
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', doc.id,
                 'kind', doc.kind::text,
                 'title', doc.title,
                 'url', doc.url,
                 'storagePath', doc."storagePath",
                 'mimeType', doc."mimeType",
                 'fileName', doc."fileName",
                 'uploadedAt', doc."uploadedAt",
                 'employeeId', doc."employeeId",
                 'onboardingId', doc."onboardingId"
               ) ORDER BY doc."uploadedAt" DESC)
               FROM "LifecycleDocument" doc
               LEFT JOIN "OnboardingRequest" ob ON ob.id = doc."onboardingId"
               WHERE doc."employeeId" = e.id OR ob."employeeId" = e.id
             ), '[]'::json) AS documents
      FROM "Employee" e
      LEFT JOIN "Department" d ON d.id = e."departmentId"
      LEFT JOIN "Designation" g ON g.id = e."designationId"
      LEFT JOIN "Employee" m ON m.id = e."managerId"
      LEFT JOIN "User" u ON u.id = e."userId"
      LEFT JOIN "Role" r ON r.id = u."roleId"
      WHERE e.id = ${id}
    `;

    const emp = rows[0];
    if (!emp) throw new NotFoundException('Employee not found');

    const documents = asJsonArray<{
      url: string;
      storagePath: string | null;
      mimeType?: string | null;
      fileName?: string | null;
      id: string;
      title: string;
      kind: string;
    }>(emp.documents);
    return {
      id: emp.id,
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      bloodGroup: emp.bloodGroup,
      maritalStatus: emp.maritalStatus,
      fatherOrSpouseName: emp.fatherOrSpouseName,
      phone: emp.phone,
      alternatePhone: emp.alternatePhone,
      personalEmail: emp.personalEmail,
      photoUrl: emp.photoUrl,
      photoPreviewUrl: await this.photoPreview(emp.photoUrl),
      currentAddress: emp.currentAddress,
      city: emp.city,
      state: emp.state,
      pincode: emp.pincode,
      permanentAddress: emp.permanentAddress,
      emergencyContactName: emp.emergencyContactName,
      emergencyContactPhone: emp.emergencyContactPhone,
      emergencyContactRelation: emp.emergencyContactRelation,
      aadhaarNumber: emp.aadhaarNumber,
      panNumber: emp.panNumber,
      joiningDate: emp.joiningDate,
      lastWorkingDay: emp.lastWorkingDay,
      isActive: emp.isActive !== false,
      employmentType: emp.employmentType,
      workLocation: emp.workLocation,
      bankName: emp.bankName,
      bankAccountNumber: emp.bankAccountNumber,
      bankIfsc: emp.bankIfsc,
      department: emp.department,
      designation: emp.designation,
      manager: emp.manager,
      user: {
        email: emp.email,
        role: emp.roleCode ? { code: emp.roleCode, name: emp.roleName } : null,
      },
      reports: asJsonArray(emp.reports),
      onboardingRequests: asJsonArray(emp.onboardingRequests),
      documents: await this.storage.attachPreviewUrls(documents),
    };
  }

  async uploadDocument(
    employeeId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    data: { kind?: string; title?: string },
    actorId: string,
  ) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { onboardingRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload');
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
    const folder = emp.onboardingRequests[0]?.id || employeeId;
    const storagePath = `${folder}/${Date.now()}-${safeName}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);

    const kind = (Object.values(LifecycleDocumentKind) as string[]).includes(data.kind || '')
      ? (data.kind as LifecycleDocumentKind)
      : LifecycleDocumentKind.OTHER;

    const doc = await this.prisma.lifecycleDocument.create({
      data: {
        employeeId,
        onboardingId: emp.onboardingRequests[0]?.id,
        kind,
        title: data.title?.trim() || file.originalname || 'Document',
        url: storagePath,
        storagePath,
        mimeType: file.mimetype,
        fileName: file.originalname,
      },
    });

    this.clearEmployeeListCache();
    await this.audit.log({
      actorId,
      action: 'EMPLOYEE_DOCUMENT_UPLOAD',
      resource: 'EMPLOYEE',
      resourceId: employeeId,
      metadata: { storagePath, bucket: this.storage.bucket() },
    });

    const [withPreview] = await this.storage.attachPreviewUrls([doc]);
    return withPreview;
  }

  async directory() {
    return this.prisma.employee.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        photoUrl: true,
        joiningDate: true,
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { email: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async upcomingBirthdays(days = 30) {
    const employees = await this.prisma.employee.findMany({
      where: { dateOfBirth: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        department: true,
        photoUrl: true,
      },
    });
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + days);

    return employees
      .map((e) => {
        if (!e.dateOfBirth) return null;
        const dob = new Date(e.dateOfBirth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        return { ...e, nextBirthday: next };
      })
      .filter((e): e is NonNullable<typeof e> => !!e && e.nextBirthday <= end)
      .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime());
  }

  async previewNextEmployeeCode() {
    const next = await this.peekNextCodeNumber();
    return { employeeCode: formatEmployeeCode(next) };
  }

  /** @deprecated Prefer omitting employeeCode so create() allocates inside a transaction. */
  async nextEmployeeCode() {
    const next = await this.peekNextCodeNumber();
    return formatEmployeeCode(next);
  }

  private async peekNextCodeNumber() {
    const seq = await this.prisma.employeeCodeSequence.findUnique({ where: { id: 'default' } });
    const rows = await this.prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(CAST(substring("employeeCode" FROM 4) AS INTEGER)) AS max
      FROM "Employee"
      WHERE "employeeCode" ~* '^GS-[0-9]{1,4}$'
    `;
    const max = Number(rows[0]?.max) || 0;
    const last = seq?.lastIssued || 0;
    return Math.max(max, last) + 1;
  }

  private async allocateEmployeeCode(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`
      INSERT INTO "EmployeeCodeSequence" ("id", "lastIssued")
      VALUES ('default', 0)
      ON CONFLICT ("id") DO NOTHING
    `;
    const rows = await tx.$queryRaw<Array<{ lastIssued: number }>>`
      UPDATE "EmployeeCodeSequence" AS s
      SET "lastIssued" = GREATEST(
        s."lastIssued",
        COALESCE((
          SELECT MAX(CAST(substring(e."employeeCode" FROM 4) AS INTEGER))
          FROM "Employee" e
          WHERE e."employeeCode" ~* '^GS-[0-9]{1,4}$'
        ), 0)
      ) + 1
      WHERE s.id = 'default'
      RETURNING s."lastIssued"
    `;
    const n = Number(rows[0]?.lastIssued);
    if (!Number.isInteger(n) || n < 1) {
      throw new BadRequestException('Could not assign an employee code');
    }
    return formatEmployeeCode(n);
  }

  private temporaryPassword() {
    return `Gs${randomBytes(4).toString('hex')}!`;
  }

  async issueTemporaryPassword(userId: string) {
    const password = this.temporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, isActive: true },
      include: { employee: true },
    });
    return {
      password,
      email: user.email,
      employeeCode: user.employee?.employeeCode || '',
      firstName: user.employee?.firstName || '',
    };
  }

  async sendPortalCredentials(input: {
    to: string;
    firstName: string;
    employeeCode: string;
    password: string;
  }): Promise<{ delivered: boolean; mode: string; error?: string }> {
    const origin = (this.config.get<string>('CORS_ORIGIN') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const text =
      `Hi ${input.firstName},\n\n` +
      `Your Go Staff account is ready.\n\n` +
      `Employee ID: ${input.employeeCode}\n` +
      `Email: ${input.to}\n` +
      `Temporary password: ${input.password}\n\n` +
      `Sign in at ${origin}/login and change your password after you log in.\n\n` +
      `Best regards,\nHR Team — Go Staff`;
    try {
      return await this.email.send({
        to: input.to,
        subject: `Your Go Staff login — ${input.employeeCode}`,
        text,
      });
    } catch (err: any) {
      return {
        delivered: false,
        mode: 'log' as const,
        error: err?.message || 'Email failed',
      };
    }
  }

  async create(
    data: EmployeeCreateInput,
    actorId?: string,
    opts?: {
      sendLoginEmail?: boolean;
      photo?: { buffer: Buffer; mimetype: string; originalname: string; size: number };
      documents?: Array<{
        file: { buffer: Buffer; mimetype: string; originalname: string; size: number };
        kind?: string;
        title?: string;
      }>;
    },
  ) {
    const fullProfile = !!opts?.documents;
    if (fullProfile && opts.documents!.length < 2) {
      throw new BadRequestException('Upload two verification documents');
    }
    const profile = buildEmployeeProfile(data, fullProfile);
    await this.org.requirePlacement(profile.departmentId, profile.designationId);
    const roleCode = data.roleCode || 'EMPLOYEE';
    const role = await this.prisma.role.findUnique({ where: { code: roleCode as any } });
    if (!role) throw new NotFoundException('Role not found');

    const storedDocs: Array<{
      kind: LifecycleDocumentKind;
      title: string;
      url: string;
      storagePath: string;
      mimeType: string;
      fileName: string;
    }> = [];
    for (const doc of opts?.documents || []) {
      assertUpload(doc.file);
      const kind = documentKind(doc.kind);
      const safeName = (doc.file.originalname || 'document')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
      const storagePath = `employees/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      await this.storage.upload(storagePath, doc.file.buffer, doc.file.mimetype);
      storedDocs.push({
        kind,
        title: doc.title?.trim() || doc.file.originalname || 'Verification document',
        url: storagePath,
        storagePath,
        mimeType: doc.file.mimetype,
        fileName: doc.file.originalname,
      });
    }

    const photoUrl = opts?.photo ? await this.storeEmployeePhoto(opts.photo) : null;
    const password = data.password?.trim() || this.temporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const requestedCode = data.employeeCode?.trim();

    let user;
    let employeeCode = requestedCode || '';
    try {
      user = await this.prisma.$transaction(async (tx) => {
        employeeCode = requestedCode || (await this.allocateEmployeeCode(tx));
        return tx.user.create({
          data: {
            email: profile.email,
            passwordHash,
            roleId: role.id,
            employee: {
              create: {
                employeeCode,
                firstName: profile.firstName,
                lastName: profile.lastName,
                gender: profile.gender,
                dateOfBirth: profile.dateOfBirth,
                bloodGroup: profile.bloodGroup,
                maritalStatus: profile.maritalStatus,
                fatherOrSpouseName: profile.fatherOrSpouseName,
                phone: profile.phone,
                alternatePhone: profile.alternatePhone,
                personalEmail: profile.personalEmail,
                photoUrl,
                currentAddress: profile.currentAddress,
                city: profile.city,
                state: profile.state,
                pincode: profile.pincode,
                permanentAddress: profile.permanentAddress,
                emergencyContactName: profile.emergencyContactName,
                emergencyContactPhone: profile.emergencyContactPhone,
                emergencyContactRelation: profile.emergencyContactRelation,
                aadhaarNumber: profile.aadhaarNumber,
                panNumber: profile.panNumber,
                joiningDate: profile.joiningDate,
                employmentType: profile.employmentType,
                workLocation: profile.workLocation,
                bankName: profile.bankName,
                bankAccountNumber: profile.bankAccountNumber,
                bankIfsc: profile.bankIfsc,
                departmentId: profile.departmentId,
                designationId: profile.designationId,
                managerId: profile.managerId,
                documents: storedDocs.length
                  ? {
                      create: storedDocs,
                    }
                  : undefined,
              },
            },
          },
          include: { employee: true, role: true },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email or employee ID already exists');
      }
      throw err;
    }

    this.clearEmployeeListCache();
    if (user.employee?.id) {
      await this.leave.syncBalances({ employeeIds: [user.employee.id] });
    }
    await this.audit.log({
      actorId,
      action: 'CREATE',
      resource: 'EMPLOYEE',
      resourceId: user.employee?.id,
    });

    let loginEmail: { delivered: boolean; mode: string; error?: string } | null = null;
    if (opts?.sendLoginEmail) {
      loginEmail = await this.sendPortalCredentials({
        to: profile.email,
        firstName: profile.firstName,
        employeeCode,
        password,
      });
    }

    const { passwordHash: _hash, ...safe } = user;
    return {
      ...safe,
      loginEmail,
      temporaryPassword: loginEmail && !loginEmail.delivered ? password : undefined,
      employeeName: `${user.employee?.firstName || profile.firstName} ${user.employee?.lastName || profile.lastName}`.trim(),
    };
  }

  async update(
    id: string,
    data: Record<string, any>,
    actorId?: string,
    photo?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');

    const departmentId = data.departmentId === undefined ? existing.departmentId : clean(data.departmentId) || null;
    const designationId = data.designationId === undefined ? existing.designationId : clean(data.designationId) || null;
    if (data.departmentId !== undefined || data.designationId !== undefined) {
      await this.org.requirePlacement(departmentId || undefined, designationId || undefined);
    }

    const patch: Prisma.EmployeeUncheckedUpdateInput = {};
    const textFields = [
      'firstName',
      'lastName',
      'phone',
      'alternatePhone',
      'personalEmail',
      'fatherOrSpouseName',
      'currentAddress',
      'city',
      'state',
      'pincode',
      'permanentAddress',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelation',
      'aadhaarNumber',
      'panNumber',
      'workLocation',
      'bankName',
      'bankAccountNumber',
      'bankIfsc',
      'photoUrl',
    ] as const;
    for (const key of textFields) {
      if (data[key] === undefined) continue;
      const value = clean(data[key] == null ? '' : String(data[key])) || null;
      if (key === 'firstName' || key === 'lastName') {
        if (value) patch[key] = value;
        continue;
      }
      patch[key] = value;
    }
    if (patch.panNumber) patch.panNumber = String(patch.panNumber).toUpperCase();
    if (patch.bankIfsc) patch.bankIfsc = String(patch.bankIfsc).toUpperCase();
    if (data.departmentId !== undefined) patch.departmentId = departmentId;
    if (data.designationId !== undefined) patch.designationId = designationId;
    if (data.managerId !== undefined) patch.managerId = clean(data.managerId) || null;
    if (data.dateOfBirth !== undefined) {
      patch.dateOfBirth = data.dateOfBirth ? parseDate(String(data.dateOfBirth), 'Date of birth') : null;
    }
    if (data.joiningDate !== undefined) {
      patch.joiningDate = parseDate(String(data.joiningDate || ''), 'Joining date');
    }
    if (data.gender) patch.gender = enumValue(Gender, String(data.gender), 'Gender');
    if (data.bloodGroup !== undefined) {
      patch.bloodGroup = data.bloodGroup ? enumValue(BloodGroup, String(data.bloodGroup), 'Blood group') : null;
    }
    if (data.maritalStatus !== undefined) {
      patch.maritalStatus = data.maritalStatus
        ? enumValue(MaritalStatus, String(data.maritalStatus), 'Marital status')
        : null;
    }
    if (data.employmentType) {
      patch.employmentType = enumValue(EmploymentType, String(data.employmentType), 'Employment type');
    }
    if (photo?.buffer?.length) {
      patch.photoUrl = await this.storeEmployeePhoto(photo);
    }

    const userPatch: Prisma.UserUpdateInput = {};
    if (data.email !== undefined) {
      const email = requireText(String(data.email || ''), 'Work email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('Enter a valid work email');
      }
      userPatch.email = email;
    }
    if (data.roleCode) {
      const role = await this.prisma.role.findUnique({ where: { code: data.roleCode } });
      if (!role) throw new NotFoundException('Role not found');
      userPatch.role = { connect: { id: role.id } };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(userPatch).length) {
          await tx.user.update({ where: { id: existing.userId }, data: userPatch });
        }
        await tx.employee.update({ where: { id }, data: patch });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email or employee ID already exists');
      }
      throw err;
    }

    this.clearEmployeeListCache();
    if (data.departmentId !== undefined && departmentId !== existing.departmentId) {
      await this.leave.syncBalances({ employeeIds: [id] });
    }
    await this.audit.log({
      actorId,
      action: 'UPDATE',
      resource: 'EMPLOYEE',
      resourceId: id,
    });
    return this.findOne(id);
  }

  async deactivate(employeeId: string, lastWorkingDay?: string, actorId?: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: emp.userId },
        data: { isActive: false },
      }),
      this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          lastWorkingDay: lastWorkingDay ? new Date(lastWorkingDay) : new Date(),
        },
      }),
    ]);

    this.clearEmployeeListCache();
    await this.audit.log({
      actorId,
      action: 'DEACTIVATE',
      resource: 'EMPLOYEE',
      resourceId: employeeId,
    });

    return this.findOne(employeeId);
  }

  private async storeEmployeePhoto(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a photo to upload');
    if ((file.size || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Photo must be 5 MB or smaller');
    }
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!file.mimetype || !allowed.has(file.mimetype)) {
      throw new BadRequestException('Upload a JPG, PNG, or WebP photo');
    }
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : file.mimetype === 'image/gif' ? 'gif' : 'jpg';
    const storagePath = `employees/photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);
    return storagePath;
  }

  private async photoPreview(photoUrl: string | null) {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    try {
      return await this.storage.signedUrl(photoUrl);
    } catch {
      return null;
    }
  }
}

type EmployeeCreateInput = {
  email: string;
  password?: string;
  roleCode?: string;
  employeeCode?: string;
  firstName: string;
  lastName: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  fatherOrSpouseName?: string;
  phone?: string;
  alternatePhone?: string;
  personalEmail?: string;
  currentAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  permanentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  joiningDate?: string;
  employmentType?: string;
  workLocation?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  departmentId?: string;
  designationId?: string;
  managerId?: string;
};

type EmployeeProfile = {
  email: string;
  firstName: string;
  lastName: string;
  gender?: Gender;
  dateOfBirth?: Date;
  bloodGroup?: BloodGroup;
  maritalStatus?: MaritalStatus;
  fatherOrSpouseName?: string;
  phone?: string;
  alternatePhone?: string;
  personalEmail?: string;
  currentAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  permanentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  joiningDate: Date;
  employmentType: EmploymentType;
  workLocation?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  departmentId?: string;
  designationId?: string;
  managerId?: string;
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function requireText(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new BadRequestException(`${label} is required`);
  return trimmed;
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function parseDate(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new BadRequestException(`${label} is required`);
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid`);
  return date;
}

function enumValue<T extends Record<string, string>>(en: T, value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed || !(Object.values(en) as string[]).includes(trimmed)) {
    throw new BadRequestException(`Select a valid ${label.toLowerCase()}`);
  }
  return trimmed as T[keyof T];
}

function formatEmployeeCode(n: number) {
  return `GS-${String(n).padStart(3, '0')}`;
}

function assertUpload(file?: { buffer?: Buffer; mimetype?: string; size?: number }) {
  if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload');
  if ((file.size || 0) > 15 * 1024 * 1024) {
    throw new BadRequestException('Each file must be 15 MB or smaller');
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
  if (!file.mimetype || !allowed.has(file.mimetype)) {
    throw new BadRequestException('Upload a PDF, image, or Word document');
  }
}

function documentKind(value?: string) {
  const kind = value?.trim();
  if (!kind || !(Object.values(LifecycleDocumentKind) as string[]).includes(kind)) {
    throw new BadRequestException('Choose a document type for each verification file');
  }
  return kind as LifecycleDocumentKind;
}

function buildEmployeeProfile(data: EmployeeCreateInput, strict: boolean): EmployeeProfile {
  const firstName = requireText(data.firstName, 'First name');
  const lastName = requireText(data.lastName, 'Last name');
  const email = requireText(data.email, 'Work email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Enter a valid work email');
  }

  if (!strict) {
    return {
      email,
      firstName,
      lastName,
      phone: clean(data.phone),
      joiningDate: data.joiningDate ? parseDate(data.joiningDate, 'Joining date') : new Date(),
      departmentId: clean(data.departmentId),
      designationId: clean(data.designationId),
      managerId: clean(data.managerId),
      dateOfBirth: data.dateOfBirth ? parseDate(data.dateOfBirth, 'Date of birth') : undefined,
      employmentType: EmploymentType.FULL_TIME,
    };
  }

  const phone = digits(requireText(data.phone, 'Phone'));
  if (phone.length < 10) throw new BadRequestException('Enter a valid phone number');
  const emergencyPhone = digits(requireText(data.emergencyContactPhone, 'Emergency contact phone'));
  if (emergencyPhone.length < 10) {
    throw new BadRequestException('Enter a valid emergency contact phone');
  }
  const aadhaarNumber = digits(requireText(data.aadhaarNumber, 'Aadhaar number'));
  if (!/^\d{12}$/.test(aadhaarNumber)) {
    throw new BadRequestException('Aadhaar number must be 12 digits');
  }
  const panNumber = requireText(data.panNumber, 'PAN').toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    throw new BadRequestException('Enter a valid PAN (for example ABCDE1234F)');
  }
  const pincode = requireText(data.pincode, 'PIN code');
  if (!/^\d{6}$/.test(pincode)) throw new BadRequestException('PIN code must be 6 digits');
  const personalEmail = clean(data.personalEmail)?.toLowerCase();
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
    throw new BadRequestException('Enter a valid personal email');
  }
  const alternatePhone = clean(data.alternatePhone);
  if (alternatePhone && digits(alternatePhone).length < 10) {
    throw new BadRequestException('Enter a valid alternate phone');
  }
  const bankIfsc = clean(data.bankIfsc)?.toUpperCase();
  if (bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
    throw new BadRequestException('Enter a valid IFSC');
  }
  const currentAddress = requireText(data.currentAddress, 'Current address');

  return {
    email,
    firstName,
    lastName,
    gender: enumValue(Gender, data.gender, 'Gender'),
    dateOfBirth: parseDate(data.dateOfBirth, 'Date of birth'),
    bloodGroup: data.bloodGroup ? enumValue(BloodGroup, data.bloodGroup, 'Blood group') : undefined,
    maritalStatus: data.maritalStatus
      ? enumValue(MaritalStatus, data.maritalStatus, 'Marital status')
      : undefined,
    fatherOrSpouseName: clean(data.fatherOrSpouseName),
    phone,
    alternatePhone: alternatePhone ? digits(alternatePhone) : undefined,
    personalEmail,
    currentAddress,
    city: requireText(data.city, 'City'),
    state: requireText(data.state, 'State'),
    pincode,
    permanentAddress: clean(data.permanentAddress) || currentAddress,
    emergencyContactName: requireText(data.emergencyContactName, 'Emergency contact name'),
    emergencyContactPhone: emergencyPhone,
    emergencyContactRelation: clean(data.emergencyContactRelation),
    aadhaarNumber,
    panNumber,
    joiningDate: parseDate(data.joiningDate, 'Joining date'),
    employmentType: enumValue(EmploymentType, data.employmentType || EmploymentType.FULL_TIME, 'Employment type'),
    workLocation: clean(data.workLocation),
    bankName: clean(data.bankName),
    bankAccountNumber: clean(data.bankAccountNumber)?.replace(/\s/g, ''),
    bankIfsc,
    departmentId: requireText(data.departmentId, 'Department'),
    designationId: requireText(data.designationId, 'Designation'),
    managerId: clean(data.managerId),
  };
}

function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
