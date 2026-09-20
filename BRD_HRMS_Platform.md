# Business Requirements Document (BRD)
## HRMS + Performance Management + Business Dashboard Platform

**Document Version:** 1.0
**Date:** September 15, 2026
**Prepared For:** Owner / Management
**Status:** Draft for Review

---

## 1. Executive Summary

The company requires an integrated digital platform that combines Human Resource Management (HRMS), employee performance tracking, task/delegation management, and a consolidated business intelligence dashboard covering Sales, Accounts, Operations, and HR. Today these functions are managed in a fragmented or manual way, making it difficult for the owner and management to get a single, real-time view of company performance and employee productivity.

This platform will give the **Owner/Management** a unified command center, and give **Employees** a self-service portal for attendance, leave, tasks, performance, and internal communication.

---

## 2. Business Objectives

| # | Objective | Business Value |
|---|-----------|-----------------|
| 1 | Centralize employee data, attendance, and leave management | Reduce manual HR effort and errors |
| 2 | Provide real-time visibility into employee performance | Enable data-driven appraisals and accountability |
| 3 | Consolidate revenue, profit, and accounts data into one dashboard | Faster, better-informed business decisions |
| 4 | Track sales pipeline and salesperson performance | Improve conversion rates and forecasting |
| 5 | Monitor recruitment timeliness | Reduce time-to-hire and avoid staffing gaps |
| 6 | Track operational delivery performance | Improve customer satisfaction via on-time delivery |
| 7 | Improve internal communication | Higher employee engagement and transparency |
| 8 | Flag overdue invoices (60+ days) | Improve cash flow and reduce bad debt risk |

---

## 3. Background / Business Problem

The owner currently lacks a single source of truth for:
- Who is performing well vs. underperforming, and why.
- Whether tasks and checklists delegated to employees are being completed on time.
- Real-time revenue, profit, and cash-flow position.
- Which invoices are aging beyond acceptable limits.
- Sales pipeline health and salesperson effectiveness.
- Whether open job positions are being filled on schedule.
- Operational/delivery performance against targets.

Employees, in turn, lack a self-service system to manage their own attendance, leaves, tasks, performance visibility, and internal support needs — leading to dependency on manual, email/WhatsApp-based processes.

---

## 4. Scope

### 4.1 In Scope
- Owner/Admin dashboard with company-wide visibility (performance, tasks, revenue, profit, accounts, sales, HR, operations, calendar).
- Employee self-service portal (attendance, leave, tasks, performance, directory, policies, tickets, suggestions).
- Role-based access control across the organizational hierarchy.
- Reporting and export capability (PDF/Excel) across HR, Sales, Accounts, and Operations.
- Google Calendar integration for the owner's schedule.
- Notification system for both owner and employees.

### 4.2 Out of Scope (Phase 1)
- Full CRM and ERP replacement (the platform will integrate with, not replace, existing Sales/Accounts/Operations systems where applicable).
- Payroll processing/salary disbursement (may be a future phase).
- Advanced analytics/AI-based forecasting (Phase 4+).
- Native mobile applications (unless separately scoped).

### 4.3 Business Modules Covered
1. HRMS (core)
2. Task & Delegation Management
3. Employee Performance Scoring
4. Sales Dashboard
5. Accounts/Finance Dashboard
6. Revenue & Profit Dashboard
7. Recruitment/HR Dashboard
8. Operations Dashboard
9. Internal Communication (Bulletin Board, Suggestions, Help Desk)
10. Reporting & Analytics
11. Role & Permission Management

---

## 5. Stakeholders

| Stakeholder | Role / Interest |
|---|---|
| Owner / Founder | Primary sponsor; needs full company visibility |
| Management/Department Heads | Need departmental visibility and reporting |
| HR Manager | Manages recruitment, leave, attendance, policies |
| Department Managers/Team Leaders | Assign and monitor tasks, review team performance |
| Employees | End users of self-service HR and task features |
| Accounts Team | Manages invoices, receivables, payables |
| Sales Team | Manages leads, conversions, targets |
| Operations Team | Manages orders, dispatch, delivery |
| IT/Development Team | Builds and maintains the platform |

---

## 6. Key Business Requirements

### BR-1: Employee Performance Visibility
The business must be able to view a color-coded performance score for every employee (Green ≥75%, Red <75%, with an optional Amber warning band), filterable by department, designation, employee, score, and time period.

### BR-2: Task & Delegation Accountability
The business must be able to track every task/checklist/delegated item's status (pending, completed, overdue, on-time vs. late) and identify who assigned and who is responsible for each item.

### BR-3: Financial Visibility
The business must have a single dashboard showing revenue, profit, expenses, and margin, with comparisons across custom date ranges (today, week, month, quarter, year, custom).

### BR-4: Accounts Receivable Risk Management
The business must be alerted to invoices outstanding for more than 60 days (aging buckets: 0–30, 31–60, 61–90, 90+ days), with drill-down to the underlying invoices.

### BR-5: Sales Pipeline Visibility
The business must track leads, conversions, lost leads, and salesperson performance against targets on a weekly basis.

### BR-6: Recruitment Timeliness
The business must track whether open positions are filled within target timelines, flagging delays.

### BR-7: Operational Delivery Performance
The business must track order fulfillment and on-time delivery percentage.

### BR-8: Employee Self-Service
Employees must be able to independently manage attendance, leave applications, view their performance, raise support tickets, and access company information (policies, holidays, directory, announcements) without HR intervention for routine matters.

### BR-9: Role-Based Access Control
Access to sensitive data (e.g., company revenue, colleague performance scores) must be restricted and configurable by role.

### BR-10: Notifications
Both management and employees must receive timely notifications for events relevant to their role (e.g., overdue invoice, leave approval, task deadline).

---

## 7. Success Criteria / KPIs

| KPI | Target |
|---|---|
| Reduction in manual HR administrative time | ≥ 40% |
| Owner able to access consolidated business view | Single login, real-time |
| Invoice aging visibility | 100% of invoices tracked with aging status |
| On-time task completion visibility | 100% of delegated tasks tracked |
| Employee adoption of self-service leave/attendance | ≥ 90% of employees within 3 months of launch |
| Recruitment delay visibility | 100% of open positions tracked against target hire date |

---

## 8. Assumptions

- The company has (or will set up) a Google Workspace account for calendar integration.
- Sales, Accounts, and Operations data may initially be entered manually or synced from existing tools/spreadsheets until API integrations (Phase 4) are built.
- The organization hierarchy (Owner → Management → HR → Department Manager → Team Leader → Employee) is fixed for the initial rollout but must be configurable.
- Employees will access the system primarily via web browser (desktop/mobile responsive); native apps are not required for Phase 1.

## 9. Constraints

- Budget and timeline to be defined by management (not specified in source requirements).
- Third-party API dependencies (Google Calendar, potential CRM/ERP/accounting integrations) are subject to those providers' rate limits and authentication requirements.
- Performance score calculation methodology needs to be formally defined by HR/Management before development (currently only categories are known: Task Completion, Attendance, Timeliness, Productivity).

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Performance scoring formula not clearly defined | Delays in Performance module development | Finalize scoring methodology with HR before Phase 2 build |
| Sensitive data (salary, performance) exposed to wrong roles | Compliance / trust issues | Strict role-based access control, audit logs |
| Manual data entry for Sales/Accounts/Operations in early phases | Data inaccuracy, extra workload | Prioritize API integrations in Phase 4 roadmap |
| Employee resistance to visibility of colleague performance | Morale issues | Make colleague performance visibility configurable/optional |
| Google Calendar / third-party API downtime | Dashboard data gaps | Graceful fallback UI, retry/sync logic |

---

## 11. Proposed Phased Rollout (Business View)

| Phase | Business Focus | Approx. Modules |
|---|---|---|
| Phase 1 | Core HRMS foundation | Employee profiles, attendance, leave, holidays, policies, bulletin board, roles |
| Phase 2 | Productivity & accountability | Tasks, checklists, delegation, performance scoring, help desk, suggestions, notifications |
| Phase 3 | Management visibility | Owner dashboard, revenue/profit, sales, accounts, HR/recruitment, operations dashboards, reports, calendar |
| Phase 4 | Integration & automation | CRM/ERP/accounting integrations, automated alerts, advanced analytics |

---

## 12. Approval

| Name | Role | Signature | Date |
|---|---|---|---|
| | Owner | | |
| | HR Head | | |
| | Project Lead | | |
