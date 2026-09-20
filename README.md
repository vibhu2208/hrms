# Go Staff

HRMS + performance + business command center. External Sales, Profit, Accounts, and Operations data is ingested from other apps so admins see everything in one place.

## Stack

- **Web:** Next.js (`apps/web`) — Admin + Employee portals
- **API:** NestJS (`apps/api`) — JWT auth, RBAC, Integration Hub
- **DB:** PostgreSQL + Prisma
- **Shared:** `@go-staff/shared` types and helpers

## Quick start

Uses **PostgreSQL** (Neon or local). Set `DATABASE_URL` in `apps/api/.env`.

```bash
# 1. Install
npm install

# 2. Build shared + database
npm run build -w @go-staff/shared
npm run db:generate
npm run db:push
npm run db:seed

# 3. Run API + Web
npm run dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/v1  

### Demo logins

| Email | Password | Role |
|-------|----------|------|
| owner@gostaff.local | password123 | Owner |
| hr@gostaff.local | password123 | HR |
| employee@gostaff.local | password123 | Employee |

## Integration Hub

Push data from any CRM/ERP/accounting tool:

1. **Admin → Integration Hub** — register a source, copy API key  
2. **CSV upload** — download template, upload rows  
3. **REST ingest**

```http
POST /api/v1/ingest/invoices
X-API-Key: gs_...
Content-Type: application/json

{ "rows": [{ "external_id": "inv-1", "invoice_number": "INV-1", "amount": 1000, "status": "PENDING", "issue_date": "2026-09-01", "due_date": "2026-10-01" }] }
```

Domains: `invoices`, `leads`, `financial`, `orders`, `salesperson-metrics`

Webhooks: `POST /api/v1/webhooks/{domain}` with the same API key.

## Phases covered

1. Core HRMS (profiles, attendance, leave, holidays, bulletin, policies, roles)  
2. Tasks, performance scoring, tickets, suggestions, notifications  
3. Owner dashboards + reports + calendar (Google OAuth optional)  
4. Ingest hardening, webhooks, alert runner (`POST /alerts/run`)
