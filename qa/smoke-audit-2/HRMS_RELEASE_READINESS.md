# GoStaff HRMS release readiness

Commit tested: `a32f7118364e2d41864f369924b59ee6c73eca4e`

## Verdict

**NO-GO**

Do not put real employee, payroll, or customer finance data on this build.

## Why

A normal employee can still open another person's identity and bank fields. That known issue is enough to stop a release. This run added more stops:

- Old logins keep working after logout, deactivation, and a role change.
- HR and Management can grant themselves Owner.
- Department managers can read other departments. A department manager can approve their own leave.
- HR can pull revenue and invoice reports that the finance screens refuse.
- Anyone can tick another person's checklist.
- The API will sign tokens with a secret that sits in the source code if `JWT_SECRET` is left empty.

## Gates

| Gate | Result |
| --- | --- |
| Install, generate, migrate/provision, seed | Pass, with Prisma and Multer warnings |
| API and web start | Pass |
| Typecheck shared, API, web | Pass |
| prisma validate | Pass |
| Production build | Pass, one CSS warning |
| npm audit | Fail. 3 critical, 9 high |
| Auth and object checks | Fail |
| Responsive UI smoke | Pass on four widths |
| Bounded load, 5 to 20 users | Pass. p95 under 30 ms on `/auth/me` |

## Ship only after

1. Close known HRMS-SMOKE-001, 002, and 003 so identity and bank data stay with HR and the Owner.
2. Close HRMS-SMOKE-009, 010, 011, 012, 013, 014, and 021.
3. Re-run this matrix on a fresh local database and show those rows as pass.
4. Remove demo sign-in buttons from the production web build, or prove the demo accounts are not in that database.
5. Bring `npm audit` high and critical runtime findings down, especially Next.js and Multer.

Medium items 015 through 020 and 022 through 024 should be scheduled before a wider rollout. They are not the reason for the NO-GO by themselves. The identity leak and the role and session holes are.
