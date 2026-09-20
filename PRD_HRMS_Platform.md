# Product Requirements Document (PRD)
## HRMS + Performance Management + Business Dashboard Platform

**Document Version:** 1.0
**Date:** September 15, 2026
**Related Document:** BRD_HRMS_Platform.md
**Status:** Draft for Review

---

## 1. Product Overview

A web-based platform with two primary experiences:
- **Owner/Admin Panel** — company-wide dashboards across Performance, Tasks, Revenue/Profit, Accounts, Sales, HR/Recruitment, and Operations, plus a Google Calendar view.
- **Employee Panel** — self-service portal for attendance, leave, tasks, performance, directory, policies, communication, and support.

Underpinned by a configurable **Role & Permission system**, a **Notification system**, and a **Reporting/Export engine**.

---

## 2. User Personas

| Persona | Description | Primary Needs |
|---|---|---|
| Owner | Top-level decision maker | Full visibility, financial + performance data, alerts |
| HR Manager | Manages people operations | Attendance, leave, recruitment, policies, performance |
| Department Manager / Team Leader | Manages a team | Team task tracking, limited employee visibility |
| Employee | General staff | Self-service HR actions, own performance, communication |
| Accounts Team | Manages invoicing/finance | Invoice status, aging, payments |
| Sales Team | Manages leads | Lead tracking, conversion, targets |

---

## 3. Functional Requirements

### 3.1 Owner Dashboard — Employee Performance

| ID | Requirement |
|---|---|
| FR-1.1 | Display performance score for every employee, color-coded: Green ≥75%, Red <75%, optional Amber warning band |
| FR-1.2 | Filter employees by Department, Designation, Employee name, Score range, Date/Period |
| FR-1.3 | View individual employee performance history (trend over time) |
| FR-1.4 | Compare employee performance across two or more periods |

**Acceptance Criteria:** Owner can select any employee and see current score, historical trend graph, and category breakdown (Task Completion, Attendance, Timeliness, Productivity) within 2 clicks from the dashboard home.

### 3.2 Owner Dashboard — Task / Checklist / Delegation

| ID | Requirement |
|---|---|
| FR-2.1 | View all employee tasks, checklists, and delegated items company-wide |
| FR-2.2 | Segment by status: Pending, Completed, Overdue, Completed on time, Completed late |
| FR-2.3 | Show assignor and assignee for every task |
| FR-2.4 | Display task completion percentage (overall and per employee/team) |

### 3.3 Revenue & Profit Dashboard

| ID | Requirement |
|---|---|
| FR-3.1 | Date filters: Today, This Week, This Month, This Quarter, This Year, Custom Range |
| FR-3.2 | Display total revenue, revenue for selected period, period-over-period comparison, revenue by department/vertical |
| FR-3.3 | Display gross profit, net profit, profit margin, expenses, revenue vs. expenses, profit trend |
| FR-3.4 | Provide graphs: revenue, profit, revenue vs. profit, monthly and weekly comparisons |

### 3.4 Accounts / Finance Dashboard

| ID | Requirement |
|---|---|
| FR-4.1 | Show total sales, purchases, receivables, payables |
| FR-4.2 | Show outstanding, paid, unpaid, and overdue invoices |
| FR-4.3 | Show revenue, expenses, profit, and cash-flow overview |
| FR-4.4 | **Invoice Aging Report** with buckets: 0–30 days (Normal), 31–60 (Warning), 61–90 (Overdue), 90+ (Critical) |
| FR-4.5 | Clicking an aging bucket count drills down to the list of underlying invoices |

### 3.5 Google Calendar Integration

| ID | Requirement |
|---|---|
| FR-5.1 | Connect owner's Google Calendar via OAuth |
| FR-5.2 | Display Today's Schedule (time-ordered list of events) |
| FR-5.3 | Display Weekly Schedule view |
| FR-5.4 | Show upcoming meetings/events/appointments |

### 3.6 Sales Dashboard

| ID | Requirement |
|---|---|
| FR-6.1 | Track number of leads: new, follow-up, converted, lost, pending |
| FR-6.2 | Calculate and display conversion rate |
| FR-6.3 | Track sales generated and lead source |
| FR-6.4 | Weekly reporting table (New Leads, Follow-ups, Converted, Lost, Pending, Conversion Rate) |
| FR-6.5 | Per-salesperson performance: leads assigned, contacted, converted, revenue generated, conversion %, target vs. achievement |

### 3.7 Accounts Dashboard (Sales-linked View)

| ID | Requirement |
|---|---|
| FR-7.1 | Show total, generated, paid, pending, overdue invoices |
| FR-7.2 | Show outstanding amount, collection amount, collection efficiency |
| FR-7.3 | Show invoice aging (shared component with FR-4.4) |

### 3.8 HR Dashboard — Recruitment

| ID | Requirement |
|---|---|
| FR-8.1 | Track open positions, applicants, interviews scheduled/completed, selected/rejected candidates, positions filled/open |
| FR-8.2 | For every open position, track: Job Opening Date, Target Hiring Date, Actual Hiring Date, Days Open, Status |
| FR-8.3 | Visually flag hiring timeliness (e.g., On Track 🟢 / Delayed 🔴) based on target vs. actual/current date |

### 3.9 Operations Dashboard

| ID | Requirement |
|---|---|
| FR-9.1 | Track total, new, open, processing, completed, cancelled, delayed orders |
| FR-9.2 | Track dispatched, delivered, pending orders |
| FR-9.3 | Calculate on-time vs. late delivery percentage |
| FR-9.4 | Display overall operations performance summary (e.g., "92% on-time") |

### 3.10 Employee Panel — Attendance

| ID | Requirement |
|---|---|
| FR-10.1 | Employee can check-in / check-out |
| FR-10.2 | Employee can view attendance history, working hours, late arrivals, early departures |
| FR-10.3 | Attendance statuses supported: Present, Absent, Late, Half Day, WFH, Holiday, Leave |

*Note: Attendance marking is flagged in source requirements as a pending decision item — confirm check-in/out method (geo, biometric, manual) before development.*

### 3.11 Leave Management

| ID | Requirement |
|---|---|
| FR-11.1 | Display leave balance by type (Allocated / Used / Remaining) |
| FR-11.2 | Employee can apply for leave: type, start date, end date, reason, optional attachment |
| FR-11.3 | Employee can check approval status and cancel eligible pending applications |
| FR-11.4 | HR/Owner can approve, reject, or request clarification on leave requests |
| FR-11.5 | HR/Owner can view leave history and department-wise leave reports |

### 3.12 Holiday Calendar

| ID | Requirement |
|---|---|
| FR-12.1 | Display public, company, optional, and festival holidays in calendar/list view |

### 3.13 Bulletin Board

| ID | Requirement |
|---|---|
| FR-13.1 | Employees can view company announcements, notices, HR updates, policy changes, events |
| FR-13.2 | HR/Owner can create, edit, delete, pin, set expiry, and attach files to announcements |

### 3.14 Company Social Media Links

| ID | Requirement |
|---|---|
| FR-14.1 | Dashboard displays links to official company social media accounts (Instagram, Facebook, LinkedIn, YouTube, X, Website, etc.) |

### 3.15 Employee Performance Score (Self-View)

| ID | Requirement |
|---|---|
| FR-15.1 | Employee can view own overall score and category breakdown (Task Completion, Attendance, Timeliness, Productivity) at any time |

### 3.16 Colleague Performance Visibility

| ID | Requirement |
|---|---|
| FR-16.1 | Employees may optionally view colleague scores (name, department, designation, score/band) |
| FR-16.2 | Visibility of colleague scores must be a configurable, owner-controlled setting (on/off, per role) |

### 3.17 Help Desk / Support Tickets

| ID | Requirement |
|---|---|
| FR-17.1 | Employee can raise a ticket with category (IT, HR, Accounts, Payroll, Admin, Facility, Other), subject, description, priority, attachment |
| FR-17.2 | Ticket status lifecycle: Open → Assigned → In Progress → Waiting for Employee → Resolved → Closed |
| FR-17.3 | Employee can track ticket status from their dashboard |

### 3.18 Suggestion Box

| ID | Requirement |
|---|---|
| FR-18.1 | Employee can submit a suggestion with subject, category, description, attachment, and optional anonymity |
| FR-18.2 | Admin can track suggestions through statuses: New, Under Review, Accepted, Rejected, Implemented |

### 3.19 Employee Directory

| ID | Requirement |
|---|---|
| FR-19.1 | Directory listing with name, photo, designation, department, official phone/email, joining date, reporting manager |

### 3.20 Employee Birthdays

| ID | Requirement |
|---|---|
| FR-20.1 | Dashboard widget showing upcoming birthdays within a configurable window (e.g., next 30 days) |

### 3.21 Company Contact Directory

| ID | Requirement |
|---|---|
| FR-21.1 | Access to department/HR/IT/Accounts/Management/emergency contact list |

### 3.22 Company Policies

| ID | Requirement |
|---|---|
| FR-22.1 | Policy library (late coming, WFH, half-day, attendance, leave, holiday, code of conduct, work hours, overtime, notice period, IT/security) |
| FR-22.2 | Each policy record includes title, description/document, effective date, version, last updated date |

### 3.23 Notification System

| ID | Requirement |
|---|---|
| FR-23.1 | Employee notifications: leave approved/rejected, new task assigned, deadline approaching/overdue, ticket updates, announcements, policy updates, birthday reminders |
| FR-23.2 | Owner notifications: employee absent/late, task overdue, leave request received, ticket raised, new suggestion, sales target missed, recruitment deadline missed, order delayed, invoice 60+ days overdue |

### 3.24 Role & Permission System

| ID | Requirement |
|---|---|
| FR-24.1 | Configurable hierarchy: Super Admin/Owner → Management → HR Manager → Department Manager → Team Leader → Employee |
| FR-24.2 | Per-feature permission matrix (view/edit/approve) configurable per role, including sensitive items (company revenue, colleague performance) |

### 3.25 Search & Filter

| ID | Requirement |
|---|---|
| FR-25.1 | Global search across employee, department, designation, task, invoice, order, lead, ticket, date |
| FR-25.2 | Filters available on all major list/table views |

### 3.26 Reporting

| ID | Requirement |
|---|---|
| FR-26.1 | Generate HR reports: attendance, leave, performance, recruitment, turnover |
| FR-26.2 | Generate Sales reports: leads, conversion, salesperson performance, revenue |
| FR-26.3 | Generate Accounts reports: invoices, outstanding, aging, payment, profit |
| FR-26.4 | Generate Operations reports: orders, delivery, delays, on-time delivery |
| FR-26.5 | All reports support View → Filter → Export (PDF/Excel) |

---

## 4. Information Architecture

### 4.1 Owner Panel Navigation
Dashboard · HRMS (Employees, Attendance, Leave, Holidays, Policies, Recruitment, Performance) · Task Management (Tasks, Checklist, Delegation, Deadlines) · Sales · Accounts · Operations · Communication (Bulletin, Suggestions, Tickets) · Reports · Settings (Roles, Permissions, Departments, Policies, Integrations)

### 4.2 Employee Panel Navigation
Home · My Attendance · My Leave · My Tasks · My Performance · Company (Holidays, Bulletin, Directory, Policies, Social Media) · Support (Tickets, Suggestions) · Profile

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard widgets should load within 2–3 seconds for standard date ranges |
| Availability | Target 99.5% uptime for production environment |
| Security | Role-based access control; encrypted storage of PII and financial data; audit logging for sensitive actions (approvals, permission changes) |
| Responsiveness | Web UI must be responsive across desktop, tablet, and mobile browsers |
| Scalability | Architecture must support growth in employee count and data volume without redesign |
| Data Privacy | Salary, performance, and personal data access restricted per role; compliance with applicable data protection regulations |
| Auditability | Track who approved/rejected leave, who assigned tasks, who edited policies/announcements |
| Integration-readiness | APIs/webhooks structured to support future CRM, ERP, and accounting integrations |

---

## 6. Integrations (Planned)

| Integration | Purpose | Phase |
|---|---|---|
| Google Calendar API | Owner schedule display | Phase 3 |
| Email service | Notifications | Phase 2 |
| WhatsApp/SMS API | Optional alerting | Phase 4 |
| Accounting/ERP API | Invoices, revenue, receivables | Phase 4 |
| CRM API | Leads and conversion data | Phase 4 |
| Order/Operations ERP API | Order and delivery data | Phase 4 |

---

## 7. Release Plan

| Phase | Modules | Key Deliverables |
|---|---|---|
| **Phase 1 – Core HRMS** | Employee login/profiles, Directory, Attendance, Leave, Holiday calendar, Bulletin board, Policies, Birthdays, Roles & permissions | Functional employee self-service base |
| **Phase 2 – Productivity** | Task management, checklists, delegation, performance scoring, help desk, suggestions, notifications | Accountability & performance visibility |
| **Phase 3 – Management Dashboards** | Owner dashboard, revenue/profit, sales, accounts, HR/recruitment, operations dashboards, reports, Google Calendar | Full management visibility |
| **Phase 4 – Integration & Automation** | CRM/ERP/accounting integrations, automated alerts, advanced analytics | Data automation, reduced manual entry |

---

## 8. Open Questions / Items Needing Decisions

1. What is the exact formula/weighting for the employee performance score (Task Completion, Attendance, Timeliness, Productivity)?
2. What method will be used for attendance marking — geo-fenced mobile check-in, biometric device, or manual web check-in?
3. Should colleague performance visibility be on by default or off by default?
4. Which accounting/CRM/ERP systems (if any) currently exist that need to be integrated with, vs. built natively?
5. What are the target hiring timelines per role/position type, used to compute recruitment "on track / delayed" status?
6. Is a native mobile app required, or is a responsive web app sufficient for Phase 1?

---

## 9. Out of Scope (Phase 1–3)

- Payroll/salary processing and disbursement
- Native mobile apps
- AI-based predictive analytics
- Full ERP/CRM replacement (only integration, not replacement)

---

## 10. Appendix — Sample Data Views

**Invoice Aging Buckets**

| Aging | Status |
|---|---|
| 0–30 days | Normal |
| 31–60 days | Warning |
| 61–90 days | Overdue |
| 90+ days | Critical |

**Role/Feature Access Matrix (sample)**

| Feature | Owner | HR | Manager | Employee |
|---|---|---|---|---|
| View all employees | ✅ | ✅ | Limited | Limited |
| Mark own attendance | — | — | — | ✅ |
| Approve leave | ✅ | ✅ | Optional | ❌ |
| View company revenue | ✅ | ❌ | ❌ | ❌ |
| View own performance score | ✅ | ✅ | ✅ | ✅ |
| View colleague score | Configurable | Configurable | Configurable | Configurable |
| Raise ticket | ✅ | ✅ | ✅ | ✅ |
| Manage policies | ✅ | ✅ | ❌ | ❌ |
