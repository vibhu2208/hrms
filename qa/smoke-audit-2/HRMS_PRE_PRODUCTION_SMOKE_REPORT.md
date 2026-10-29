# GoStaff HRMS pre-production smoke report

## Decision

**NO-GO**

The build starts, the pages load, and the basic happy paths for sign-in, attendance math, and invoice ingest work. The product is not ready to put real employee data on. A normal employee can still read another person's identity and bank details (known issue 001). This run also found that old logins keep working after logout or deactivation, that HR and Management can make themselves Owner, and that department walls and finance reports are not enforced.

## What was tested

Commit `a32f7118364e2d41864f369924b59ee6c73eca4e` on 29 October 2026.

Local PostgreSQL 16 only. Three databases on 127.0.0.1: platform, Aith World, and TechThrive. No remote database was contacted. The API was started with `npm run dev:api` and the web app with `npm run dev:web`, after `npm install`, a shared-package build, `prisma generate`, and `npm run db:provision`.

Test people: Owner, Management, HR, Department Manager (Engineering), Team Leader (Engineering), and two Employees in different departments (Engineering and Sales).

## Counts

From `HRMS_TEST_EXECUTION_MATRIX.md`:

| | |
| --- | --- |
| Executed | 122 |
| Passed | 77 |
| Failed | 40 |
| Blocked | 5 |
| Not run | 6 |

11 of the failures are the already-known issues. 29 failures are new and are written up as HRMS-SMOKE-009 through HRMS-SMOKE-024.

## Startup notes

- PostgreSQL did not start from the package script because the image policy blocked the service. It was started by hand and stayed on localhost.
- `npm install` warned that Multer 1.x is deprecated.
- Prisma warned that `package.json#prisma` and the `multiSchema` preview flag are deprecated. Generate and validate still succeeded.
- The API log showed a clean start. No warning at listen time.
- The web app was ready in about 1.4 seconds. Next.js printed its telemetry notice.
- The production build succeeded. The only build warning was an autoprefixer note in `admin.css` about `end` versus `flex-end`.
- Typecheck of shared, API, and web passed. `prisma validate` passed.
- `npm audit` failed the gate: 3 critical, 9 high, 4 moderate, 3 low.

## Known issues, this run

| ID | Still happening? |
| --- | --- |
| 001 Employee can read another person's identity and bank fields | Yes |
| 002 Employee and team leader can list the whole roster | Yes |
| 003 Sign-in payload and browser storage include those fields | Yes |
| 004 Casual and sick leave on the same day both stay pending | Yes. A second casual request on that same day is also accepted |
| 005 Anyone can complete another person's task | Yes |
| 006 Anyone can read another person's performance history | Yes |
| 007 Bad ticket category returns HTTP 500 | Yes. The response body does not include a stack |
| 008 Recruitment without dates returns HTTP 500 | Partly. A title alone now returns HTTP 400. A department with no dates still returns HTTP 500 |
| Password change and reset | Still missing. Both routes return HTTP 404 |
| Microsoft and Google sign-in | Blocked. No app credentials |
| Document upload | Blocked. Supabase is not configured |
| ESLint, unit tests, CI | Still absent. Not retested as product defects |

## New defects

Full text is in `HRMS_DEFECT_REGISTER.md`.

| ID | Severity | Title |
| --- | --- | --- |
| HRMS-SMOKE-009 | High | Signing out, turning an account off, or changing a role does not stop the old login |
| HRMS-SMOKE-010 | High | An HR user or a Management user can make themselves the Owner |
| HRMS-SMOKE-011 | High | A department manager can see other departments, and a team leader can assign work outside their department |
| HRMS-SMOKE-012 | High | A department manager can approve their own leave |
| HRMS-SMOKE-013 | High | HR can download revenue and accounts reports even though those dashboards are blocked |
| HRMS-SMOKE-014 | High | Any signed-in person can tick off someone else's checklist item |
| HRMS-SMOKE-015 | Medium | Turning off colleague scores still lets a team leader see them |
| HRMS-SMOKE-016 | Medium | Leave on a company holiday is accepted and uses up a leave day |
| HRMS-SMOKE-017 | Medium | Two people can approve and reject the same leave at the same time, and both calls succeed |
| HRMS-SMOKE-018 | Medium | Bad form data on holidays, suggestions, tasks, and integration sources returns a server error |
| HRMS-SMOKE-019 | Medium | Sign-in can be tried over and over with no slowdown or lock |
| HRMS-SMOKE-020 | Medium | Every employee can read the company phone book and birth dates |
| HRMS-SMOKE-021 | High | If the JWT secret is missing, the API uses a secret that is written in the source code |
| HRMS-SMOKE-022 | Medium | npm audit reports critical and high issues in packages the app runs |
| HRMS-SMOKE-023 | Medium | The sign-in page ships one-click demo accounts, and the demo password is in the public JavaScript |
| HRMS-SMOKE-024 | Low | Integration webhooks accept data with the API key alone and do not check the webhook secret |

## What passed

- Wrong passwords, unknown users, bad tokens, expired tokens, and `alg=none` tokens are refused.
- A token from one company is refused by the other company.
- Check-out without check-in is refused. A second check-in the same day is refused.
- Working minutes matched a 125-minute span. Overtime matched the shift end within two minutes.
- Leave with the end before the start, or with more days than the balance, is refused.
- Approving a leave request after it was already rejected is refused when the calls are one after another.
- Two approves of the same request do not subtract the balance twice.
- An employee cannot change their own role, cannot open the admin screens by typing the address, and cannot read or close someone else's notification.
- Invoice and lead ingest with a bad API key is refused. Sending the same external id again updates the one row.
- The platform list does not return database URLs. A company token cannot open it.
- Script text in a bulletin is shown as text. No browser alert ran.
- SQL-looking text in the sign-in form did not cause a server error.
- Screens at 1440x900, 768x1024, 390x844, and 320x568 did not scroll sideways. Shots are in `screenshots/`.
- Load on `GET /auth/me`: 5, 10, and 20 users, about 4 seconds each, zero errors. p95 was 14 ms, 19 ms, and 29 ms.

## Suspected, not filed

- Attendance "today" uses the server's local calendar date. This machine was UTC, and India was on the same calendar day, so a midnight mix-up was not observed.
- The sign-in page logged a React hydration warning while `next dev` was running. The page still rendered. It was not repeated against the production server.
- The API allows any localhost port and any `https://*.gostaff.in` origin, with credentials. The session is a bearer token, not a cookie, and the allow list is written in the API on purpose. Not filed.

## Blocked and not run

Blocked: Microsoft sign-in, Google calendar, Supabase document upload, outbound email, Microsoft Planner data on the dashboard.

Not run: a live UTC-versus-India midnight attendance check, careers apply, the alerts runner, missed clock-out for another person, employee-search SQL injection, and a bad invoice status after a valid source existed.

## Release blockers

Known HRMS-SMOKE-001 (Critical) still reproduces.

New blockers: HRMS-SMOKE-009, 010, 011, 012, 013, 014, and 021.
