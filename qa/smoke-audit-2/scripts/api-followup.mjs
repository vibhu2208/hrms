import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.AITH_DATABASE_URL } } });
const API = 'http://127.0.0.1:4000/api/v1';
const TENANT = 'aithworld.localhost';

async function call(method, path, { token, body, headers } = {}) {
  const h = { 'X-Tenant-Host': TENANT, ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 400); }
  return { status: res.status, json };
}
async function login(email) {
  const res = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
  if (!res.json?.accessToken) throw new Error('login ' + email + ' ' + res.status);
  return res.json.accessToken;
}
const out = {};
const owner = await login('connect@aithworld.com');
const dept = await login('deptmgr@smoke.local');
const lead = await login('lead@smoke.local');
const emp = await login('employee@gostaff.local');
const emp2 = await login('employee2@smoke.local');
const hr = await login('hr@gostaff.local');

const att = await call('GET', '/attendance', { token: dept });
out.deptAttendance = {
  status: att.status,
  rows: Array.isArray(att.json) ? att.json.map((row) => ({
    name: `${row.employee?.firstName || ''} ${row.employee?.lastName || ''}`.trim(),
    department: row.employee?.department || null,
    status: row.status,
  })) : att.json,
};
const salesEmp = await prisma.employee.findFirst({ where: { user: { email: 'employee2@smoke.local' } } });
const hist = await call('GET', `/attendance/employee/${salesEmp.id}`, { token: dept });
out.deptSalesHistory = { status: hist.status, rows: Array.isArray(hist.json) ? hist.json.length : hist.json, sampleStatus: hist.json?.[0]?.status || null };

const pending = await call('GET', '/leave/pending', { token: dept });
out.deptPendingLeave = {
  status: pending.status,
  rows: Array.isArray(pending.json) ? pending.json.map((row) => ({
    name: `${row.employee?.firstName || ''} ${row.employee?.lastName || ''}`.trim(),
    department: row.employee?.department?.name || null,
    type: row.leaveType?.code || null,
    status: row.status,
  })) : pending.status,
};

const engEmp = await prisma.employee.findFirst({ where: { user: { email: 'employee@gostaff.local' } } });
await prisma.performanceScore.create({
  data: {
    employeeId: salesEmp.id,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    taskCompletion: 10, attendance: 10, timeliness: 10, productivity: 10, overall: 10,
  },
});
const perf = await call('GET', '/performance', { token: dept });
out.deptPerformance = {
  status: perf.status,
  people: Array.isArray(perf.json) ? perf.json.map((row) => ({
    name: `${row.employee?.firstName || row.firstName || ''} ${row.employee?.lastName || row.lastName || ''}`.trim(),
    department: row.employee?.department?.name || row.department?.name || null,
    overall: row.overall,
  })) : perf.json,
};

const colleaguesLead = await call('GET', '/performance/colleagues', { token: lead });
const colleaguesEmp = await call('GET', '/performance/colleagues', { token: emp });
out.colleagues = {
  teamLeader: colleaguesLead.status,
  employee: colleaguesEmp.status,
  teamLeaderCount: Array.isArray(colleaguesLead.json) ? colleaguesLead.json.length : null,
  teamLeaderHasScore: Array.isArray(colleaguesLead.json) ? colleaguesLead.json.some((row) => row.overall != null) : null,
};

const tasksEmp = await call('GET', '/tasks', { token: emp2 });
out.employee2Tasks = {
  status: tasksEmp.status,
  titles: Array.isArray(tasksEmp.json) ? tasksEmp.json.map((row) => row.title) : tasksEmp.json,
};

const depts = await call('GET', '/departments', { token: hr });
const sales = (depts.json || []).find((row) => row.name === 'Sales');
const desigs = await call('GET', '/designations', { token: hr });
const desig = (desigs.json || [])[0];
const rec = await call('POST', '/recruitment', { token: hr, body: { title: 'Smoke missing dates', departmentId: sales?.id, designationId: desig?.id } });
out.recruitmentMissingDates = { status: rec.status, message: rec.json?.message || null };

const src = await call('POST', '/integrations/sources', { token: owner, body: { name: 'Smoke Sales', type: 'SALES' } });
const apiKey = src.json?.apiKey;
out.sourceCreate = { status: src.status, keyIssued: Boolean(apiKey), message: src.json?.message || null };
if (apiKey) {
  const row = { external_id: 'inv-follow-1', invoice_number: 'INV-F1', amount: 10, status: 'PENDING', issue_date: '2026-10-01', due_date: '2026-10-20' };
  const first = await call('POST', '/ingest/invoices', { headers: { 'X-API-Key': apiKey }, body: { rows: [row] } });
  const second = await call('POST', '/ingest/invoices', { headers: { 'X-API-Key': apiKey }, body: { rows: [{ ...row, amount: 44, status: 'PAID' }] } });
  const count = await prisma.invoice.count({ where: { externalId: 'inv-follow-1' } });
  const invoice = await prisma.invoice.findFirst({ where: { externalId: 'inv-follow-1' } });
  const hook = await call('POST', '/webhooks/leads', { headers: { 'X-API-Key': apiKey }, body: { data: { external_id: 'lead-follow-1', name: 'Synthetic Lead', email: 'lead@example.invalid', status: 'NEW' } } });
  const hook2 = await call('POST', '/webhooks/leads', { headers: { 'X-API-Key': apiKey }, body: { data: { external_id: 'lead-follow-1', name: 'Synthetic Lead Updated', email: 'lead@example.invalid', status: 'NEW' } } });
  const leads = await prisma.lead.count({ where: { externalId: 'lead-follow-1' } });
  out.ingest = { first: first.status, second: second.status, firstBody: first.json?.status, count, amount: invoice ? Number(invoice.amount) : null, invoiceStatus: invoice?.status, hook: hook.status, hook2: hook2.status, leads };
  const hrRev = await call('GET', '/reports/revenue', { token: hr });
  const hrAcc = await call('GET', '/reports/accounts', { token: hr });
  const text = JSON.stringify(hrAcc.json || {});
  out.hrReports = {
    revenue: hrRev.status,
    accounts: hrAcc.status,
    accountsMentionsInvoice: text.includes('INV-F1') || text.includes('44'),
    revenueKeys: hrRev.json ? Object.keys(hrRev.json.data || hrRev.json) : [],
  };
}
const settings = await call('GET', '/settings', { token: hr });
out.hrSettingsKeys = { status: settings.status, keys: settings.json && typeof settings.json === 'object' ? Object.keys(settings.json) : settings.json };

const badType = await call('POST', '/integrations/sources', { token: owner, body: { name: 'Bad type', type: 'CRM' } });
out.badSourceType = { status: badType.status, message: badType.json?.message || null };

writeFileSync('/workspace/qa/smoke-audit-2/evidence/api-followup.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
