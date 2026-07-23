# St. Mary's Bank — Help Desk

Enterprise Service Management (help desk) for ~300 employees across IT and
non-technical departments. Built as a **sibling app to the Credit Union PMO
tool** — same stack, same patterns, so both can later fold into one intranet.

**Design doc:** [`../docs/helpdesk/technical-spec.md`](../docs/helpdesk/technical-spec.md)

## Stack
Server-first **Next.js 14 (App Router) + TypeScript**, **PostgreSQL via Prisma**,
**Auth.js (NextAuth v5) → Microsoft Entra ID**, **Tailwind**. Runs as a single
**Node 22** app on **Azure App Service** + **Azure DB for PostgreSQL Flexible
Server**. Reads are React Server Components; writes are **Server Actions**. No
separate API tier.

## Local development
```bash
# 1. Start Postgres 16 (matches Azure Flexible Server)
docker compose up -d

# 2. Configure env
cp .env.example .env          # defaults point at the local Postgres

# 3. Install, migrate, seed
npm install
npm run db:deploy             # apply migrations
npm run db:seed               # IT Helpdesk queue + demo logins

# 4. Run
npm run dev                   # http://localhost:3000
```

### Seeded logins (password `Password123!`)
| Email | Role |
|-------|------|
| admin@stmarysbank.com | SYS_ADMIN |
| agent@stmarysbank.com | AGENT |
| teller@stmarysbank.com | END_USER |

Leave the `AUTH_ENTRA_ID_*` vars blank for local Credentials login; set them to
enable Microsoft SSO in production.

## Layout
```
prisma/schema.prisma     all models (User/Employee, Queue, Ticket, …)
prisma/seed.ts           IT Helpdesk queue + demo data
scripts/build.js         prisma generate → migrate deploy → next build
infra/main.bicep         Azure landing zone (App Service, Postgres, Key Vault, Blob)
azure-pipelines.yml      CI/CD: build → staging slot → gated swap
src/auth.config.ts       edge-safe auth (middleware)
src/auth.ts              Node auth (Prisma adapter + Entra/Credentials)
src/middleware.ts        request gate (login + /admin)
src/lib/prisma.ts        client singleton
src/lib/authz.ts         server-side permission checks (incl. queue scope)
src/lib/actions/         Server Actions (the mutation layer)
src/app/                 portal / agent / admin / tickets / login
```

## Phase 0 status
- ✅ Next.js + Tailwind scaffold, Node 22
- ✅ Prisma schema (core + full model set) + initial migration
- ✅ Auth.js with Entra SSO + edge-safe split; middleware gate
- ✅ User/Employee, Department/Queue, RBAC + queue-membership scoping
- ✅ `ticket_events` append-only audit skeleton
- ✅ Portal (create/track), agent workspace, admin console, ticket detail
- ✅ Azure landing-zone Bicep + Azure DevOps pipeline
- ⏳ Next: row-level security policies, email-to-ticket (Graph), SLA WebJob
