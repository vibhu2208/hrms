/**
 * Evidence-driven API smoke for the local GoStaff tenant.
 * Writes redacted results to ../evidence/api-results.json.
 * Does not print secrets, API keys, or identity numbers.
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(__dirname, '..', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const API = process.env.SMOKE_API || 'http://127.0.0.1:4000/api/v1';
const TENANT = 'aithworld.localhost';
const OTHER_TENANT = 'techthrive.localhost';
const JWT_SECRET = process.env.JWT_SECRET || '';
const PASSWORD = 'password123';
const DB = process.env.AITH_DATABASE_URL;

const SENSITIVE = ['999988887777', 'ABCDE1234F', '000011112222', JWT_SECRET].filter((value) => value && value.length > 6);

const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
const cases = [];

function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return text;
  text = text.replace(/gs_[A-Za-z0-9]+/g, 'gs_[redacted]');
  text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'jwt.[redacted]');
  for (const secret of SENSITIVE) text = text.split(secret).join('[redacted]');
  text = text.replace(/"passwordHash":"[^"]*"/g, '"passwordHash":"[redacted]"');
  text = text.replace(/"apiKey":"[^"]*"/g, '"apiKey":"[redacted]"');
  text = text.replace(/"secret":"[^"]*"/g, '"secret":"[redacted]"');
  text = text.replace(/"accessToken":"[^"]*"/g, '"accessToken":"[redacted]"');
  text = text.replace(/"temporaryPassword":"[^"]*"/g, '"temporaryPassword":"[redacted]"');
  if (text.length > 1800) text = text.slice(0, 1800) + '…';
  return text;
}

function record(id, title, status, detail) {
  const row = { id, title, status, detail: redact(detail) };
  cases.push(row);
  console.log(`${status.padEnd(8)} ${id} ${title}`);
}

async function raw(method, path, { token, body, headers, tenant = TENANT, origin } = {}) {
  const h = { ...(headers || {}) };
  if (tenant) h['X-Tenant-Host'] = tenant;
  if (token) h.Authorization = `Bearer ${token}`;
  if (origin) h.Origin = origin;
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const started = performance.now();
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers: h, body: payload });
  } catch (err) {
    return { status: 0, json: null, text: String(err.message), ms: Math.round(performance.now() - started), headers: {} };
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const headerDump = {};
  for (const key of ['access-control-allow-origin', 'access-control-allow-credentials', 'retry-after']) {
    const value = res.headers.get(key);
    if (value) headerDump[key] = value;
  }
  return { status: res.status, json, text, ms: Math.round(performance.now() - started), headers: headerDump };
}

function containsKyc(value) {
  const text = JSON.stringify(value || {});
  return {
    aadhaar: text.includes('999988887777'),
    pan: text.includes('ABCDE1234F'),
    bank: text.includes('000011112222'),
  };
}

async function waitForApi() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const res = await raw('GET', '/tenant/current');
    if (res.status === 200 && res.json?.slug) return res.json;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('API did not become ready');
}

async function ensureUser({ email, roleCode, first, last, code, departmentName, managerId, kyc = false }) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const department = departmentName
    ? await prisma.department.findUnique({ where: { name: departmentName } })
    : null;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, roleId: role.id },
    create: { email, passwordHash, roleId: role.id },
  });
  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    update: {
      firstName: first,
      lastName: last,
      employeeCode: code,
      departmentId: department?.id || null,
      managerId: managerId || null,
      ...(kyc
        ? { aadhaarNumber: '999988887777', panNumber: 'ABCDE1234F', bankAccountNumber: '000011112222', bankName: 'Test Bank', bankIfsc: 'TEST0000001' }
        : {}),
    },
    create: {
      userId: user.id,
      employeeCode: code,
      firstName: first,
      lastName: last,
      joiningDate: new Date('2024-01-08'),
      dateOfBirth: new Date('1992-04-04'),
      phone: '+91 90000 00000',
      departmentId: department?.id || null,
      managerId: managerId || null,
      ...(kyc
        ? { aadhaarNumber: '999988887777', panNumber: 'ABCDE1234F', bankAccountNumber: '000011112222', bankName: 'Test Bank', bankIfsc: 'TEST0000001' }
        : {}),
    },
  });
  const year = new Date().getFullYear();
  const types = await prisma.leaveType.findMany();
  for (const type of types) {
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: type.id, year } },
      update: {},
      create: {
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        allocated: type.annualAllocation,
        used: 0,
        remaining: type.annualAllocation,
      },
    });
  }
  return { user, employee, roleCode };
}

async function login(email, tenant = TENANT) {
  const res = await raw('POST', '/auth/login', { body: { email, password: PASSWORD }, tenant });
  return res;
}

function weekdayOnOrAfter(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  if (!DB) throw new Error('AITH_DATABASE_URL is required');
  const tenant = await waitForApi();
  record('BOOT-01', 'Tenant resolves on local host', 'PASS', { slug: tenant.slug, name: tenant.name });

  const ownerEmp = await prisma.employee.findFirst({
    where: { user: { email: 'connect@aithworld.com' } },
  });
  const seededEmployee = await prisma.employee.findFirst({
    where: { user: { email: 'employee@gostaff.local' } },
    include: { user: true },
  });
  await prisma.employee.update({
    where: { id: seededEmployee.id },
    data: {
      aadhaarNumber: '999988887777',
      panNumber: 'ABCDE1234F',
      bankAccountNumber: '000011112222',
      bankName: 'Test Bank',
      bankIfsc: 'TEST0000001',
      currentAddress: 'Synthetic test address',
    },
  });

  const people = {
    management: await ensureUser({ email: 'management@smoke.local', roleCode: 'MANAGEMENT', first: 'Mina', last: 'Smoke', code: 'GS-901', departmentName: 'Sales' }),
    hrClone: await ensureUser({ email: 'hrclone@smoke.local', roleCode: 'HR', first: 'Hana', last: 'Smoke', code: 'GS-902', departmentName: 'Human Resources' }),
    dept: await ensureUser({ email: 'deptmgr@smoke.local', roleCode: 'DEPT_MANAGER', first: 'Dev', last: 'Smoke', code: 'GS-903', departmentName: 'Engineering', managerId: ownerEmp.id }),
    lead: await ensureUser({ email: 'lead@smoke.local', roleCode: 'TEAM_LEADER', first: 'Lea', last: 'Smoke', code: 'GS-904', departmentName: 'Engineering', managerId: ownerEmp.id }),
    employee2: await ensureUser({ email: 'employee2@smoke.local', roleCode: 'EMPLOYEE', first: 'Eve', last: 'Smoke', code: 'GS-905', departmentName: 'Sales', kyc: true }),
    demote: await ensureUser({ email: 'demote@smoke.local', roleCode: 'HR', first: 'Dee', last: 'Smoke', code: 'GS-906', departmentName: 'Human Resources' }),
    deactivate: await ensureUser({ email: 'deactivate@smoke.local', roleCode: 'EMPLOYEE', first: 'Dax', last: 'Smoke', code: 'GS-907', departmentName: 'Sales' }),
  };

  await prisma.performanceScore.deleteMany({ where: { employeeId: seededEmployee.id } });
  await prisma.performanceScore.create({
    data: {
      employeeId: seededEmployee.id,
      periodStart: new Date('2026-09-01'),
      periodEnd: new Date('2026-09-30'),
      taskCompletion: 80,
      attendance: 90,
      timeliness: 70,
      productivity: 75,
      overall: 79,
    },
  });

  const sessions = {};
  for (const [key, email] of [
    ['owner', 'connect@aithworld.com'],
    ['hr', 'hr@gostaff.local'],
    ['employee', 'employee@gostaff.local'],
    ['management', 'management@smoke.local'],
    ['hrClone', 'hrclone@smoke.local'],
    ['dept', 'deptmgr@smoke.local'],
    ['lead', 'lead@smoke.local'],
    ['employee2', 'employee2@smoke.local'],
    ['demote', 'demote@smoke.local'],
    ['deactivate', 'deactivate@smoke.local'],
  ]) {
    const res = await login(email);
    if (res.status !== 201 && res.status !== 200) {
      record('AUTH-LOGIN-' + key, `Login ${key}`, 'FAIL', { status: res.status, body: res.text });
      throw new Error(`Login failed for ${email}`);
    }
    sessions[key] = {
      token: res.json.accessToken,
      user: res.json.user,
      kyc: containsKyc(res.json),
      employeeId: res.json.user?.employee?.id,
      role: res.json.user?.role?.code,
    };
    record('AUTH-LOGIN-' + key, `Login ${key}`, 'PASS', { status: res.status, role: res.json.user?.role?.code, kyc: containsKyc(res.json) });
  }

  const bad = await raw('POST', '/auth/login', { body: { email: 'employee@gostaff.local', password: 'wrong-password' } });
  record('AUTH-02', 'Wrong password is rejected', bad.status === 401 ? 'PASS' : 'FAIL', { status: bad.status, message: bad.json?.message });

  const unknown = await raw('POST', '/auth/login', { body: { email: 'nobody@smoke.local', password: 'wrong-password' } });
  record('AUTH-03', 'Unknown user is rejected', unknown.status === 401 ? 'PASS' : 'FAIL', { status: unknown.status, message: unknown.json?.message });

  const empty = await raw('POST', '/auth/login', { body: { email: 'not-an-email', password: '' } });
  record('AUTH-04', 'Malformed login is rejected', empty.status === 400 ? 'PASS' : 'FAIL', { status: empty.status, message: empty.json?.message });

  const sqli = await raw('POST', '/auth/login', { body: { email: "' OR 1=1 --", password: "' OR '1'='1" } });
  record('SEC-SQLI-01', 'SQL injection in login does not 500', sqli.status === 400 || sqli.status === 401 ? 'PASS' : 'FAIL', { status: sqli.status, message: sqli.json?.message });

  const junk = await raw('GET', '/auth/me', { token: 'not-a-jwt' });
  record('AUTH-05', 'Invalid JWT is rejected', junk.status === 401 ? 'PASS' : 'FAIL', { status: junk.status });

  const expired = jwt.sign(
    { sub: sessions.employee.user.id, email: 'employee@gostaff.local', role: 'EMPLOYEE', employeeId: sessions.employee.employeeId, tenantSlug: 'aithworld' },
    JWT_SECRET,
    { expiresIn: -10 },
  );
  const expiredRes = await raw('GET', '/auth/me', { token: expired });
  record('AUTH-06', 'Expired JWT is rejected', expiredRes.status === 401 ? 'PASS' : 'FAIL', { status: expiredRes.status });

  const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: sessions.employee.user.id, role: 'OWNER', tenantSlug: 'aithworld' })).toString('base64url')}.`;
  const noneRes = await raw('GET', '/auth/me', { token: none });
  record('AUTH-07', 'alg=none JWT is rejected', noneRes.status === 401 ? 'PASS' : 'FAIL', { status: noneRes.status });

  const me = await raw('GET', '/auth/me', { token: sessions.employee.token });
  record('AUTH-08', 'Logout is client-only; token still works', me.status === 200 ? 'FAIL' : 'PASS', {
    note: 'No POST /auth/logout exists. After the UI clears localStorage this same bearer token was sent again.',
    status: me.status,
    role: me.json?.role?.code,
  });

  const cross = await raw('GET', '/auth/me', { token: sessions.employee.token, tenant: OTHER_TENANT });
  record('AUTH-09', 'Token from one company is rejected by another', cross.status === 401 ? 'PASS' : 'FAIL', { status: cross.status, message: cross.json?.message });

  const noTenant = await raw('GET', '/auth/me', { token: sessions.employee.token, tenant: '' });
  record('AUTH-10', 'Missing company host is rejected', noTenant.status === 404 || noTenant.status === 401 ? 'PASS' : 'FAIL', { status: noTenant.status, message: noTenant.json?.message });

  const rateCodes = [];
  const rateStarted = Date.now();
  await Promise.all(Array.from({ length: 25 }, async () => {
    const res = await raw('POST', '/auth/login', { body: { email: 'employee@gostaff.local', password: 'wrong-password' } });
    rateCodes.push(res.status);
  }));
  const rateHist = rateCodes.reduce((acc, code) => ({ ...acc, [code]: (acc[code] || 0) + 1 }), {});
  record('SEC-RATE-01', 'Login burst is rate limited', rateCodes.some((code) => code === 429) ? 'PASS' : 'FAIL', {
    attempts: rateCodes.length,
    elapsedMs: Date.now() - rateStarted,
    statuses: rateHist,
  });

  const evil = await raw('GET', '/tenant/current', { origin: 'https://evil.example' });
  record('SEC-CORS-01', 'Unrelated origin is not reflected', evil.headers['access-control-allow-origin'] ? 'FAIL' : 'PASS', evil.headers);

  const localEvil = await raw('GET', '/tenant/current', { origin: 'http://localhost:5999' });
  record('SEC-CORS-02', 'Any localhost port is allowed with credentials', localEvil.headers['access-control-allow-origin'] === 'http://localhost:5999' ? 'FAIL' : 'PASS', localEvil.headers);

  const gostaff = await raw('GET', '/tenant/current', { origin: 'https://attacker.gostaff.in' });
  record('SEC-CORS-03', 'Any gostaff.in subdomain is allowed', gostaff.headers['access-control-allow-origin'] === 'https://attacker.gostaff.in' ? 'FAIL' : 'PASS', gostaff.headers);

  const change = await raw('POST', '/auth/change-password', { token: sessions.employee.token, body: { currentPassword: PASSWORD, newPassword: 'new-password-1' } });
  const forgot = await raw('POST', '/auth/forgot-password', { body: { email: 'employee@gostaff.local' } });
  record('AUTH-11', 'Password change and reset routes', 'INFO', { change: change.status, forgot: forgot.status });

  const ms = await raw('GET', '/auth/microsoft?host=aithworld.localhost:3000');
  record('AUTH-12', 'Microsoft sign-in without Entra config', 'BLOCKED', { status: ms.status, locationHint: (ms.text || '').slice(0, 180) });

  // Known issue retests
  const otherProfile = await raw('GET', `/employees/${seededEmployee.id}`, { token: sessions.employee2.token });
  const kyc = containsKyc(otherProfile.json);
  record('RE-001', 'Employee can read another employee KYC', otherProfile.status === 200 && (kyc.aadhaar || kyc.pan || kyc.bank) ? 'FAIL' : 'PASS', { status: otherProfile.status, kyc });

  const roster = await raw('GET', '/employees', { token: sessions.employee.token });
  const rosterLead = await raw('GET', '/employees', { token: sessions.lead.token });
  record('RE-002', 'Employee and team leader can list the roster', roster.status === 200 && rosterLead.status === 200 ? 'FAIL' : 'PASS', {
    employee: roster.status,
    teamLeader: rosterLead.status,
    employeeCount: Array.isArray(roster.json) ? roster.json.length : null,
    sampleHasEmail: Array.isArray(roster.json) ? roster.json.some((row) => row.user?.email) : null,
    sampleHasDob: Array.isArray(roster.json) ? roster.json.some((row) => row.dateOfBirth) : null,
  });

  record('RE-003', 'Login payload includes KYC fields', sessions.employee.kyc.aadhaar || sessions.employee.kyc.pan || sessions.employee.kyc.bank ? 'FAIL' : 'PASS', sessions.employee.kyc);

  const types = await raw('GET', '/leave/types', { token: sessions.employee.token });
  const cl = types.json.find((row) => row.code === 'CL');
  const sl = types.json.find((row) => row.code === 'SL');
  const overlapStart = weekdayOnOrAfter('2026-11-16');
  const both = await Promise.all([
    raw('POST', '/leave/apply', { token: sessions.employee.token, body: { leaveTypeId: cl.id, startDate: overlapStart, endDate: overlapStart, reason: 'smoke casual' } }),
    raw('POST', '/leave/apply', { token: sessions.employee.token, body: { leaveTypeId: sl.id, startDate: overlapStart, endDate: overlapStart, reason: 'smoke sick' } }),
  ]);
  record('RE-004', 'Casual and sick leave on the same day both stay pending', both.every((row) => row.status === 201) ? 'FAIL' : 'PASS', {
    casual: both[0].status,
    sick: both[1].status,
    casualState: both[0].json?.status,
    sickState: both[1].json?.status,
  });

  const sameType = await raw('POST', '/leave/apply', { token: sessions.employee.token, body: { leaveTypeId: cl.id, startDate: overlapStart, endDate: overlapStart, reason: 'smoke casual again' } });
  record('LEAVE-OVERLAP-SAME', 'Second casual request on the same day', sameType.status === 201 ? 'FAIL' : 'PASS', { status: sameType.status, state: sameType.json?.status, message: sameType.json?.message });

  const task = await raw('POST', '/tasks', {
    token: sessions.owner.token,
    body: { title: 'Smoke checklist', description: 'qa', assigneeId: sessions.employee.employeeId, dueDate: '2026-12-31', isChecklist: true, checklistItems: ['Step A'] },
  });
  const completeOther = await raw('PATCH', `/tasks/${task.json?.id}/complete`, { token: sessions.employee2.token });
  record('RE-005', 'Another employee can complete a task they do not own', completeOther.status === 200 ? 'FAIL' : 'PASS', { status: completeOther.status, newStatus: completeOther.json?.status });

  const itemId = task.json?.checklistItems?.[0]?.id;
  const toggle = itemId
    ? await raw('PATCH', `/tasks/${task.json.id}/items/${itemId}`, { token: sessions.employee2.token, body: { completed: true } })
    : { status: 0, json: null };
  const itemRow = itemId ? await prisma.checklistItem.findUnique({ where: { id: itemId } }) : null;
  record('TASK-01', 'Another employee can tick a checklist item they do not own', toggle.status === 200 && itemRow?.completed ? 'FAIL' : 'PASS', { status: toggle.status, completed: itemRow?.completed });

  const history = await raw('GET', `/performance/history/${seededEmployee.id}`, { token: sessions.employee2.token });
  record('RE-006', 'Employee can read another employee performance history', history.status === 200 && Array.isArray(history.json) && history.json.length > 0 ? 'FAIL' : 'PASS', { status: history.status, rows: Array.isArray(history.json) ? history.json.length : null });

  const badTicket = await raw('POST', '/tickets', { token: sessions.employee.token, body: { subject: 'x', description: 'y', category: 'NOT_A_CATEGORY' } });
  record('RE-007', 'Invalid ticket category', badTicket.status === 500 ? 'FAIL' : 'PASS', { status: badTicket.status, message: badTicket.json?.message, hasStack: Boolean(badTicket.json?.stack) || /prisma|at \//i.test(badTicket.text || '') });

  const badJob = await raw('POST', '/recruitment', { token: sessions.hr.token, body: { title: 'Smoke role' } });
  record('RE-008', 'Recruitment create without dates', badJob.status === 500 ? 'FAIL' : 'PASS', { status: badJob.status, message: badJob.json?.message, hasStack: Boolean(badJob.json?.stack) || /prisma|Invalid Date/i.test(badJob.text || '') });

  // Scope matrix
  const matrixTargets = [
    ['GET', '/employees', null],
    ['GET', `/employees/${seededEmployee.id}`, null],
    ['GET', '/directory', null],
    ['GET', '/birthdays?days=400', null],
    ['GET', '/attendance', null],
    ['GET', `/attendance/employee/${seededEmployee.id}`, null],
    ['GET', '/leave/pending', null],
    ['GET', '/leave/overview', null],
    ['GET', '/leave/allocations', null],
    ['GET', '/tasks', null],
    ['GET', '/performance', null],
    ['GET', `/performance/history/${seededEmployee.id}`, null],
    ['GET', '/performance/colleagues', null],
    ['GET', '/dashboard/overview', null],
    ['GET', '/dashboard/revenue', null],
    ['GET', '/dashboard/accounts', null],
    ['GET', '/dashboard/sales', null],
    ['GET', '/dashboard/operations', null],
    ['GET', '/reports/revenue', null],
    ['GET', '/reports/accounts', null],
    ['GET', '/reports/hr-attendance', null],
    ['GET', '/integrations/sources', null],
    ['GET', '/tickets', null],
    ['GET', '/suggestions', null],
    ['GET', '/announcements', null],
    ['GET', '/policies', null],
    ['GET', '/settings', null],
    ['GET', '/notifications', null],
  ];
  const matrix = {};
  for (const role of ['owner', 'management', 'hr', 'dept', 'lead', 'employee']) {
    matrix[role] = {};
    for (const [method, path] of matrixTargets) {
      const res = await raw(method, path, { token: sessions[role].token });
      matrix[role][`${method} ${path}`] = res.status;
    }
  }
  writeFileSync(join(evidenceDir, 'role-matrix.json'), JSON.stringify(matrix, null, 2));
  record('AUTHZ-MATRIX', 'Role by endpoint status matrix saved', 'INFO', { file: 'role-matrix.json' });

  const directory = await raw('GET', '/directory', { token: sessions.employee.token });
  const directoryLeak = Array.isArray(directory.json) && directory.json.some((row) => row.user?.email || row.phone);
  record('AUTHZ-DIR', 'Employee directory returns phone and email', directory.status === 200 && directoryLeak ? 'FAIL' : 'PASS', {
    status: directory.status,
    count: Array.isArray(directory.json) ? directory.json.length : null,
    hasEmail: Array.isArray(directory.json) ? directory.json.some((row) => row.user?.email) : null,
    hasPhone: Array.isArray(directory.json) ? directory.json.some((row) => row.phone) : null,
  });

  const birthdays = await raw('GET', '/birthdays?days=400', { token: sessions.employee.token });
  record('AUTHZ-BDAY', 'Employee birthday list returns dates of birth', birthdays.status === 200 && Array.isArray(birthdays.json) && birthdays.json.some((row) => row.dateOfBirth) ? 'FAIL' : 'PASS', {
    status: birthdays.status,
    count: Array.isArray(birthdays.json) ? birthdays.json.length : null,
  });

  const deptAttendance = await raw('GET', '/attendance', { token: sessions.dept.token });
  const deptSeesSales = Array.isArray(deptAttendance.json) && deptAttendance.json.some((row) => {
    const name = `${row.employee?.firstName || ''} ${row.employee?.lastName || ''}`;
    return name.includes('Eve') || name.includes('Mina') || (row.employee?.department && row.employee.department !== 'Engineering');
  });
  record('AUTHZ-DEPT-ATT', 'Department manager attendance list is company-wide', deptAttendance.status === 200 ? 'FAIL' : 'PASS', {
    status: deptAttendance.status,
    rows: Array.isArray(deptAttendance.json) ? deptAttendance.json.length : null,
    seesOtherDepartment: deptSeesSales,
    note: 'Engineering manager called GET /attendance with no department filter.',
  });

  const deptOther = await raw('GET', `/attendance/employee/${people.employee2.employee.id}`, { token: sessions.dept.token });
  record('AUTHZ-DEPT-ATT-ID', 'Department manager can open a Sales employee attendance history', deptOther.status === 200 ? 'FAIL' : 'PASS', { status: deptOther.status });

  const deptLeave = await raw('GET', '/leave/pending', { token: sessions.dept.token });
  const pendingEmployees = Array.isArray(deptLeave.json) ? [...new Set(deptLeave.json.map((row) => row.employee?.department?.name).filter(Boolean))] : [];
  record('AUTHZ-DEPT-LEAVE', 'Department manager sees pending leave outside Engineering', deptLeave.status === 200 ? 'FAIL' : 'PASS', {
    status: deptLeave.status,
    departments: pendingEmployees,
    count: Array.isArray(deptLeave.json) ? deptLeave.json.length : null,
  });

  const deptTasks = await raw('GET', '/tasks', { token: sessions.dept.token });
  const taskAssignees = Array.isArray(deptTasks.json) ? [...new Set(deptTasks.json.map((row) => row.assignee?.department?.name).filter(Boolean))] : [];
  record('AUTHZ-DEPT-TASK', 'Department manager sees tasks outside their department', deptTasks.status === 200 && taskAssignees.length ? 'INFO' : 'INFO', {
    status: deptTasks.status,
    departments: taskAssignees,
    count: Array.isArray(deptTasks.json) ? deptTasks.json.length : null,
  });

  const deptPerf = await raw('GET', '/performance', { token: sessions.dept.token });
  record('AUTHZ-DEPT-PERF', 'Department manager performance list', deptPerf.status === 200 ? 'FAIL' : 'PASS', {
    status: deptPerf.status,
    count: Array.isArray(deptPerf.json) ? deptPerf.json.length : null,
  });

  const hrRevenue = await raw('GET', '/reports/revenue', { token: sessions.hr.token });
  const hrDash = await raw('GET', '/dashboard/revenue', { token: sessions.hr.token });
  record('AUTHZ-HR-REV', 'HR can pull the revenue report', hrRevenue.status === 200 ? 'FAIL' : 'PASS', {
    report: hrRevenue.status,
    dashboard: hrDash.status,
    reportKeys: hrRevenue.json ? Object.keys(hrRevenue.json) : [],
  });

  const empRevenue = await raw('GET', '/dashboard/revenue', { token: sessions.employee.token });
  const leadRevenue = await raw('GET', '/reports/revenue', { token: sessions.lead.token });
  record('AUTHZ-EMP-REV', 'Employee and team leader are blocked from revenue', empRevenue.status === 403 && leadRevenue.status === 403 ? 'PASS' : 'FAIL', { employee: empRevenue.status, teamLeader: leadRevenue.status });

  const selfRole = await raw('PATCH', `/employees/${people.hrClone.employee.id}`, { token: sessions.hrClone.token, body: { roleCode: 'OWNER' } });
  const hrCloneAfter = await prisma.user.findUnique({ where: { email: 'hrclone@smoke.local' }, include: { role: true } });
  record('AUTHZ-ESC-HR', 'HR user can grant themselves Owner', selfRole.status === 200 && hrCloneAfter.role.code === 'OWNER' ? 'FAIL' : 'PASS', { status: selfRole.status, roleAfter: hrCloneAfter.role.code });
  if (hrCloneAfter.role.code === 'OWNER') {
    const hrRole = await prisma.role.findUniqueOrThrow({ where: { code: 'HR' } });
    await prisma.user.update({ where: { email: 'hrclone@smoke.local' }, data: { roleId: hrRole.id } });
  }

  const empEsc = await raw('PATCH', `/employees/${sessions.employee.employeeId}`, { token: sessions.employee.token, body: { roleCode: 'OWNER' } });
  record('AUTHZ-ESC-EMP', 'Employee cannot change their own role', empEsc.status === 403 ? 'PASS' : 'FAIL', { status: empEsc.status, message: empEsc.json?.message });

  const mgmtEsc = await raw('PATCH', `/employees/${people.management.employee.id}`, { token: sessions.management.token, body: { roleCode: 'OWNER' } });
  const mgmtAfter = await prisma.user.findUnique({ where: { email: 'management@smoke.local' }, include: { role: true } });
  record('AUTHZ-ESC-MGMT', 'Management can grant themselves Owner', mgmtEsc.status === 200 && mgmtAfter.role.code === 'OWNER' ? 'FAIL' : 'PASS', { status: mgmtEsc.status, roleAfter: mgmtAfter.role.code });
  if (mgmtAfter.role.code === 'OWNER') {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'MANAGEMENT' } });
    await prisma.user.update({ where: { email: 'management@smoke.local' }, data: { roleId: role.id } });
    const refreshed = await login('management@smoke.local');
    sessions.management.token = refreshed.json.accessToken;
  }

  // Demotion does not revoke the old token
  const demoteAlloc = await raw('GET', '/leave/allocations', { token: sessions.demote.token });
  const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: 'EMPLOYEE' } });
  await prisma.user.update({ where: { email: 'demote@smoke.local' }, data: { roleId: employeeRole.id } });
  const demoteAfter = await raw('GET', '/leave/allocations', { token: sessions.demote.token });
  const demoteMe = await raw('GET', '/auth/me', { token: sessions.demote.token });
  record('AUTH-STALE-ROLE', 'Old token keeps HR access after the role is changed to Employee', demoteAlloc.status === 200 && demoteAfter.status === 200 ? 'FAIL' : 'PASS', {
    before: demoteAlloc.status,
    after: demoteAfter.status,
    meRole: demoteMe.json?.role?.code,
  });

  const deactBefore = await raw('GET', '/auth/me', { token: sessions.deactivate.token });
  await prisma.user.update({ where: { email: 'deactivate@smoke.local' }, data: { isActive: false } });
  const deactAfter = await raw('GET', '/auth/me', { token: sessions.deactivate.token });
  const deactLogin = await login('deactivate@smoke.local');
  record('AUTH-DEACT', 'Deactivated user token still works', deactBefore.status === 200 && deactAfter.status === 200 && deactLogin.status === 401 ? 'FAIL' : 'PASS', {
    before: deactBefore.status,
    after: deactAfter.status,
    freshLogin: deactLogin.status,
  });

  // Attendance
  const policy = await raw('PUT', '/attendance/config', {
    token: sessions.owner.token,
    body: {
      officeLatitude: null,
      officeLongitude: null,
      allowedRadiusMeters: 150,
      authorizedIps: [],
      requireLocation: false,
      requireNetwork: false,
      hrApprovalForExceptions: true,
      shiftStart: '09:00',
      shiftEnd: '18:00',
    },
  });
  record('ATT-CONFIG', 'Owner can turn off office checks for this local run', policy.status === 200 ? 'PASS' : 'FAIL', { status: policy.status, message: policy.json?.message });

  const noCheckIn = await raw('POST', '/attendance/check-out', { token: sessions.lead.token });
  record('ATT-01', 'Check-out without check-in is rejected', noCheckIn.status === 400 ? 'PASS' : 'FAIL', { status: noCheckIn.status, message: noCheckIn.json?.message });

  const checkIn = await raw('POST', '/attendance/check-in', { token: sessions.employee2.token, body: {} });
  record('ATT-02', 'Check-in succeeds when office checks are off', checkIn.status === 201 || checkIn.status === 200 ? 'PASS' : 'FAIL', { status: checkIn.status, message: checkIn.json?.message, state: checkIn.json?.status });

  const dup = await raw('POST', '/attendance/check-in', { token: sessions.employee2.token, body: {} });
  record('ATT-03', 'Second check-in the same day is rejected', dup.status === 400 ? 'PASS' : 'FAIL', { status: dup.status, message: dup.json?.message });

  const attendanceId = checkIn.json?.id;
  if (attendanceId) {
    const backdated = new Date(Date.now() - 125 * 60 * 1000);
    await prisma.attendance.update({ where: { id: attendanceId }, data: { checkIn: backdated } });
    const now = new Date();
    const endMinutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - 30);
    const hh = String(Math.floor(endMinutes / 60)).padStart(2, '0');
    const mm = String(endMinutes % 60).padStart(2, '0');
    await raw('PUT', '/attendance/config', {
      token: sessions.owner.token,
      body: {
        officeLatitude: null,
        officeLongitude: null,
        allowedRadiusMeters: 150,
        authorizedIps: [],
        requireLocation: false,
        requireNetwork: false,
        hrApprovalForExceptions: true,
        shiftStart: '09:00',
        shiftEnd: `${hh}:${mm}`,
      },
    });
    const out = await raw('POST', '/attendance/check-out', { token: sessions.employee2.token });
    const row = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    const expectedOt = Math.max(0, now.getHours() * 60 + now.getMinutes() - endMinutes);
    const minutesOk = row.workingMinutes >= 124 && row.workingMinutes <= 127;
    const otOk = Math.abs((row.overtimeMinutes || 0) - expectedOt) <= 2;
    record('ATT-04', 'Working minutes match the check-in to check-out gap', out.status === 201 || out.status === 200 ? (minutesOk ? 'PASS' : 'FAIL') : 'FAIL', {
      status: out.status,
      workingMinutes: row.workingMinutes,
      overtimeMinutes: row.overtimeMinutes,
      expectedOvertimeAbout: expectedOt,
      overtimeOk: otOk,
      storedDate: row.date,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    record('ATT-05', 'Overtime uses the server local clock against shift end', otOk ? 'PASS' : 'FAIL', {
      overtimeMinutes: row.overtimeMinutes,
      expectedOvertimeAbout: expectedOt,
      shiftEnd: `${hh}:${mm}`,
    });
    const third = await raw('POST', '/attendance/check-in', { token: sessions.employee2.token, body: {} });
    record('ATT-06', 'Check-in after check-out on the same day', third.status === 400 ? 'PASS' : 'FAIL', { status: third.status, message: third.json?.message });
  }

  const stored = await prisma.attendance.findFirst({ where: { employeeId: people.employee2.employee.id }, orderBy: { date: 'desc' } });
  record('ATT-TZ', 'Attendance date versus server clock', 'INFO', {
    serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: new Date().toISOString(),
    storedDate: stored?.date,
    note: 'todayDate uses the server local calendar date stored at UTC midnight. UTC and Asia/Kolkata were the same calendar day during this run, so a midnight boundary miss was not observed live.',
  });

  // Leave edges
  const endBefore = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: cl.id, startDate: '2026-12-10', endDate: '2026-12-08', reason: 'backwards' } });
  record('LEAVE-01', 'End date before start date is rejected', endBefore.status === 400 ? 'PASS' : 'FAIL', { status: endBefore.status, message: endBefore.json?.message });

  const tooMuch = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: cl.id, startDate: '2026-12-01', endDate: '2026-12-31', reason: 'too long' } });
  record('LEAVE-02', 'Request larger than the balance is rejected', tooMuch.status === 400 ? 'PASS' : 'FAIL', { status: tooMuch.status, message: tooMuch.json?.message });

  const holidayDate = weekdayOnOrAfter('2026-12-15');
  const holiday = await raw('POST', '/holidays', { token: sessions.owner.token, body: { name: 'Smoke Holiday', date: holidayDate, type: 'PUBLIC' } });
  const onHoliday = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: cl.id, startDate: holidayDate, endDate: holidayDate, reason: 'on a holiday' } });
  record('LEAVE-03', 'Leave on a company holiday is still accepted and charged', holiday.status < 300 && onHoliday.status === 201 ? 'FAIL' : 'PASS', {
    holidayStatus: holiday.status,
    leaveStatus: onHoliday.status,
    holidayDate,
    leaveState: onHoliday.json?.status,
  });

  const badHoliday = await raw('POST', '/holidays', { token: sessions.owner.token, body: { name: 'Bad', date: 'not-a-date', type: 'PUBLIC' } });
  const badHolidayType = await raw('POST', '/holidays', { token: sessions.owner.token, body: { name: 'Bad type', date: '2026-12-24', type: 'NOPE' } });
  record('VAL-HOLIDAY', 'Bad holiday date or type', badHoliday.status >= 500 || badHolidayType.status >= 500 ? 'FAIL' : 'PASS', {
    badDate: badHoliday.status,
    badType: badHolidayType.status,
    dateMessage: badHoliday.json?.message,
    typeMessage: badHolidayType.json?.message,
    dateStack: /prisma|stack/i.test(badHoliday.text || ''),
    typeStack: /prisma|stack/i.test(badHolidayType.text || ''),
  });

  const day = weekdayOnOrAfter('2026-12-02');
  const pendingLeave = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: cl.id, startDate: day, endDate: day, reason: 'to reject' } });
  const rejected = await raw('PATCH', `/leave/${pendingLeave.json?.id}/review`, { token: sessions.hr.token, body: { action: 'REJECT', note: 'no' } });
  const approveAfter = await raw('PATCH', `/leave/${pendingLeave.json?.id}/review`, { token: sessions.owner.token, body: { action: 'APPROVE' } });
  record('LEAVE-04', 'Approve after reject is rejected', rejected.status < 300 && approveAfter.status === 400 ? 'PASS' : 'FAIL', {
    reject: rejected.status,
    approveAfter: approveAfter.status,
    message: approveAfter.json?.message,
  });

  const selfDay = weekdayOnOrAfter('2026-12-03');
  const ownLeave = await raw('POST', '/leave/apply', { token: sessions.dept.token, body: { leaveTypeId: cl.id, startDate: selfDay, endDate: selfDay, reason: 'self approve' } });
  const selfApprove = await raw('PATCH', `/leave/${ownLeave.json?.id}/review`, { token: sessions.dept.token, body: { action: 'APPROVE' } });
  record('LEAVE-05', 'Department manager can approve their own leave', selfApprove.status === 200 ? 'FAIL' : 'PASS', { apply: ownLeave.status, review: selfApprove.status, state: selfApprove.json?.status });

  const otherCancel = await raw('PATCH', `/leave/${ownLeave.json?.id}/cancel`, { token: sessions.employee2.token });
  record('LEAVE-06', 'Employee cannot cancel someone else leave', otherCancel.status === 404 || otherCancel.status === 403 ? 'PASS' : 'FAIL', { status: otherCancel.status });

  let raceEvidence = [];
  for (let i = 0; i < 8; i++) {
    let raceDay = addDays('2027-01-04', i + 1);
    while (new Date(`${raceDay}T00:00:00.000Z`).getUTCDay() === 0 || new Date(`${raceDay}T00:00:00.000Z`).getUTCDay() === 6) {
      raceDay = addDays(raceDay, 1);
    }
    const created = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: sl.id, startDate: raceDay, endDate: raceDay, reason: `race ${i}` } });
    if (created.status >= 300) {
      raceEvidence.push({ i, create: created.status, message: created.json?.message });
      continue;
    }
    const id = created.json.id;
    const [approve, reject] = await Promise.all([
      raw('PATCH', `/leave/${id}/review`, { token: sessions.owner.token, body: { action: 'APPROVE' } }),
      raw('PATCH', `/leave/${id}/review`, { token: sessions.hr.token, body: { action: 'REJECT' } }),
    ]);
    const saved = await prisma.leaveRequest.findUnique({ where: { id } });
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: people.employee2.employee.id, leaveTypeId: sl.id, year: 2027 } },
    });
    const yearBalance = await prisma.leaveBalance.findFirst({
      where: { employeeId: people.employee2.employee.id, leaveTypeId: sl.id, year: new Date(raceDay).getUTCFullYear() },
    });
    raceEvidence.push({
      i,
      approve: approve.status,
      reject: reject.status,
      finalStatus: saved.status,
      used: yearBalance?.used,
      remaining: yearBalance?.remaining,
      bothAccepted: approve.status < 300 && reject.status < 300,
      rejectedButUsed: saved.status === 'REJECTED' && (yearBalance?.used || 0) > 0,
    });
  }
  const raceHit = raceEvidence.some((row) => row.bothAccepted || row.rejectedButUsed);
  record('LEAVE-07', 'Concurrent approve and reject', raceHit ? 'FAIL' : 'PASS', raceEvidence);

  const doubleDay = weekdayOnOrAfter('2027-02-02');
  const one = await raw('POST', '/leave/apply', { token: sessions.employee2.token, body: { leaveTypeId: cl.id, startDate: doubleDay, endDate: doubleDay, reason: 'double approve' } });
  const beforeBal = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId: people.employee2.employee.id, leaveTypeId: cl.id, year: 2027 } },
  });
  const parallelApprove = await Promise.all([
    raw('PATCH', `/leave/${one.json?.id}/review`, { token: sessions.owner.token, body: { action: 'APPROVE' } }),
    raw('PATCH', `/leave/${one.json?.id}/review`, { token: sessions.hr.token, body: { action: 'APPROVE' } }),
  ]);
  const afterBal = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId: people.employee2.employee.id, leaveTypeId: cl.id, year: 2027 } },
  });
  record('LEAVE-08', 'Two approvers approving the same request do not double-charge', 'INFO', {
    statuses: parallelApprove.map((row) => row.status),
    usedBefore: beforeBal?.used,
    usedAfter: afterBal?.used,
    remainingAfter: afterBal?.remaining,
  });

  // Tickets, suggestions, notifications
  const ticketA = await raw('POST', '/tickets', { token: sessions.employee.token, body: { subject: 'Smoke duplicate', description: 'first', category: 'IT' } });
  const ticketB = await raw('POST', '/tickets', { token: sessions.employee.token, body: { subject: 'Smoke duplicate', description: 'first', category: 'IT' } });
  record('TICKET-DUP', 'Identical tickets are both stored', ticketA.status === 201 && ticketB.status === 201 && ticketA.json?.id !== ticketB.json?.id ? 'INFO' : 'INFO', { a: ticketA.status, b: ticketB.status, sameId: ticketA.json?.id === ticketB.json?.id });

  const empTickets = await raw('GET', '/tickets', { token: sessions.employee.token });
  const empPatch = await raw('PATCH', `/tickets/${ticketA.json?.id}`, { token: sessions.employee.token, body: { status: 'RESOLVED' } });
  record('TICKET-AUTH', 'Employee cannot list or update the company ticket queue', empTickets.status === 403 && empPatch.status === 403 ? 'PASS' : 'FAIL', { list: empTickets.status, patch: empPatch.status });

  const sugA = await raw('POST', '/suggestions', { token: sessions.employee.token, body: { subject: '<script>alert(1)</script>', category: 'Process', description: '<img src=x onerror=alert(1)>', isAnonymous: true } });
  const sugB = await raw('POST', '/suggestions', { token: sessions.employee.token, body: { subject: '<script>alert(1)</script>', category: 'Process', description: '<img src=x onerror=alert(1)>', isAnonymous: true } });
  const sugList = await raw('GET', '/suggestions', { token: sessions.hr.token });
  const sugEmp = await raw('GET', '/suggestions', { token: sessions.employee.token });
  const reflected = Array.isArray(sugList.json) && sugList.json.some((row) => String(row.subject).includes('<script>'));
  const anonLeak = Array.isArray(sugList.json) && sugList.json.some((row) => String(row.subject).includes('<script>') && row.authorId);
  record('SUG-01', 'Anonymous suggestion HTML is stored and duplicates are allowed', 'INFO', {
    first: sugA.status,
    second: sugB.status,
    hrList: sugList.status,
    employeeList: sugEmp.status,
    htmlStored: reflected,
    anonymousAuthorAttached: anonLeak,
  });

  const badSug = await raw('PATCH', `/suggestions/${sugA.json?.id}`, { token: sessions.hr.token, body: { status: 'NOT_A_STATUS' } });
  record('VAL-SUG', 'Invalid suggestion status', badSug.status >= 500 ? 'FAIL' : 'PASS', { status: badSug.status, message: badSug.json?.message, leak: /prisma|stack/i.test(badSug.text || '') });

  const note = await prisma.notification.create({
    data: { userId: sessions.owner.user.id, title: 'Owner only', body: 'secret note', type: 'TEST' },
  });
  const markOther = await raw('PATCH', `/notifications/${note.id}/read`, { token: sessions.employee.token });
  const noteAfter = await prisma.notification.findUnique({ where: { id: note.id } });
  record('NOTIF-01', 'Employee cannot mark another user notification read', noteAfter.isRead === false ? 'PASS' : 'FAIL', { status: markOther.status, isRead: noteAfter.isRead, body: markOther.json });

  const ann = await raw('POST', '/announcements', { token: sessions.employee.token, body: { title: '<script>alert(1)</script>', body: 'xss' } });
  const annOk = await raw('POST', '/announcements', { token: sessions.hr.token, body: { title: 'Smoke bulletin', body: '<script>alert(1)</script>' } });
  record('BULL-01', 'Employee cannot publish a bulletin; HR can store HTML', ann.status === 403 && (annOk.status === 201 || annOk.status === 200) ? 'PASS' : 'FAIL', { employee: ann.status, hr: annOk.status });

  const badTask = await raw('POST', '/tasks', { token: sessions.owner.token, body: { title: 'missing assignee' } });
  record('VAL-TASK', 'Task without an assignee', badTask.status >= 500 ? 'FAIL' : 'PASS', { status: badTask.status, message: badTask.json?.message, leak: /prisma|Argument/i.test(badTask.text || '') });

  const leadAssign = await raw('POST', '/tasks', { token: sessions.lead.token, body: { title: 'Cross department task', assigneeId: people.employee2.employee.id, dueDate: '2026-12-20' } });
  record('AUTHZ-LEAD-TASK', 'Team leader can assign a task to a Sales employee', leadAssign.status === 201 ? 'FAIL' : 'PASS', { status: leadAssign.status, assigneeDepartment: 'Sales', leaderDepartment: 'Engineering' });

  // Integration hub
  const empSources = await raw('GET', '/integrations/sources', { token: sessions.employee.token });
  const hrSources = await raw('GET', '/integrations/sources', { token: sessions.hr.token });
  const src = await raw('POST', '/integrations/sources', { token: sessions.owner.token, body: { name: 'Smoke CRM', type: 'CRM' } });
  const apiKey = src.json?.apiKey;
  record('INT-01', 'Only the owner can create an integration source', empSources.status === 403 && hrSources.status === 403 && src.status < 300 && apiKey ? 'PASS' : 'FAIL', {
    employee: empSources.status,
    hr: hrSources.status,
    create: src.status,
    keyIssued: Boolean(apiKey),
  });

  const noKey = await raw('POST', '/ingest/invoices', { body: { rows: [{ external_id: 'inv-smoke-1', invoice_number: 'INV-S1', amount: 10, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-15' }] } });
  const badKey = await raw('POST', '/ingest/invoices', { headers: { 'X-API-Key': 'gs_not-a-real-key' }, body: { rows: [{ external_id: 'inv-smoke-1', invoice_number: 'INV-S1', amount: 10, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-15' }] } });
  const good = apiKey
    ? await raw('POST', '/ingest/invoices', { headers: { 'X-API-Key': apiKey }, body: { rows: [{ external_id: 'inv-smoke-1', invoice_number: 'INV-S1', amount: 10, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-15' }] } })
    : { status: 0 };
  const again = apiKey
    ? await raw('POST', '/ingest/invoices', { headers: { 'X-API-Key': apiKey }, body: { rows: [{ external_id: 'inv-smoke-1', invoice_number: 'INV-S1', amount: 77, status: 'PAID', issue_date: '2026-10-01', due_date: '2026-10-15' }] } })
    : { status: 0 };
  const invoiceCount = await prisma.invoice.count({ where: { externalId: 'inv-smoke-1' } });
  const invoice = await prisma.invoice.findFirst({ where: { externalId: 'inv-smoke-1' } });
  record('INT-02', 'Ingest requires a valid API key and duplicate external ids update', noKey.status === 401 && badKey.status === 401 && good.status < 300 && invoiceCount === 1 && Number(invoice?.amount) === 77 ? 'PASS' : 'FAIL', {
    noKey: noKey.status,
    badKey: badKey.status,
    good: good.status,
    second: again.status,
    rows: invoiceCount,
    amount: invoice ? Number(invoice.amount) : null,
    status: invoice?.status,
  });

  const hookNo = await raw('POST', '/webhooks/invoices', { body: { rows: [{ external_id: 'inv-smoke-2', invoice_number: 'INV-S2', amount: 5, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-20' }] } });
  const hook = apiKey
    ? await raw('POST', '/webhooks/invoices', { headers: { 'X-API-Key': apiKey }, body: { data: { external_id: 'inv-smoke-2', invoice_number: 'INV-S2', amount: 5, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-20' } } })
    : { status: 0 };
  const hookDup = apiKey
    ? await raw('POST', '/webhooks/invoices', { headers: { 'X-API-Key': apiKey }, body: { data: { external_id: 'inv-smoke-2', invoice_number: 'INV-S2', amount: 9, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-20' } } })
    : { status: 0 };
  const hookCount = await prisma.invoice.count({ where: { externalId: 'inv-smoke-2' } });
  record('INT-03', 'Webhook rejects a missing key and does not duplicate external ids', hookNo.status === 401 && hook.status < 300 && hookCount === 1 ? 'PASS' : 'FAIL', {
    missingKey: hookNo.status,
    withKey: hook.status,
    second: hookDup.status,
    rows: hookCount,
  });

  const webhookRow = await raw('POST', '/integrations/webhooks', { token: sessions.owner.token, body: { url: 'https://example.invalid/hook', domain: 'invoices' } });
  const listed = await raw('GET', '/integrations/webhooks', { token: sessions.owner.token });
  const secretReturned = Boolean(webhookRow.json?.secret) || (Array.isArray(listed.json) && listed.json.some((row) => row.secret));
  record('INT-04', 'Webhook secret is returned to the owner and is not required on inbound calls', secretReturned ? 'INFO' : 'INFO', {
    create: webhookRow.status,
    list: listed.status,
    secretVisible: secretReturned,
    note: 'Inbound webhook handler authenticates the API key only.',
  });

  const badStatus = apiKey
    ? await raw('POST', '/ingest/invoices', { headers: { 'X-API-Key': apiKey }, body: { rows: [{ external_id: 'inv-smoke-bad', invoice_number: 'INV-BAD', amount: 1, status: 'BANANA', issue_date: '2026-10-01', due_date: '2026-10-20' }] } })
    : { status: 0, json: null, text: '' };
  record('INT-05', 'Invalid invoice status on ingest', badStatus.status >= 500 ? 'FAIL' : 'INFO', { status: badStatus.status, body: badStatus.json || badStatus.text });

  // Platform
  const platformLogin = await raw('POST', '/platform/login', {
    tenant: '',
    body: { email: process.env.SUPERADMIN_EMAIL || 'superadmin@gostaff.local', password: process.env.SUPERADMIN_PASSWORD || '' },
  });
  const platformList = await raw('GET', '/platform/tenants', { tenant: '', token: platformLogin.json?.accessToken });
  const companyOnPlatform = await raw('GET', '/platform/tenants', { tenant: '', token: sessions.owner.token });
  const leaksUrl = JSON.stringify(platformList.json || {}).includes('postgresql://');
  record('PLAT-01', 'Platform admin can list companies without connection strings; company token cannot', platformLogin.status < 300 && platformList.status === 200 && companyOnPlatform.status === 401 && !leaksUrl ? 'PASS' : 'FAIL', {
    login: platformLogin.status,
    list: platformList.status,
    companyToken: companyOnPlatform.status,
    leaksDatabaseUrl: leaksUrl,
    companies: Array.isArray(platformList.json) ? platformList.json.map((row) => row.slug) : [],
  });

  // Perf
  const perf = {};
  for (const vus of [5, 10, 20]) {
    const samples = [];
    const started = Date.now();
    const workers = Array.from({ length: vus }, async () => {
      while (Date.now() - started < 4000) {
        const res = await raw('GET', '/auth/me', { token: sessions.owner.token });
        samples.push({ ms: res.ms, status: res.status });
      }
    });
    await Promise.all(workers);
    const times = samples.map((row) => row.ms).sort((a, b) => a - b);
    const pick = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] || 0;
    const errors = samples.filter((row) => row.status !== 200).length;
    perf[`vu${vus}`] = { requests: times.length, errors, p50: pick(50), p95: pick(95), max: times[times.length - 1] || 0 };
  }
  record('PERF-01', 'Bounded load against GET /auth/me', 'INFO', perf);

  const summary = {
    executedAt: new Date().toISOString(),
    api: API,
    tenant: TENANT,
    counts: cases.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {}),
    cases,
  };
  writeFileSync(join(evidenceDir, 'api-results.json'), JSON.stringify(summary, null, 2));
  console.log('WROTE', join(evidenceDir, 'api-results.json'));
  console.log(summary.counts);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
