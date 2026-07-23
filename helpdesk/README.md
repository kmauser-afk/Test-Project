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

## Deploy to Vercel

The app is a standard Next.js + Prisma app, so it runs on Vercel with **no code
changes** (Vercel is the PMO app's current host). Azure App Service remains the
enterprise target — same codebase, portable either way.

1. **Provision Postgres** — create a **Neon** project (serverless Postgres 16).
   Copy the **pooled** and **direct** connection strings.
2. **Import the repo** in Vercel and set the project root to `helpdesk/`.
   Vercel auto-detects Next.js; `vercel.json` sets the build command to
   `npm run build` (which runs `prisma generate → migrate deploy → next build`).
3. **Set environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL (`...-pooler...`) |
   | `DIRECT_URL` | Neon **direct** URL (migrations) |
   | `AUTH_SECRET` | `openssl rand -base64 33` |
   | `AUTH_TRUST_HOST` | `true` |
   | `AUTH_ENTRA_ID_ID` / `_SECRET` / `_TENANT_ID` | Entra app registration (add the Vercel URL as a redirect URI) — omit for Credentials-only |
   | `CRON_SECRET` | random string; Vercel Cron sends it as a Bearer token |
   | `JOBS_SHARED_SECRET` | random string (manual job triggers) |

4. **Deploy.** The build runs migrations against `DIRECT_URL`, then `next build`.
5. **Seed once** (locally, pointed at the Neon DB, or via a one-off):
   `DATABASE_URL=<neon-pooled> DIRECT_URL=<neon-direct> npm run db:seed`.

**Background jobs:** `vercel.json` registers a Vercel Cron that calls
`/api/jobs/sla-sweep` (secret-guarded). On the **Hobby** plan crons run at most
once per day — use `"0 6 * * *"`; **Pro** allows the hourly schedule shipped
here. This is the exact `/api/jobs/*` pattern the Azure WebJob uses, so nothing
changes but the scheduler.

**Preview deployments:** point preview envs at a **Neon branch** so preview
builds don't run migrations against production. Neon's DB branching makes this a
one-click setup.

> I can't click "deploy" for you — that needs your Vercel + Neon accounts — but
> the repo is push-button ready once the repo is imported and the vars are set.

## Phase 0 status
- ✅ Next.js + Tailwind scaffold, Node 22
- ✅ Prisma schema (core + full model set) + initial migration
- ✅ Auth.js with Entra SSO + edge-safe split; middleware gate
- ✅ User/Employee, Department/Queue, RBAC + queue-membership scoping
- ✅ `ticket_events` append-only audit skeleton
- ✅ Portal (create/track), agent workspace, admin console, ticket detail
- ✅ Azure landing-zone Bicep + Azure DevOps pipeline
- ⏳ Next: row-level security policies, email-to-ticket (Graph), SLA WebJob
