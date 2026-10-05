export type LeaveFrequencyCode = 'YEARLY' | 'MONTHLY' | 'QUARTERLY';
export type LeaveAllocationSource = 'employee' | 'department' | 'company';

export function periodsPerYear(frequency: LeaveFrequencyCode) {
  if (frequency === 'MONTHLY') return 12;
  if (frequency === 'QUARTERLY') return 4;
  return 1;
}

export function yearlyTotal(daysPerPeriod: number, frequency: LeaveFrequencyCode) {
  return Math.max(0, Math.trunc(daysPerPeriod)) * periodsPerYear(frequency);
}

export function calendarDays(start: Date, end: Date) {
  const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const to = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((to - from) / 86_400_000) + 1;
}

export function noticeGap(start: Date, minNoticeDays: number, today = new Date()) {
  if (minNoticeDays <= 0) return 0;
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const lead = Math.round((startUtc - todayUtc) / 86_400_000);
  return Math.max(0, minNoticeDays - lead);
}

export function carriedDays(previousRemaining: number, carryForward: boolean, maxCarryDays: number) {
  const unused = Math.max(0, previousRemaining);
  if (!carryForward || unused <= 0) return 0;
  if (maxCarryDays > 0) return Math.min(unused, maxCarryDays);
  return unused;
}

export function resolveDaysPerPeriod(input: {
  employeeId: string;
  departmentId?: string | null;
  leaveTypeId: string;
  defaultDays: number;
  allocations: Array<{ leaveTypeId: string; employeeId?: string | null; departmentId?: string | null; days: number }>;
}) {
  const personal = input.allocations.find(
    (row) => row.leaveTypeId === input.leaveTypeId && row.employeeId === input.employeeId,
  );
  if (personal) return { daysPerPeriod: personal.days, source: 'employee' as const };
  const department = input.departmentId
    ? input.allocations.find(
        (row) => row.leaveTypeId === input.leaveTypeId && row.departmentId === input.departmentId,
      )
    : undefined;
  if (department) return { daysPerPeriod: department.days, source: 'department' as const };
  return { daysPerPeriod: input.defaultDays, source: 'company' as const };
}
