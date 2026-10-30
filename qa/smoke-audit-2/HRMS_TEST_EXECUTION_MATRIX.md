# GoStaff HRMS test execution matrix

Commit tested: `a32f7118364e2d41864f369924b59ee6c73eca4e`
Date: 29 October 2026
Environment: local PostgreSQL 16 only (`gostaff_platform`, `gostaff_aith`, `gostaff_techthrive` on 127.0.0.1). API port 4000. Web `http://aithworld.localhost:3000`. Node 22.23.4.

Accounts used: Owner, HR, and Employee from the seed, plus Management, Department Manager (Engineering), Team Leader (Engineering), and a second Employee (Sales). Extra accounts were used for deactivation and role-change tests and then left inactive or restored.

Result words in the table are the only words counted: PASS, FAIL, BLOCKED, NOT RUN.

| ID | Case | Result | Note |
| --- | --- | --- | --- |
| SET-01 | npm install | PASS | Multer deprecation warning |
| SET-02 | Build @go-staff/shared | PASS | |
| SET-03 | prisma generate, both schemas | PASS | Deprecation warnings |
| SET-04 | Provision and seed local databases | PASS | Repo `db:provision` |
| SET-05 | Start API with npm run dev:api | PASS | Listening on port 4000 |
| SET-06 | Start web with npm run dev:web | PASS | Ready in 1.4s |
| SET-07 | Typecheck shared | PASS | |
| SET-08 | Typecheck API | PASS | |
| SET-09 | Typecheck web | PASS | |
| SET-10 | prisma validate | PASS | Schema valid |
| SET-11 | npm audit | FAIL | 3 critical, 9 high. See HRMS-SMOKE-022 |
| SET-12 | Production build of shared, API, and web | PASS | CSS autoprefixer warning |
| AUTH-01 | Sign in as Owner | PASS | |
| AUTH-02 | Sign in as Management | PASS | |
| AUTH-03 | Sign in as HR | PASS | |
| AUTH-04 | Sign in as Department Manager | PASS | |
| AUTH-05 | Sign in as Team Leader | PASS | Lands on the employee portal |
| AUTH-06 | Sign in as Employee | PASS | |
| AUTH-07 | Sign in as a second employee in Sales | PASS | |
| AUTH-08 | Wrong password | PASS | HTTP 401 |
| AUTH-09 | Unknown email | PASS | HTTP 401 |
| AUTH-10 | Malformed email | PASS | HTTP 400 |
| AUTH-11 | Invalid token | PASS | HTTP 401 |
| AUTH-12 | Expired token | PASS | HTTP 401 |
| AUTH-13 | Token with algorithm none | PASS | HTTP 401 |
| AUTH-14 | Token from Aith World used on TechThrive | PASS | HTTP 401 |
| AUTH-15 | Request with no company host | PASS | HTTP 404 |
| AUTH-16 | Logout then reuse the token | FAIL | HRMS-SMOKE-009 |
| AUTH-17 | Deactivated account, old token | FAIL | HRMS-SMOKE-009. New login is 401 |
| AUTH-18 | Role changed to Employee, old HR token | FAIL | HRMS-SMOKE-009. Allocations still 200 |
| AUTH-19 | 25 bad sign-in attempts | FAIL | HRMS-SMOKE-019. All 401, no 429 |
| AUTH-20 | Password change route | FAIL | Known gap. HTTP 404. Not a new defect |
| AUTH-21 | Password reset route | FAIL | Known gap. HTTP 404. Not a new defect |
| AUTH-22 | Microsoft sign-in completion | BLOCKED | No Entra app. Unconfigured start redirects to the login page |
| AUTH-23 | Employee changes own role to Owner | PASS | HTTP 403 |
| AUTH-24 | HR changes own role to Owner | FAIL | HRMS-SMOKE-010 |
| AUTH-25 | Management changes own role to Owner | FAIL | HRMS-SMOKE-010 |
| AUTH-26 | Hardcoded JWT secret fallback | FAIL | HRMS-SMOKE-021. Confirmed in source. Live process had a secret set |
| AUTH-27 | SQL injection in the sign-in body | PASS | HTTP 400, not 500 |
| CORS-01 | Origin https://evil.example | PASS | Not reflected |
| CORS-02 | Any localhost port with credentials | PASS | Allowed by the product code. Session is a bearer token, so this was not filed |
| CORS-03 | Any gostaff.in subdomain with credentials | PASS | Allowed by the product code for company subdomains. Not filed |
| KNOWN-001 | Employee reads another person's identity and bank fields | FAIL | Still reproduces. Not re-filed |
| KNOWN-002 | Employee and team leader list the whole roster | FAIL | Still reproduces. 10 people, email and birth date |
| KNOWN-003 | Sign-in and browser storage contain identity and bank fields | FAIL | Still reproduces. UI confirmed the storage keys |
| KNOWN-004 | Casual and sick leave on the same day | FAIL | Still reproduces. Both PENDING |
| KNOWN-004b | Two casual requests on the same day | FAIL | Same gap as 004. Not a new id |
| KNOWN-005 | Another person completes a task | FAIL | Still reproduces |
| KNOWN-006 | Another person reads performance history | FAIL | Still reproduces. 1 score row |
| KNOWN-007 | Bad ticket category | FAIL | Still HTTP 500. Body has no stack |
| KNOWN-008a | Recruitment with only a title | PASS | Now HTTP 400, asks for a department |
| KNOWN-008b | Recruitment with department and no dates | FAIL | Still HTTP 500. Known issue still open |
| AUTHZ-01 | Employee directory phone and email | FAIL | HRMS-SMOKE-020 |
| AUTHZ-02 | Employee birthday list with birth dates | FAIL | HRMS-SMOKE-020 |
| AUTHZ-03 | Department manager attendance across departments | FAIL | HRMS-SMOKE-011. Sales rows present |
| AUTHZ-04 | Department manager opens a Sales attendance history | FAIL | HRMS-SMOKE-011. 8 rows |
| AUTHZ-05 | Department manager sees Sales pending leave | FAIL | HRMS-SMOKE-011 |
| AUTHZ-06 | Department manager sees Sales performance | FAIL | HRMS-SMOKE-011 |
| AUTHZ-07 | Department manager sees a Sales task | FAIL | HRMS-SMOKE-011 |
| AUTHZ-08 | Team leader assigns a task to Sales | FAIL | HRMS-SMOKE-011 |
| AUTHZ-09 | HR revenue report | FAIL | HRMS-SMOKE-013 |
| AUTHZ-10 | HR accounts report includes an invoice | FAIL | HRMS-SMOKE-013 |
| AUTHZ-11 | HR revenue dashboard | PASS | HTTP 403 |
| AUTHZ-12 | Employee revenue dashboard | PASS | HTTP 403 |
| AUTHZ-13 | Team leader revenue report | PASS | HTTP 403 |
| AUTHZ-14 | Employee company ticket list and update | PASS | Both HTTP 403 |
| AUTHZ-15 | Employee creates a bulletin | PASS | HTTP 403. HR create succeeded |
| AUTHZ-16 | Employee marks another person's notification read | PASS | Flag stayed unread |
| AUTHZ-17 | Employee cancels another person's leave | PASS | HTTP 404 |
| AUTHZ-18 | Team leader colleague scores while the switch is off | FAIL | HRMS-SMOKE-015 |
| AUTHZ-19 | Employee colleague scores while the switch is off | PASS | HTTP 403 |
| AUTHZ-20 | Employee opens /admin directly | PASS | Sent back to sign-in |
| AUTHZ-21 | Team leader opens /admin/attendance | PASS | Sent back to sign-in |
| AUTHZ-22 | Department manager opens /admin/revenue | PASS | Sent back to /admin |
| AUTHZ-23 | Owner opens revenue and Integration Hub | PASS | Pages load |
| AUTHZ-24 | Second employee task list is only their own task | PASS | One title |
| AUTHZ-25 | Platform admin lists companies | PASS | No database URL in the body |
| AUTHZ-26 | Company token calls the platform list | PASS | HTTP 401 |
| ATT-01 | Check out with no check-in | PASS | HTTP 400 |
| ATT-02 | Check in with office checks turned off | PASS | |
| ATT-03 | Second check-in the same day | PASS | HTTP 400 |
| ATT-04 | Check in again after check-out | PASS | HTTP 400 |
| ATT-05 | Working minutes after a 125 minute span | PASS | Stored 124 to 127 |
| ATT-06 | Overtime against shift end | PASS | Within 2 minutes of the expected value |
| ATT-07 | Midnight boundary between UTC and India time | NOT RUN | Server was UTC and both calendars were 29 Oct during the run |
| LEAVE-01 | End date before start date | PASS | HTTP 400 |
| LEAVE-02 | More days than the balance | PASS | HTTP 400 |
| LEAVE-03 | Leave on a public holiday | FAIL | HRMS-SMOKE-016 |
| LEAVE-04 | Approve after a completed reject | PASS | HTTP 400 |
| LEAVE-05 | Department manager approves own leave | FAIL | HRMS-SMOKE-012 |
| LEAVE-06 | Approve and reject at the same time | FAIL | HRMS-SMOKE-017. 8 of 8 both returned 200 |
| LEAVE-07 | Two approves do not double-charge | PASS | Balance increased by 1 |
| VAL-01 | Bad holiday date | FAIL | HRMS-SMOKE-018. HTTP 500 |
| VAL-02 | Bad holiday type | FAIL | HRMS-SMOKE-018. HTTP 500 |
| VAL-03 | Bad suggestion status | FAIL | HRMS-SMOKE-018. HTTP 500 |
| VAL-04 | Task with no assignee | FAIL | HRMS-SMOKE-018. HTTP 500 |
| VAL-05 | Integration source type CRM | FAIL | HRMS-SMOKE-018. HTTP 500 |
| VAL-06 | HTTP 500 body leaks a stack | PASS | Body was "Internal server error" only |
| TICKET-01 | Two identical tickets | PASS | Both stored. Treated as allowed, not a defect |
| SUG-01 | Two identical anonymous suggestions | PASS | Author was not attached. Duplicates allowed |
| SUG-02 | Script text in a bulletin executes in the browser | PASS | Shown as text. No alert dialog |
| INT-01 | Employee and HR cannot create a source | PASS | HTTP 403 |
| INT-02 | Owner creates a SALES source and receives a key | PASS | |
| INT-03 | Ingest with no key and with a bad key | PASS | Both HTTP 401 |
| INT-04 | Same invoice external id twice | PASS | One row, amount updated to 44, status PAID |
| INT-05 | Webhook with no key | PASS | HTTP 401 |
| INT-06 | Webhook with key and no secret, same external id twice | FAIL | HRMS-SMOKE-024. One row updated. Secret not checked |
| INT-07 | Invalid invoice status on ingest | NOT RUN | Not retried after the source was created |
| UI-01 | Company picker on localhost | PASS | Screenshot company-picker-1440x900.png |
| UI-02 | Sign-in page shows the company name | PASS | |
| UI-03 | Logout clears browser storage | PASS | Token and user removed |
| UI-04 | After logout, /employee returns to sign-in | PASS | |
| UI-05 | Layout at 1440x900, no sideways scroll | PASS | Login, home, leave, support |
| UI-06 | Layout at 768x1024, no sideways scroll | PASS | |
| UI-07 | Layout at 390x844, no sideways scroll | PASS | Admin dashboard included |
| UI-08 | Layout at 320x568, no sideways scroll | PASS | |
| UI-09 | Demo password inside the production login bundle | FAIL | HRMS-SMOKE-023 |
| UI-10 | Microsoft Planner tasks on the dashboard | BLOCKED | On-screen message says Microsoft sign-in is not set up. Console 403s match that |
| UI-11 | Google calendar OAuth | BLOCKED | No Google client configured |
| UI-12 | Employee document upload | BLOCKED | Supabase is not configured |
| UI-13 | Outbound email for offers and candidates | BLOCKED | No mailbox credentials |
| UI-14 | Careers public application flow | NOT RUN | Page exists. Not exercised end to end |
| UI-15 | Alerts runner | NOT RUN | Route exists. Not called |
| UI-16 | Missed clock-out for another person's row | NOT RUN | |
| UI-17 | Employee search SQL injection | NOT RUN | Sign-in SQL injection was executed instead |
| PERF-01 | 5 virtual users on GET /auth/me for 4 seconds | PASS | 2286 calls, 0 errors, p50 8 ms, p95 14 ms |
| PERF-02 | 10 virtual users | PASS | 3277 calls, 0 errors, p50 12 ms, p95 19 ms |
| PERF-03 | 20 virtual users | PASS | 4020 calls, 0 errors, p50 19 ms, p95 29 ms |

## Count

Taken from the Result column of this table.

| Result | Count |
| --- | --- |
| Executed (pass + fail + blocked) | 122 |
| Passed | 77 |
| Failed | 40 |
| Blocked | 5 |
| Not run | 6 |
| Total rows | 128 |

Of the 40 failures, 11 are the already-known issues HRMS-SMOKE-001 to HRMS-SMOKE-008, including the missing password change and reset, plus the same-day casual leave repeat of 004. The other 29 failures are the new defects HRMS-SMOKE-009 to HRMS-SMOKE-024.

Role-by-endpoint probes (6 roles by 28 routes) are saved in `evidence/role-matrix.json`. The failures from that grid are the rows above. The grid is not counted a second time.
