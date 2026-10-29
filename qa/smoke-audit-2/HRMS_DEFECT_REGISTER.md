# GoStaff HRMS defect register

New defects from the smoke run on commit `a32f7118364e2d41864f369924b59ee6c73eca4e`.
Known issues HRMS-SMOKE-001 through HRMS-SMOKE-008 are not repeated here. They are retested in the smoke report.

Environment for every ticket below: local PostgreSQL 16 on 127.0.0.1 only. Company host `aithworld.localhost`. API `http://127.0.0.1:4000/api/v1`. Web `http://aithworld.localhost:3000`. No remote database was used.

---

## HRMS-SMOKE-009

- **Issue ID:** HRMS-SMOKE-009
- **Title:** Signing out, turning an account off, or changing a role does not stop the old login
- **Severity:** High
- **Module:** Sign-in and sessions
- **Environment:** Local API and web, commit a32f711
- **Preconditions:** A person has signed in and the browser, or a copied request, still has the login token.
- **Reproduction Steps:**
  1. Sign in as an employee. Call `GET /auth/me` with that token. It succeeds.
  2. Click Logout in the employee portal. The browser storage is empty. Call `GET /auth/me` again with the same token.
  3. Sign in as a second employee. Mark that user inactive in the database. Call `GET /auth/me` with the old token. Try to sign in again with the password.
  4. Sign in as an HR user. Change that user's role to Employee in the database. Call `GET /leave/allocations` with the old token, then `GET /auth/me`.
- **Expected Result:** Logout, deactivation, and a role change all make the old token stop working. HR-only data is refused after the person is no longer HR.
- **Actual Result:** Logout only clears the browser. The old token still returns HTTP 200. A deactivated user's old token still returns HTTP 200, while a fresh sign-in is refused with HTTP 401. After the role change, `/auth/me` shows Employee, but `/leave/allocations` still returns HTTP 200.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` cases AUTH-08, AUTH-DEACT, AUTH-STALE-ROLE. `qa/smoke-audit-2/evidence/ui-notes.json` shows the browser token was cleared on logout.
- **Root Cause:** The API does not store a server session. Permission checks use the role written inside the token. Sign-in checks that the account is active. Later requests do not. There is no logout API.
- **Business Impact:** Someone who was dismissed, demoted, or who used a shared computer can keep using the product until the token expires. The default lifetime in the sample config is 7 days.
- **Suggested Fix:** On each request, read the user from the database. Reject inactive users. Use the role from the database, not the old token. Add a logout that invalidates outstanding tokens, or use short-lived tokens.
- **Retest Criteria:** After deactivation the old token returns 401. After HR is changed to Employee, `/leave/allocations` returns 403. After logout the same token returns 401.

---

## HRMS-SMOKE-010

- **Issue ID:** HRMS-SMOKE-010
- **Title:** An HR user or a Management user can make themselves the Owner
- **Severity:** High
- **Module:** Employees and roles
- **Environment:** Local API, commit a32f711
- **Preconditions:** An HR account and a Management account exist. Neither is the Owner.
- **Reproduction Steps:**
  1. Sign in as the HR test user.
  2. Send `PATCH /employees/{their own employee id}` with body `{ "roleCode": "OWNER" }`.
  3. Read that user's role from the database.
  4. Repeat with the Management user.
  5. Repeat with a normal Employee.
- **Expected Result:** Only an Owner can grant the Owner role. An employee cannot change roles at all.
- **Actual Result:** The HR update returned HTTP 200 and the database role became OWNER. The Management update did the same. The Employee update was refused with HTTP 403. The test put the HR and Management users back to their original roles afterward.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` cases AUTHZ-ESC-HR, AUTHZ-ESC-MGMT, AUTHZ-ESC-EMP.
- **Root Cause:** `PATCH /employees/:id` is allowed for Owner, HR, and Management, and the update saves any `roleCode` that exists, including OWNER. There is no rule that blocks self-promotion.
- **Business Impact:** HR or Management can take full control of the company, including payroll fields, integration keys, and every other person's record.
- **Suggested Fix:** Do not allow HR or Management to assign OWNER. Do not allow a person to change their own role. Record the change in the audit log and require the current Owner.
- **Retest Criteria:** HR and Management receive HTTP 403 when they set `roleCode` to OWNER, including on their own profile. Their stored role does not change. An Owner can still assign other roles.

---

## HRMS-SMOKE-011

- **Issue ID:** HRMS-SMOKE-011
- **Title:** A department manager can see other departments, and a team leader can assign work outside their department
- **Severity:** High
- **Module:** Attendance, leave, performance, tasks
- **Environment:** Local API, commit a32f711. Engineering manager `deptmgr@smoke.local`. Sales employee `employee2@smoke.local`. Engineering team leader `lead@smoke.local`.
- **Preconditions:** At least two departments have attendance, leave, tasks, and a performance score.
- **Reproduction Steps:**
  1. Sign in as the Engineering department manager.
  2. Call `GET /attendance`.
  3. Call `GET /attendance/employee/{Sales employee id}`.
  4. Call `GET /leave/pending`.
  5. Call `GET /performance`.
  6. Call `GET /tasks`.
  7. Sign in as the Engineering team leader and `POST /tasks` assigned to the Sales employee.
- **Expected Result:** A department manager sees only Engineering. A team leader can assign tasks only inside their own team or department.
- **Actual Result:** The attendance list included the Sales employee (status Late, and several Leave rows) as well as the Engineering manager. The Sales attendance history returned 8 rows. Pending leave included the Sales employee's casual leave. Performance included the Sales employee with a score of 10 and an Engineering employee with a score of 79. The task list included "Cross department task" for Sales. The team leader's create call returned HTTP 201.
- **Evidence:** `qa/smoke-audit-2/evidence/api-followup.json` keys `deptAttendance`, `deptSalesHistory`, `deptPendingLeave`, `deptPerformance`, `deptTasksAfterAssign`.
- **Root Cause:** The attendance, leave, performance, and task list handlers that allow DEPT_MANAGER do not filter by that person's department. Task create does not check that the assignee is in the team leader's department.
- **Business Impact:** A manager in one department can read another department's attendance, leave, and scores, and can see their tasks. A team leader can hand work to people they do not lead.
- **Suggested Fix:** For DEPT_MANAGER and TEAM_LEADER, limit every list and every id lookup to their department. Reject task assignment outside that department.
- **Retest Criteria:** The Engineering manager's attendance, leave, performance, and task lists contain only Engineering people. A team leader cannot create a task for a Sales employee.

---

## HRMS-SMOKE-012

- **Issue ID:** HRMS-SMOKE-012
- **Title:** A department manager can approve their own leave
- **Severity:** High
- **Module:** Leave
- **Environment:** Local API, commit a32f711
- **Preconditions:** The department manager has casual leave remaining. The date is a working day.
- **Reproduction Steps:**
  1. Sign in as the department manager.
  2. `POST /leave/apply` for one casual-leave day, 3 December 2026, with a reason.
  3. With the same token, `PATCH /leave/{that id}/review` with `{ "action": "APPROVE" }`.
- **Expected Result:** A person cannot approve their own leave. Another allowed approver has to do it.
- **Actual Result:** The apply call returned HTTP 201. The review call returned HTTP 200 and the request status was APPROVED.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` case LEAVE-05.
- **Root Cause:** `LeaveService.review` checks the role and the request status. It does not check that the approver is a different person from the applicant.
- **Business Impact:** A department manager can give themselves paid time off with no second person involved.
- **Suggested Fix:** Reject review when the approver's employee id is the same as the request's employee id.
- **Retest Criteria:** The same steps return HTTP 403 or 400, and the request stays PENDING.

---

## HRMS-SMOKE-013

- **Issue ID:** HRMS-SMOKE-013
- **Title:** HR can download revenue and accounts reports even though those dashboards are blocked
- **Severity:** High
- **Module:** Reports and finance
- **Environment:** Local API, commit a32f711. A test invoice was ingested first.
- **Preconditions:** HR is signed in. At least one invoice exists.
- **Reproduction Steps:**
  1. Sign in as HR.
  2. Call `GET /dashboard/revenue`.
  3. Call `GET /reports/revenue`.
  4. Call `GET /reports/accounts`.
- **Expected Result:** HR does not receive revenue, profit, or invoice amounts. Those screens are for Owner and Management.
- **Actual Result:** The revenue dashboard returned HTTP 403. The revenue report returned HTTP 200 and included revenue, profit, expenses, and margin fields. The accounts report returned HTTP 200 and included the test invoice.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` case AUTHZ-HR-REV. `qa/smoke-audit-2/evidence/api-followup.json` key `hrReports` (`accountsMentionsInvoice: true`). Role matrix: HR `GET /reports/accounts` and `GET /reports/revenue` are 200, while `GET /dashboard/accounts` and `GET /dashboard/revenue` are 403.
- **Root Cause:** The reports controller allows Owner, Management, and HR for every report type. The revenue and accounts dashboard routes do not allow HR. The report generator still calls the finance dashboard for the `revenue` and `accounts` types.
- **Business Impact:** HR can read company revenue, profit, and customer invoice amounts from a report link even when the finance screens are hidden.
- **Suggested Fix:** Allow finance report types only for Owner and Management. Keep HR attendance, leave, and recruitment reports on a separate allow list.
- **Retest Criteria:** HR receives HTTP 403 for `/reports/revenue` and `/reports/accounts`. Owner and Management still receive HTTP 200.

---

## HRMS-SMOKE-014

- **Issue ID:** HRMS-SMOKE-014
- **Title:** Any signed-in person can tick off someone else's checklist item
- **Severity:** High
- **Module:** Tasks
- **Environment:** Local API, commit a32f711
- **Preconditions:** A task with a checklist item is assigned to employee A. Employee B is a different person. This is separate from the already-known "complete the whole task" issue.
- **Reproduction Steps:**
  1. As the Owner, create a checklist task assigned to employee A.
  2. As employee B, `PATCH /tasks/{task id}/items/{item id}` with `{ "completed": true }`.
  3. Read the checklist item from the database.
- **Expected Result:** Only the assignee, or a manager of that task, can tick the item. Employee B is refused.
- **Actual Result:** The call returned HTTP 200. The database row was marked completed.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` case TASK-01.
- **Root Cause:** `toggleChecklistItem` updates the item by id. It never checks the caller.
- **Business Impact:** Anyone with a login can mark another person's work as done and distort task and performance numbers.
- **Suggested Fix:** Update the item only when the caller is the assignee or an allowed manager of that task.
- **Retest Criteria:** Employee B receives HTTP 403, and the item stays not completed.

---

## HRMS-SMOKE-015

- **Issue ID:** HRMS-SMOKE-015
- **Title:** Turning off colleague scores still lets a team leader see them
- **Severity:** Medium
- **Module:** Performance
- **Environment:** Local API, commit a32f711. Setting `colleague_performance_visible` is `false`.
- **Preconditions:** At least one performance score exists. The colleague-visibility setting is off.
- **Reproduction Steps:**
  1. Confirm the setting value is false.
  2. As an Employee, call `GET /performance/colleagues`.
  3. As a Team Leader, call `GET /performance/colleagues`.
- **Expected Result:** With the switch off, team leaders do not receive other people's scores. Employees are also blocked.
- **Actual Result:** The employee call returned HTTP 403. The team leader call returned HTTP 200 with 2 people and a score for each.
- **Evidence:** `qa/smoke-audit-2/evidence/api-followup.json` key `colleagues`. Database `AppSetting.colleague_performance_visible = false`, recorded in the follow-up notes.
- **Root Cause:** The colleagues handler blocks only the EMPLOYEE role when the switch is off. Every other role, including TEAM_LEADER, still receives the list.
- **Business Impact:** A privacy switch that looks off in settings does not hide scores from team leaders.
- **Suggested Fix:** When the switch is off, return scores only to Owner, HR, and Management. Require an explicit allow rule for team leaders.
- **Retest Criteria:** With the setting false, a team leader receives HTTP 403 and an empty body. With the setting true, the team leader receives the list.

---

## HRMS-SMOKE-016

- **Issue ID:** HRMS-SMOKE-016
- **Title:** Leave on a company holiday is accepted and uses up a leave day
- **Severity:** Medium
- **Module:** Leave and holidays
- **Environment:** Local API, commit a32f711
- **Preconditions:** The employee has casual leave remaining. A public holiday exists on a weekday.
- **Reproduction Steps:**
  1. As the Owner, create a public holiday on 15 December 2026 (a Tuesday).
  2. As an employee, apply for casual leave on that same day only.
- **Expected Result:** The day is not charged, or the request is refused, because the office is already closed.
- **Actual Result:** The holiday was created with HTTP 201. The leave request was created with HTTP 201 and status PENDING.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` case LEAVE-03.
- **Root Cause:** The day counter skips weekly offs only. It never reads the holiday table.
- **Business Impact:** People lose leave balance for days they were not expected to work. Payroll and attendance can disagree with the holiday calendar.
- **Suggested Fix:** Skip holiday dates in the day counter, the same way weekly offs are skipped. If the range has no working days left, reject the request.
- **Retest Criteria:** A one-day request on a public holiday is rejected, or it is stored with zero chargeable days and does not reduce the balance when approved.

---

## HRMS-SMOKE-017

- **Issue ID:** HRMS-SMOKE-017
- **Title:** Two people can approve and reject the same leave at the same time, and both calls succeed
- **Severity:** Medium
- **Module:** Leave approval
- **Environment:** Local API, commit a32f711
- **Preconditions:** A leave request is PENDING. The Owner and HR are both allowed to review it.
- **Reproduction Steps:**
  1. An employee applies for one sick-leave day.
  2. At the same moment, the Owner sends APPROVE and HR sends REJECT for that request.
  3. Repeat for 8 different days.
  4. Read the final status and the leave balance.
- **Expected Result:** One call succeeds. The other is told the request was already reviewed. The balance moves only when the final status is approved.
- **Actual Result:** In all 8 tries, both calls returned HTTP 200. The saved status was APPROVED every time, so the reject was lost. The balance went up by one used day per request, which matches the final approved status. A separate test of two APPROVE calls also both returned HTTP 200 and increased the balance only once.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` cases LEAVE-07 and LEAVE-08.
- **Root Cause:** The "is this still pending?" check happens before the database transaction. Inside the transaction the row is updated without checking the status again. Whichever write finishes last wins, and both callers are told they succeeded.
- **Business Impact:** HR can believe a request was rejected while the employee is marked approved, or the reverse, depending on timing. Two managers clicking together will not see an error.
- **Suggested Fix:** Inside the transaction, update the row only where the status is still PENDING or CLARIFICATION. If no row is updated, return a clear "already reviewed" error.
- **Retest Criteria:** Of the two simultaneous calls, exactly one returns success. The other returns HTTP 400. The stored status matches the successful call.

---

## HRMS-SMOKE-018

- **Issue ID:** HRMS-SMOKE-018
- **Title:** Bad form data on holidays, suggestions, tasks, and integration sources returns a server error
- **Severity:** Medium
- **Module:** Holidays, suggestions, tasks, Integration Hub
- **Environment:** Local API, commit a32f711
- **Preconditions:** Signed in as a user who is allowed to create the record. This ticket does not repeat the already-known ticket-category and recruitment-date errors, which still happen as well.
- **Reproduction Steps:**
  1. `POST /holidays` with date `not-a-date`.
  2. `POST /holidays` with type `NOPE`.
  3. `PATCH /suggestions/{id}` with status `NOT_A_STATUS`.
  4. `POST /tasks` with a title and no assignee.
  5. `POST /integrations/sources` with type `CRM`.
- **Expected Result:** Each call returns HTTP 400 and a short message that says what to fix. No server error.
- **Actual Result:** Each call returned HTTP 500 with the message "Internal server error". The HTTP body did not include a stack trace. The API log showed a Prisma validation error.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` cases VAL-HOLIDAY, VAL-SUG, VAL-TASK. `qa/smoke-audit-2/evidence/api-followup.json` key `badSourceType`.
- **Root Cause:** These handlers pass the body straight to Prisma. Invalid enums and missing required fields are not checked first, so Prisma throws and Nest turns that into HTTP 500.
- **Business Impact:** Users see a generic failure. Support cannot tell a bad form from a real outage. Details of the bad value are written to the server log.
- **Suggested Fix:** Validate dates, enums, and required fields before writing. Return HTTP 400 with a plain message.
- **Retest Criteria:** All five calls return HTTP 400. None return HTTP 500. A valid body still saves.

---

## HRMS-SMOKE-019

- **Issue ID:** HRMS-SMOKE-019
- **Title:** Sign-in can be tried over and over with no slowdown or lock
- **Severity:** Medium
- **Module:** Sign-in
- **Environment:** Local API, commit a32f711
- **Preconditions:** A real account exists.
- **Reproduction Steps:**
  1. Send 25 sign-in requests at the same time for a real email and a wrong password.
  2. Record the status codes.
- **Expected Result:** After a small number of failures the API returns HTTP 429 or delays the answers.
- **Actual Result:** All 25 requests returned HTTP 401. None returned HTTP 429. They finished in about 1.6 seconds.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` case SEC-RATE-01.
- **Root Cause:** The API has no rate-limit middleware. A search of the API source found no throttle guard.
- **Business Impact:** An attacker can guess passwords as fast as the server answers. The demo password is short, which makes guessing easier.
- **Suggested Fix:** Limit sign-in attempts per email and per IP. Return HTTP 429 after a small threshold. Keep the lock temporary.
- **Retest Criteria:** A burst of bad passwords produces HTTP 429 before 25 attempts, and a correct password still works after the lock expires.

---

## HRMS-SMOKE-020

- **Issue ID:** HRMS-SMOKE-020
- **Title:** Every employee can read the company phone book and birth dates
- **Severity:** Medium
- **Module:** Directory and birthdays
- **Environment:** Local API, commit a32f711
- **Preconditions:** Several employees exist, with phone numbers and birth dates. This is not the already-known employee list at `GET /employees`. These are two other addresses.
- **Reproduction Steps:**
  1. Sign in as a normal employee.
  2. Call `GET /directory`.
  3. Call `GET /birthdays?days=400`.
- **Expected Result:** A normal employee does not receive personal phone numbers or dates of birth for the whole company. A directory, if it exists, shows name, department, and work email only when that is the company policy.
- **Actual Result:** The directory returned HTTP 200 for 10 people and included phone numbers and work emails. The birthday list returned HTTP 200 for 10 people and included dates of birth.
- **Evidence:** `qa/smoke-audit-2/evidence/api-results.json` cases AUTHZ-DIR and AUTHZ-BDAY.
- **Root Cause:** Both routes are open to any signed-in user. The directory query selects phone and email. The birthday query selects date of birth.
- **Business Impact:** Any employee can copy the company phone list and birth dates. That is personal data beyond a normal directory.
- **Suggested Fix:** Remove phone numbers and birth dates from these responses for the Employee and Team Leader roles. Keep a smaller directory if the product needs one.
- **Retest Criteria:** An employee directory response has no phone field filled in, and the birthday route returns HTTP 403 or returns no date of birth.

---

## HRMS-SMOKE-021

- **Issue ID:** HRMS-SMOKE-021
- **Title:** If the JWT secret is missing, the API uses a secret that is written in the source code
- **Severity:** High
- **Module:** Sign-in
- **Environment:** Source at commit a32f711. The running test process had `JWT_SECRET` set, so this fallback was not used live. It is confirmed in the code that ships.
- **Preconditions:** The API is started without `JWT_SECRET`.
- **Reproduction Steps:**
  1. Open `apps/api/src/auth/auth.module.ts` around the JWT module setup.
  2. Open `apps/api/src/auth/jwt.strategy.ts` around the strategy constructor.
  3. Note that both use the configured secret or, when that value is empty, a fixed string in the file.
- **Expected Result:** The API refuses to start when `JWT_SECRET` is missing. Tokens cannot be signed with a secret that is in the git repository.
- **Actual Result:** Both files fall back to the same hardcoded secret. Anyone who can read the repository can forge a token if a deployment forgets the environment variable. The test server rejected a token signed with that fallback because this run set a different secret. That shows the live process was not using the fallback. It does not remove the fallback from the build.
- **Evidence:** `apps/api/src/auth/auth.module.ts` lines 17-19. `apps/api/src/auth/jwt.strategy.ts` lines 19-21.
- **Root Cause:** The secret is `config.get('JWT_SECRET')` combined with a hardcoded alternative.
- **Business Impact:** A deployment that omits the secret accepts forged Owner tokens. Combined with HRMS-SMOKE-009, the role inside a forged token is trusted.
- **Suggested Fix:** Fail startup when `JWT_SECRET` is missing or shorter than a strong random value. Remove the fallback from both files.
- **Retest Criteria:** Starting the API with no `JWT_SECRET` exits with an error. A token signed with the old hardcoded value is rejected.

---

## HRMS-SMOKE-022

- **Issue ID:** HRMS-SMOKE-022
- **Title:** npm audit reports critical and high issues in packages the app runs
- **Severity:** Medium
- **Module:** Dependencies
- **Environment:** `npm audit` on this workspace after `npm install`, commit a32f711. Audit reported 3 critical, 9 high, 4 moderate, 3 low.
- **Preconditions:** Dependencies are installed from the lockfile.
- **Reproduction Steps:**
  1. From the repository root, run `npm audit`.
  2. Read the critical and high package names.
- **Expected Result:** No critical or high advisories on packages used at runtime.
- **Actual Result:** Critical: `next` (cache poisoning advisories in the reported version range), `shell-quote`, and `concurrently`. High includes `multer`, `body-parser`, `@nestjs/platform-express`, `prisma`, and `@prisma/config`. `next` and `multer` are used by the web app and the API. `concurrently` and `shell-quote` are development tools. These advisories were not exploited in this test.
- **Evidence:** `qa/smoke-audit-2/evidence/npm-audit-summary.json`.
- **Root Cause:** The installed versions fall inside the advisory ranges reported by npm.
- **Business Impact:** Known denial-of-service issues in upload handling, and the reported Next.js cache issues, stay in the build until the packages are upgraded.
- **Suggested Fix:** Upgrade `next`, `multer`, and the Nest and Prisma packages to versions outside the advisory ranges. Re-run `npm audit`. Do not ignore runtime advisories.
- **Retest Criteria:** `npm audit` shows no critical or high findings for `next`, `multer`, `body-parser`, or `@nestjs/platform-express`.

---

## HRMS-SMOKE-023

- **Issue ID:** HRMS-SMOKE-023
- **Title:** The sign-in page ships one-click demo accounts, and the demo password is in the public JavaScript
- **Severity:** Medium
- **Module:** Web sign-in
- **Environment:** Production build of `apps/web` from commit a32f711, loaded with the local API address.
- **Preconditions:** The web app has been built with `npm run build`.
- **Reproduction Steps:**
  1. Open the sign-in page. Use a demo button.
  2. Search the built login chunk under `apps/web/.next/static/chunks/app/login/` for the demo password string from the README and for the three demo email addresses.
- **Expected Result:** A production build does not contain demo passwords or buttons that fill an owner account.
- **Actual Result:** The sign-in page shows Owner, HR, and Employee buttons. The built login JavaScript contains those three email addresses and the demo password. The platform page placeholder also names that password. No database URL and no JWT secret were found in the web bundle.
- **Evidence:** Login buttons in `apps/web/src/app/login/page.tsx`. Bundle check recorded during this run: the login chunk contains the three demo emails and the demo password. Screenshot `qa/smoke-audit-2/screenshots/login-1440x900.png`.
- **Root Cause:** The demo list and the password fill are compiled into the client page.
- **Business Impact:** If the seeded demo accounts are left in a real company database, anyone who can open the sign-in page can enter as the Owner with one click.
- **Suggested Fix:** Remove demo buttons from production builds. Do not seed the demo password in a production database. Rotate any account that still uses it.
- **Retest Criteria:** The production login bundle does not contain the demo password or the demo emails. The sign-in page has no demo buttons.

---

## HRMS-SMOKE-024

- **Issue ID:** HRMS-SMOKE-024
- **Title:** Integration webhooks accept data with the API key alone and do not check the webhook secret
- **Severity:** Low
- **Module:** Integration Hub
- **Environment:** Local API, commit a32f711
- **Preconditions:** The Owner has created an integration source and a webhook row.
- **Reproduction Steps:**
  1. As the Owner, create a source of type SALES and copy the API key.
  2. `POST /webhooks/leads` with header `X-API-Key` and a lead body. Do not send the webhook secret.
  3. Send the same external id again with a new name.
  4. `GET /integrations/webhooks` as the Owner.
- **Expected Result:** If a secret is issued, inbound calls must prove they know it. A missing or wrong secret is refused. Repeating an external id does not create a second row.
- **Actual Result:** A call with no API key returned HTTP 401. A call with the API key and no secret returned HTTP 201. The second call updated the same lead. The database had one row. The webhook list returns the stored secret to the Owner. Duplicate invoice external ids also updated one row instead of inserting a second row, which is the correct duplicate behavior.
- **Evidence:** `qa/smoke-audit-2/evidence/api-followup.json` key `ingest` (`hook` 201, `leads` 1). `qa/smoke-audit-2/evidence/api-results.json` case INT-04 (`secretVisible: true`). Missing API key returned 401 in case INT-03.
- **Root Cause:** `handleWebhook` checks the API key only. The secret stored on the webhook row is not compared to the request.
- **Business Impact:** Anyone who copies the API key can push leads, invoices, and the other ingest types. The extra secret shown in the hub does not add a check. Duplicate external ids themselves are handled safely.
- **Suggested Fix:** Require a signature header computed with the webhook secret, and reject calls that do not match. Keep the API key check as well.
- **Retest Criteria:** A webhook with a valid API key and a missing or wrong signature returns HTTP 401. A correctly signed call still updates the same external id in place.
