export enum RoleCode {
  OWNER = 'OWNER',
  MANAGEMENT = 'MANAGEMENT',
  HR = 'HR',
  DEPT_MANAGER = 'DEPT_MANAGER',
  TEAM_LEADER = 'TEAM_LEADER',
  EMPLOYEE = 'EMPLOYEE',
}

export enum PermissionAction {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  APPROVE = 'APPROVE',
  MANAGE = 'MANAGE',
}

export enum PermissionResource {
  EMPLOYEES = 'EMPLOYEES',
  ATTENDANCE = 'ATTENDANCE',
  LEAVE = 'LEAVE',
  TASKS = 'TASKS',
  PERFORMANCE = 'PERFORMANCE',
  COLLEAGUE_PERFORMANCE = 'COLLEAGUE_PERFORMANCE',
  REVENUE = 'REVENUE',
  ACCOUNTS = 'ACCOUNTS',
  SALES = 'SALES',
  OPERATIONS = 'OPERATIONS',
  RECRUITMENT = 'RECRUITMENT',
  POLICIES = 'POLICIES',
  BULLETIN = 'BULLETIN',
  TICKETS = 'TICKETS',
  SUGGESTIONS = 'SUGGESTIONS',
  REPORTS = 'REPORTS',
  SETTINGS = 'SETTINGS',
  INTEGRATIONS = 'INTEGRATIONS',
  ROLES = 'ROLES',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  WFH = 'WFH',
  HOLIDAY = 'HOLIDAY',
  LEAVE = 'LEAVE',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CLARIFICATION = 'CLARIFICATION',
  CANCELLED = 'CANCELLED',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
  COMPLETED_ON_TIME = 'COMPLETED_ON_TIME',
  COMPLETED_LATE = 'COMPLETED_LATE',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_FOR_EMPLOYEE = 'WAITING_FOR_EMPLOYEE',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketCategory {
  IT = 'IT',
  HR = 'HR',
  ACCOUNTS = 'ACCOUNTS',
  PAYROLL = 'PAYROLL',
  ADMIN = 'ADMIN',
  FACILITY = 'FACILITY',
  OTHER = 'OTHER',
}

export enum SuggestionStatus {
  NEW = 'NEW',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  IMPLEMENTED = 'IMPLEMENTED',
}

export enum InvoiceStatus {
  GENERATED = 'GENERATED',
  PAID = 'PAID',
  PENDING = 'PENDING',
  OVERDUE = 'OVERDUE',
  PARTIAL = 'PARTIAL',
}

export enum LeadStatus {
  NEW = 'NEW',
  FOLLOW_UP = 'FOLLOW_UP',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
  PENDING = 'PENDING',
}

export enum OrderStatus {
  NEW = 'NEW',
  OPEN = 'OPEN',
  PROCESSING = 'PROCESSING',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DELAYED = 'DELAYED',
  PENDING = 'PENDING',
}

export enum ExternalSourceType {
  SALES = 'SALES',
  ACCOUNTS = 'ACCOUNTS',
  REVENUE = 'REVENUE',
  OPERATIONS = 'OPERATIONS',
}

export enum IngestJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum IngestDomain {
  LEADS = 'leads',
  INVOICES = 'invoices',
  FINANCIAL = 'financial',
  ORDERS = 'orders',
  SALESPERSON_METRICS = 'salesperson-metrics',
}

export enum HolidayType {
  PUBLIC = 'PUBLIC',
  COMPANY = 'COMPANY',
  OPTIONAL = 'OPTIONAL',
  FESTIVAL = 'FESTIVAL',
}

export enum RecruitmentStatus {
  OPEN = 'OPEN',
  INTERVIEWING = 'INTERVIEWING',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  DELAYED = 'DELAYED',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  INTERN = 'INTERN',
}

export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  SCREENING = 'SCREENING',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  HIRED = 'HIRED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum OnboardingStatus {
  PENDING_OWNER = 'PENDING_OWNER',
  OFFER_LETTER = 'OFFER_LETTER',
  DOCUMENTS = 'DOCUMENTS',
  CREATE_ACCOUNT = 'CREATE_ACCOUNT',
  IT_HR_CHECKLIST = 'IT_HR_CHECKLIST',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum OffboardingStatus {
  PENDING_OWNER = 'PENDING_OWNER',
  EXIT_CLEARANCE = 'EXIT_CLEARANCE',
  FINAL_DOCUMENTS = 'FINAL_DOCUMENTS',
  REVOKE_ACCESS = 'REVOKE_ACCESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum LifecycleDocumentKind {
  ID_PROOF = 'ID_PROOF',
  ADDRESS = 'ADDRESS',
  BANK = 'BANK',
  EDUCATION = 'EDUCATION',
  PREVIOUS_PAYSLIP = 'PREVIOUS_PAYSLIP',
  FINAL_PAYSLIP = 'FINAL_PAYSLIP',
  OFFER_LETTER = 'OFFER_LETTER',
  RELIEVING_LETTER = 'RELIEVING_LETTER',
  EXPERIENCE_LETTER = 'EXPERIENCE_LETTER',
  PHOTO = 'PHOTO',
  OTHER = 'OTHER',
}

/** Interim performance weights until HR finalizes */
export const PERFORMANCE_WEIGHTS = {
  taskCompletion: 0.4,
  attendance: 0.25,
  timeliness: 0.2,
  productivity: 0.15,
} as const;

export function performanceBand(score: number): 'GREEN' | 'AMBER' | 'RED' {
  if (score >= 75) return 'GREEN';
  if (score >= 60) return 'AMBER';
  return 'RED';
}

export function invoiceAgingBucket(daysOutstanding: number): {
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  label: 'Normal' | 'Warning' | 'Overdue' | 'Critical';
} {
  if (daysOutstanding <= 30) return { bucket: '0-30', label: 'Normal' };
  if (daysOutstanding <= 60) return { bucket: '31-60', label: 'Warning' };
  if (daysOutstanding <= 90) return { bucket: '61-90', label: 'Overdue' };
  return { bucket: '90+', label: 'Critical' };
}

export const ROLE_HIERARCHY: RoleCode[] = [
  RoleCode.OWNER,
  RoleCode.MANAGEMENT,
  RoleCode.HR,
  RoleCode.DEPT_MANAGER,
  RoleCode.TEAM_LEADER,
  RoleCode.EMPLOYEE,
];
