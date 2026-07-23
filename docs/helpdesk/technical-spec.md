# St. Mary's Bank — Enterprise Help Desk System
## Detailed Technical Specification

**Status:** Draft for review
**Author:** IT / Engineering
**Scope:** Custom Enterprise Service Management (ESM) platform, built as a **sibling app to the Credit Union PMO tool** — same stack, same infrastructure shape, so both can later fold into a single intranet.
**Audience:** ~300 employees across multiple IT teams and non-technical departments (Facilities, Marketing, HR, Operations)

> **One-line summary:** A server-first **Next.js (App Router) + TypeScript** app talking to **PostgreSQL via Prisma**, authenticating with **Auth.js (NextAuth v5) → Microsoft Entra ID (SSO)**, styled with **Tailwind**, running as a single **Node 22** web app on **Azure App Service** + **Azure Database for PostgreSQL Flexible Server**. Pages render on the server; mutations go through **Server Actions**. No SPA framework, no client data-fetching library, no separate API tier. Mirrors the PMO app's stack and patterns exactly.

---

## Table of Contents
1. [Overview & Goals](#1-overview--goals)
2. [Architecture & Rendering Model](#2-architecture--rendering-model)
3. [Technology Stack](#3-technology-stack)
4. [Data Model](#4-data-model)
5. [Roles & Permission Model](#5-roles--permission-model)
6. [Core Subsystems](#6-core-subsystems)
7. [Server Actions & Minimal API Surface](#7-server-actions--minimal-api-surface)
8. [UX / Screen Specifications](#8-ux--screen-specifications)
9. [Integrations](#9-integrations)
10. [Security & Compliance](#10-security--compliance)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Repository Layout & Conventions](#13-repository-layout--conventions)
14. [Patterns Adopted from the PMO Blueprint](#14-patterns-adopted-from-the-pmo-blueprint)
15. [Super-Intranet Integration Path](#15-super-intranet-integration-path)
16. [Environment Variables](#16-environment-variables)
17. [Phased Delivery Plan](#17-phased-delivery-plan)
18. [Risks & Open Questions](#18-risks--open-questions)

---

## 1. Overview & Goals

### 1.1 Purpose
A single ticketing engine serving many isolated department workspaces. One platform handles IT (Helpdesk/Tier 1, Infrastructure, Applications, Network, InfoSec) and non-technical departments (Facilities, Marketing, HR, Operations), with strict per-queue/per-department access boundaries.

### 1.2 Design principles
- **Match the PMO app's spine** — server-first Next.js + Prisma/Postgres + Auth.js on a managed Node host. Same versions, same conventions, same repo shape, so a developer moving between the two apps feels at home and the two can merge later.
- **Server-first, no API tier** — reads via React Server Components querying Prisma directly; writes via Server Actions. No REST/GraphQL to design or keep in sync.
- **Simple for end users** — file a request in < 30 seconds, no training required.
- **Powerful for agents & admins** — routing, SLAs, automation, reporting.
- **Compliance-grade** — GLBA/NCUA aligned, immutable audit trail, least-privilege by default.
- **Isolated by default** — a department only sees its own queues unless access is explicitly granted.
- **Keep it boring; add when you need it** — no Redis, no message bus, no component library, no search service until a real need appears (see §3.2 backlog).

### 1.3 Success metrics
- First-response SLA compliance ≥ 90%.
- CSAT ≥ 4.2 / 5.
- ≥ 25% ticket deflection via knowledge base self-service.
- Ticket creation median time < 30s.

---

## 2. Architecture & Rendering Model

### 2.1 High-level topology (mirrors the PMO enterprise shape)
```
                       ┌──────────────────────────────────────┐
   Employees ─HTTPS─►  │        Azure App Service (Linux)      │   next start · Node 22
                       │  ┌────────────────────────────────┐  │
                       │  │  Next.js App Router (one app)   │  │   • End-User Portal  (RSC)
                       │  │  • Server Components  (reads)   │  │   • Agent Workspace  (RSC + client bits)
                       │  │  • Server Actions     (writes)  │  │   • Admin Console
                       │  │  • middleware.ts (auth gate)    │  │   • /api: auth + ingest + jobs + bootstrap
                       │  └────────────────────────────────┘  │
                       │  ┌────────────────────────────────┐  │
                       │  │  WebJob (cron) → /api/jobs/*    │  │   SLA sweep, email poll,
                       │  │  secret-guarded, advisory-lock  │  │   escalations, surveys, notify
                       │  └────────────────────────────────┘  │
                       └──────┬───────────────────┬───────────┘
                              │                   │
                 ┌────────────▼──────────┐  ┌─────▼───────────────┐
                 │ Azure DB for          │  │ Microsoft Entra ID  │  OIDC SSO + MFA
                 │ PostgreSQL Flexible   │  │ (Auth.js provider)  │
                 │ Server 16             │  └─────────────────────┘
                 │  • app data + audit   │  ┌─────────────────────┐
                 │  • DATABASE_URL pooled│  │ Azure Blob Storage  │  attachments (Managed Identity)
                 │  • DIRECT_URL migrate │  └─────────────────────┘
                 └───────────────────────┘  ┌─────────────────────┐
                                            │ Microsoft Graph     │  email-to-ticket + replies
                 ┌───────────────────────┐  └─────────────────────┘
                 │ Azure Key Vault       │  secrets via App Service managed identity
                 └───────────────────────┘
                 Observability: Application Insights + Azure Monitor / Log Analytics
```
Only three additions beyond the PMO footprint — **Blob Storage** (attachments), **Graph** (email intake), and an **App Service WebJob** (scheduling). Everything else is identical to the PMO enterprise target.

### 2.2 Rendering model — server-first (identical to PMO)
- **React Server Components by default** — pages run on the server, query Postgres directly via Prisma, stream HTML. Only interactive pieces are `"use client"`.
- **Server Actions are the mutation layer** — every write (create ticket, reply, assign, resolve, approve) is an `async` server function in `src/lib/actions/`. **No separate API tier for app data.**
- **`export const dynamic = "force-dynamic"`** on data pages — a help desk must always be fresh; correctness over CDN caching.
- **`middleware.ts`** runs on every request to enforce login and gate `/admin` and agent routes *before* a server component streams data the user shouldn't see.

### 2.3 Background work — within the blueprint, not around it
The PMO app has no scheduled work; a help desk does (SLA breaches, email intake, escalations, survey dispatch). Solved without adding Functions/Service Bus:
- **App Service WebJob** (part of App Service — no new Azure resource) runs on a cron schedule and calls **secret-guarded `/api/jobs/*` route handlers** — a direct extension of the PMO app's "one-time, secret-guarded bootstrap endpoint" pattern.
- Each job takes a **Postgres advisory lock** so that even when App Service scales to multiple instances, the job runs exactly once.
- Most "async" work that can be synchronous simply runs inside the triggering Server Action (e.g. dispatch a CSAT survey during the `closeTicket` action). Only genuinely time-based work (SLA sweep, mailbox poll) needs the WebJob.
- **Add when you need it:** move to **Azure Functions + Service Bus** only if job volume or fan-out outgrows a single cron sweep.

---

## 3. Technology Stack

### 3.1 Core stack — pinned to match the PMO app
| Layer | Choice | Version | Same as PMO? |
|-------|--------|---------|--------------|
| Language | TypeScript | ^5.5 | ✅ |
| Runtime | Node.js | 22.x | ✅ |
| Framework | Next.js (App Router) | 14.2.x | ✅ |
| UI library | React | ^18.3 | ✅ |
| Styling | Tailwind CSS (+ PostCSS, Autoprefixer) | ^3.4 | ✅ |
| ORM | Prisma | ^5.20 | ✅ |
| Database | PostgreSQL | 16 | ✅ |
| Auth | Auth.js / NextAuth | ^5.0.0-beta | ✅ |
| Auth ↔ DB | @auth/prisma-adapter | ^2.x | ✅ |
| Password hashing | bcryptjs (fallback/local accounts only) | ^3.0 | ✅ |
| Scripts/seed runner | tsx | ^4.16 | ✅ |
| Hosting | Azure App Service (Linux, Node 22) | — | ✅ (enterprise target) |
| Database host | Azure DB for PostgreSQL Flexible Server | 16 | ✅ |
| CI/CD | Azure DevOps (Repos + Pipelines) | — | ✅ |
| Secrets | Azure Key Vault (via managed identity) | — | ✅ |
| Observability | Application Insights / Azure Monitor | — | (enterprise addition) |

**Auth choice:** lead with the PMO app's documented **enterprise swap — Microsoft Entra ID (Azure AD) OIDC provider** for SSO + MFA. Auth.js supports it as a drop-in; JWT session strategy carries `userId`, `role`, `employeeId`, and `department` so middleware gates routes with **no DB call** (identical to PMO).

### 3.2 Deliberately NOT in the stack (matching the PMO philosophy)
| Not used | Why | Add it when… |
|----------|-----|--------------|
| Client data fetcher (React Query/SWR) | Server Components fetch directly | a heavy real-time client UI appears |
| State manager (Redux/Zustand) | Server state + hooks + `localStorage` suffice | genuinely complex shared client state appears |
| Component library (shadcn/Radix/MUI) | Hand-built Tailwind components, full control | you want speed over bespoke design |
| Separate API (REST/GraphQL) | Server Actions are the mutation layer | you need a public API or the intranet shell calls it |
| Chart library | Hand-rolled SVG (SLA trend, CSAT, volume) | reporting needs many complex/interactive charts |
| Redis / Service Bus / Functions | One Node app + WebJob + Postgres advisory locks | job volume/fan-out outgrows a cron sweep |
| Search service (Azure AI Search/OpenSearch) | **Postgres full-text search** (`tsvector`) for KB + tickets | you need semantic ranking / very large corpora |
| Validation library | Hand-rolled checks in Server Actions to start | inputs get complex → add **Zod** (recommended early here) |
| Test framework | (honest gap in PMO) | **now** — add **Vitest** (unit) + **Playwright** (e2e) for a compliance app |

> Two upgrades I'd pull forward for a help desk vs. the PMO app: **Zod** (ticket/form inputs are complex and user-facing) and a **test suite** (this system touches compliance workflows). Both are additive and stay within the spirit of the blueprint.

### 3.3 Brand design tokens (reused from the St. Mary's site)
```
--navy-900:#0a2540  --navy-800:#0d3159  --navy-700:#123f70
--gold-500:#c99a2e  --gold-400:#dbb246  --gold-100:#f7ecd2
--ivory:#f8f6f1     --success:#1e7a4c
```
Status colors to add: `--warning:#b8860b`, `--danger:#b23b3b`, `--info:#123f70`. Tokens live in `tailwind.config.ts`; light/dark via CSS variables (same approach as PMO).

---

## 4. Data Model

Prisma schema (`prisma/schema.prisma`), one datasource, generated typed client. Aligns with the PMO app's `User`/`Employee` split so identities are shared-ready.

### 4.1 Entity relationship overview
```
Auth.js:  User ─1:1─ Employee        (User carries role; Employee is the roster identity)
          User ──< Account, Session, VerificationToken

Employee ──< QueueMembership (role-scoped) >── Queue
Employee ──< Ticket (as requester / assignee)
Employee ──1:self─ manager (approval routing)

Department ──< Queue ──< Ticket ──< TicketEvent (append-only audit/timeline)
                 │          │  ├──< Comment (public | internal)
                 │          │  ├──< Attachment  (Blob storage_key)
                 │          │  ├──< Approval ──< ApprovalStep
                 │          │  ├──< SlaClock
                 │          │  ├──< TicketLink (parent/child/related/duplicate)
                 │          │  └──< SurveyResponse
                 │          └── form_data (JSONB, per RequestType)
                 ├──< SlaPolicy
                 ├──< BusinessHoursCalendar
                 └──< RequestType (Service Catalog) ──< FormDefinition

KnowledgeArticle ──< ArticleVersion
AutomationRule (trigger, conditions JSONB, actions JSONB)
```

### 4.2 Key models (abridged)

**User / Employee** — mirrors PMO's split so the intranet can share one identity table later.
- `User`: `id`, `email` (citext unique), `role` enum(end_user, agent, lead, dept_admin, sys_admin, auditor), `employeeId` FK, Auth.js relations. Entra `sub`/`oid` stored on `Account`.
- `Employee`: `id`, `externalId` (Entra object id), `displayName`, `departmentId` FK, `managerId` self-FK, `title`, `phone`, `location`, `status` enum(active, disabled). Synced from Entra/Graph.

**departments** — `id · name · slug · parentId (self) · adminGroup · isActive`

**queues** — `id · departmentId · name · slug · description · defaultAssigneeId · defaultSlaPolicyId · businessHoursId · isPrivate (default true) · createdAt`

**queue_memberships** — *heart of scoped permissions* — `id · employeeId · queueId · role enum(agent, lead, dept_admin, collaborator, viewer) · grantedBy · grantedAt · expiresAt (null)`

**tickets**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| reference | text unique | human key e.g. `IT-104829` |
| queueId | uuid FK | |
| requestTypeId | uuid FK null | Service Catalog item |
| requesterId | uuid FK → Employee | |
| assigneeId | uuid FK → Employee null | |
| subject | text | |
| status | enum | new, assigned, in_progress, pending, resolved, closed, cancelled |
| priority | enum(p1..p4) | derived from impact×urgency |
| impact, urgency | enum(high,med,low) | |
| categoryId, subcategoryId | uuid FK | |
| source | enum | portal, email, phone, walkup, api |
| formData | jsonb | dynamic per request type |
| slaResponseDue, slaResolveDue | timestamptz | |
| firstRespondedAt, resolvedAt, closedAt | timestamptz | |
| reopenCount | int | |
| createdAt, updatedAt | timestamptz | |

**comments** — `id · ticketId · authorId · body · visibility enum(public, internal) · isSystem · createdAt`

**ticket_events** *(append-only timeline + audit — same pattern as PMO's `WorkItemActivity`)* — `id · ticketId · actorId · eventType · fromValue · toValue · metadata jsonb · createdAt` — never updated/deleted; feeds the timeline and compliance reports.

**attachments** — `id · ticketId/commentId · filename · contentType · size · storageKey (Blob) · scanStatus enum(pending,clean,infected) · uploadedBy · createdAt`

**request_types** *(Service Catalog)* — `id · departmentId/queueId · name · description · icon · formDefinitionId · defaultPriority · approvalChainId (null) · isActive`

**form_definitions** — `id · name · schema jsonb (fields, types, conditional logic, validation) · version`

**sla_policies** — `id · departmentId · name · targets jsonb ({p1:{responseMins, resolveMins}, ...}) · businessHoursId · pauseOnStatuses[]`

**sla_clocks** — `id · ticketId · clockType enum(response,resolve) · targetAt · pausedAt · elapsedMs · breached · breachedAt`

**business_hours_calendars** — `id · name · timezone · weeklySchedule jsonb · holidays jsonb`

**approvals / approval_steps** — approval: `id · ticketId · chainId · status`; step: `id · approvalId · stepNo · approverId · status · decidedAt · comment`

**automation_rules** — `id · scope(queue/dept/global) · trigger enum(on_create,on_update,on_reply,on_sla_warning,scheduled) · conditions jsonb · actions jsonb · isActive · runOrder`

**knowledge_articles / article_versions** — article: `id · title · slug · visibility enum(public, internal) · departmentId (null=all) · status enum(draft,in_review,published,archived) · currentVersionId · searchVector tsvector`; version: `id · articleId · body · authorId · changeNote · createdAt`

**surveys / survey_responses** — survey: `id · name · departmentId · questions jsonb · trigger enum(on_close)`; response: `id · ticketId · surveyId · rating int · comment · token · submittedAt`

**Migrations** follow the PMO convention: SQL files under `prisma/migrations/`, applied with `prisma migrate deploy` in the build; pooled `DATABASE_URL` at runtime, direct `DIRECT_URL` for migrations.

### 4.3 Dynamic forms
`request_types` point to a versioned `form_definitions.schema` (JSONB); submissions store answers in `tickets.formData` (JSONB) — custom fields per department with no schema migration. Validated server-side in the Server Action (with **Zod**). Example:
```json
{
  "fields": [
    {"key":"asset_tag","label":"Asset Tag","type":"text","required":true},
    {"key":"software","label":"Software Requested","type":"select","options_source":"catalog:software"},
    {"key":"business_justification","label":"Justification","type":"textarea","required_when":{"software":"non-standard"}}
  ]
}
```

---

## 5. Roles & Permission Model

### 5.1 Two-layer authorization (PMO's two-layer model, extended with queue scope)
1. **Global role** (on `User`, carried in the JWT) — what *type* of things a user can do system-wide.
2. **Queue membership** (scope layer) — *which* queues/departments the user can act in, and at what level.

**Effective permission = Global role capabilities ∩ Queue membership scope.**

### 5.2 Global roles
| Role | Capabilities |
|------|--------------|
| End User | Create/track own tickets; use self-service KB; respond to own tickets & surveys. |
| Agent | End User + work tickets in member queues (view, reply, assign-self, resolve, log time). |
| Team Lead | Agent + assign/reassign within queue, edit queue SLAs/forms, view queue reports. |
| Department Admin | Lead across *their department's* queues + manage members, categories, catalog, SLAs. |
| System Admin | Global config, integrations, all departments, user/role management. |
| Auditor (read-only) | Read tickets + full reporting/audit across scope; no write. |

### 5.3 Scoped permission matrix (example)
```
User: J. Doe (Global role: Agent)
  ┌────────────────────┬───────────────┬───────────────────────────────┐
  │ Queue              │ Membership    │ Effective actions             │
  ├────────────────────┼───────────────┼───────────────────────────────┤
  │ IT-Helpdesk        │ agent         │ view, reply, resolve, assign  │
  │ IT-Infrastructure  │ collaborator  │ view, internal-comment only   │
  │ IT-InfoSec         │ (none)        │ NO ACCESS — queue invisible   │
  │ Facilities         │ (none)        │ NO ACCESS — queue invisible   │
  └────────────────────┴───────────────┴───────────────────────────────┘
```

### 5.4 Enforcement (server is the boundary; UI is cosmetic — PMO pattern #2)
- **Middleware** blocks unauthenticated requests and non-members from admin/agent routes *before* the page renders.
- **`authz` helper** (`src/lib/authz.ts`) guards **every mutating Server Action** — resolves the caller's memberships and rejects out-of-scope writes. The `<select>` of assignees or the "resolve" button is convenience; the server check is the real gate.
- **Read scoping:** every Server Component ticket query is filtered by the caller's queue memberships. No membership → the row doesn't exist for that user (treated as 404, not 403, to avoid enumeration).
- **Database defense-in-depth:** PostgreSQL **row-level security** keyed on queue membership, so even a query bug can't leak cross-department tickets.
- **Field-level:** internal comments / internal KB never serialize into End-User responses.
- **Separation of duties:** a requester can't approve their own step; agents can't self-approve privileged catalog requests (enforced in the approval action).

### 5.5 Cross-team collaboration
- **Add collaborator** grants a named user temporary scoped access to a *single ticket* without exposing the queue.
- **@mention** notifies but grants no access.
- **Escalate/transfer** moves a ticket between queues (Tier 1 → Infrastructure) with full history retained and a `TicketEvent` logged.

---

## 6. Core Subsystems

### 6.1 Ticket lifecycle & state machine
```
                ┌──────── cancelled ◄─┐
                ▼                      │
new ─► assigned ─► in_progress ─► resolved ─► closed
        ▲   │           ▲   │          │
        │   └──► pending ┘   └── reopen ┘ (reopenCount++)
        └──────────────────────────────┘
```
- Transitions validated inside Server Actions; each emits a `TicketEvent`.
- `pending` (awaiting requester/vendor) **pauses the resolution SLA clock**.
- Per-department custom statuses layer on top of these canonical states.

### 6.2 Routing & assignment
- **Inbound routing rules** (ordered, per queue/global): match on source address, requester department, category, keyword → set queue, priority, assignee.
- **Assignment strategies:** manual pickup, round-robin, least-loaded, skill-based.
- Load balancing considers open-ticket count weighted by priority.

### 6.3 SLA & escalation engine
- Each ticket spawns `sla_clocks` (response + resolve) computed against the queue's `sla_policy` and `business_hours_calendar`.
- **A WebJob-triggered `/api/jobs/sla-sweep`** (cron, advisory-locked) evaluates clocks at warning thresholds (75%, 90%, breach). No timer service needed.
- On threshold → notify assignee/lead; on breach → mark `breached`, run escalation actions (reassign, bump priority, notify management).
- Clocks pause on `pending`/configured statuses; recomputed on queue transfer.

### 6.4 Workflow & automation engine
- Rules = **trigger → conditions (JSONB) → actions**, evaluated inside the relevant Server Action (or the scheduled sweep for `scheduled` triggers).
- Actions: set field, assign, tag, post canned reply, create sub-tasks, start approval, send notification.
- **Offboarding example:** `request_type = employee_termination` → create child tickets in IT (disable accounts), Facilities (collect badge/keys), HR (exit checklist); parent closes only when all children close.

### 6.5 Approvals
- `approval_chains` define ordered steps (manager → InfoSec → IT); steps role-based, named-user, or dynamic (`requester.manager` via Employee graph).
- Approvers act via portal or one-click emailed link (tokenized route); decisions recorded with timestamp + comment (audit).
- Sequential or parallel steps; rejection halts and notifies the requester.

### 6.6 Notifications
- Sent from the same Server Actions that mutate data (create/reply/assign/resolve) + the SLA sweep.
- Channels: **email via Microsoft Graph** and in-app; per-user, per-event preferences; digest mode + quiet hours; brand-styled templates.
- Delivery outcome logged for reliability.

### 6.7 Knowledge base & deflection
- Public (all-staff) + internal (agent-only) articles; versioned with a review/publish workflow.
- **Deflection via Postgres full-text search** (`tsvector` + `websearch_to_tsquery`): as a user types a subject, a Server Action returns candidate articles inline. No search service.
- Article feedback + analytics (views, helpfulness, tickets deflected).

### 6.8 Surveys (CSAT/CES)
- CSAT dispatched by the `closeTicket` action (or the sweep), one-click rating + optional comment via a **tokenized survey route** (no login needed).
- Results feed agent scorecards and department dashboards; a low score can auto-open a follow-up ticket for a lead.

### 6.9 Reporting & analytics
- **Server Components query read-optimized SQL views / materialized views** — no reporting API, no BI dependency.
- **Charts hand-rolled as SVG** (SLA trend, CSAT, volume, aging) — same approach as the PMO burndown/velocity charts.
- **Operational:** open by queue, SLA compliance %, aging buckets, agent workload, backlog trend.
- **Management:** volume trends, FCR, MTTR, reopen rate, CSAT by dept/agent.
- **Compliance:** audit-trail export, access reviews, retention reports.
- **Every report scoped to the viewer's queue memberships** (a Facilities lead sees only Facilities data). CSV export; scheduled email via the WebJob.

---

## 7. Server Actions & Minimal API Surface

There is **no REST/GraphQL app API**. Reads are Server Components; writes are Server Actions in `src/lib/actions/`. A handful of `/api/*` routes exist only for auth, inbound integrations, scheduled jobs, and bootstrap — exactly the PMO app's posture.

### 7.1 Representative Server Actions (`src/lib/actions/`)
```ts
// tickets.ts        — each action: authz() → validate (Zod) → write → revalidatePath()
createTicket(input)                 // portal / on-behalf; returns reference
updateTicketStatus(id, status)
assignTicket(id, assigneeId)
addComment(id, { body, visibility })
addAttachment(id, file)             // streams to Blob, records storageKey
transferTicket(id, toQueueId)
linkTickets(id, targetId, type)
decideApproval(stepId, decision, comment)

// catalog.ts
submitRequestType(requestTypeId, formData)

// admin.ts (sys_admin / dept_admin, guarded)
grantQueueMembership(employeeId, queueId, role, expiresAt)
upsertSlaPolicy(queueId, policy)
upsertAutomationRule(rule)

// kb.ts
searchKb(query)                     // Postgres FTS, visibility-filtered
submitArticleFeedback(articleId, helpful)
```
All actions call `authz()` first, validate with **Zod**, write via Prisma, append a `TicketEvent`, then `revalidatePath()` the affected pages.

### 7.2 The only `/api/*` routes
```
/api/auth/*                 # Auth.js (Entra OIDC)
/api/ingest/email           # Microsoft Graph webhook → creates/updates tickets (secret + signature verified)
/api/jobs/sla-sweep         # WebJob cron; secret-guarded; Postgres advisory lock
/api/jobs/email-poll        # fallback mailbox poll if webhooks unavailable
/api/jobs/reports-dispatch  # scheduled report emails
/api/surveys/[token]        # tokenized CSAT response, no login
/api/admin/bootstrap        # one-time, secret-guarded: seed first admin + reference data
```

### 7.3 Conventions
- Server-side membership filtering on every read; optimistic UI where it helps, server truth always.
- Idempotency on email intake (dedupe by message-id); advisory locks on all cron jobs.

---

## 8. UX / Screen Specifications

### 8.1 End-User Portal (consumer-grade, mobile-first)
- **Home:** large "How can we help?" search (KB deflection first), tile grid of top request types for the user's department, "My Open Tickets" strip.
- **New Request:** pick a service → dynamic form (minimal required fields) → attach → submit (Server Action). Inline KB suggestions while typing.
- **My Tickets:** status-chip list; detail = timeline of public replies, add-comment box, reopen/close, post-close CSAT.
- Responsive (branch & floor staff on phones), WCAG 2.1 AA, brand navy/gold.

### 8.2 Agent Workspace (dense, keyboard-driven)
- **Three-pane:** queue/filter sidebar · ticket list (hand-built Tailwind table with SLA countdown + priority color) · ticket detail.
- **Ticket detail:** requester context, tabbed timeline (all / public / internal), canned responses & macros, one-click status/assign/priority, time log, linked tickets, approval panel.
- **Productivity:** keyboard shortcuts, bulk actions, saved views, "next unassigned" pickup, SLA-at-risk highlighting.
- **State conventions (PMO pattern):** filters/column visibility in `localStorage`; active view/date range in **URL query params** (`?view=`, `?since=`) so views are linkable and refresh-safe.

### 8.3 Admin Console
- Department & queue management, **queue membership matrix editor** (the permission grid), SLA policies, business-hours calendars, request types / form builder, automation rules, KB management, survey templates, user/role admin, audit-log viewer.

### 8.4 Reporting Dashboards
- Server-rendered widget dashboards per role; hand-rolled SVG charts; drill-down; CSV export. Scoped to the viewer's departments/queues.

---

## 9. Integrations
- **Identity:** Microsoft Entra ID (OIDC) via Auth.js — SSO, MFA; Graph sync of employees, managers, departments, locations (seeds memberships & approval routing).
- **Email:** Microsoft Graph (M365) — email-to-ticket + threaded replies; per-queue shared mailboxes (`helpdesk@`, `facilities@`).
- **Storage:** Azure Blob Storage for attachments (Managed Identity; no keys in code).
- **Collaboration (later):** Microsoft Teams notifications + one-click approvals.
- **Endpoint/Asset (later):** Intune / Jamf / SCCM for CMDB enrichment.
- **HRIS (later):** onboarding/offboarding triggers.

---

## 10. Security & Compliance

- **Cloud posture:** all data, attachments, backups stay in a **US Azure region** under St. Mary's tenant; rely on Azure compliance inheritance (SOC 2, ISO 27001, FedRAMP) and confirm GLBA/NCUA coverage during vendor/cloud risk review.
- **Auth boundary:** Entra ID SSO + MFA; JWT session carries role/employee/department; `middleware.ts` gates routes with no DB call.
- **Immutable audit log:** append-only `ticket_events` (written by the same actions that mutate) + a system audit store for auth/config/access-grant changes. Exportable for examiners.
- **AuthZ defense-in-depth:** `authz` helper in every action + PostgreSQL **row-level security**.
- **GLBA / PII:** data classification; field-level encryption (`pgcrypto`) for sensitive fields; redaction tooling for KB/attachments.
- **Least privilege & access reviews:** time-boxed queue grants (`expiresAt`); recertification reports; Entra Conditional Access.
- **Attachment safety:** scan on upload (**Microsoft Defender for Storage**, or a ClamAV sidecar); quarantine on detection.
- **Secrets:** **Azure Key Vault** referenced via App Service **managed identity** — no secrets in code or config. Pooled/direct DB URLs, `AUTH_SECRET`, Graph creds all in Key Vault.
- **Transport & at-rest:** TLS via App Service; Azure encryption at rest for DB/Blob (CMK optional).
- **Optional hardening (add when required):** Azure Front Door + **WAF** in front of App Service; security headers; rate limiting.
- **Retention & legal hold:** per-record-type retention; legal-hold flag blocks purge.

---

## 11. Deployment & Infrastructure

### 11.1 Azure footprint (PMO enterprise shape + 3 additions)
- **Azure App Service (Linux, Node 22)** runs `next start`. PaaS — Microsoft patches the OS; we deploy code. Start on **P1v3**; scale out on CPU/requests. **Deployment slot** (`staging`) for zero-downtime swap.
- **Azure Database for PostgreSQL Flexible Server 16** — zone-redundant HA, automated backups + PITR. Prisma unchanged from local. **Private Endpoint** (no public DB exposure).
- **Azure Blob Storage** — attachments (Managed Identity).
- **App Service WebJob** — cron trigger for `/api/jobs/*` (SLA, email poll, report dispatch).
- **Azure Key Vault**, **Application Insights / Log Analytics**.
- **Networking:** App Service VNet-integrated; DB via Private Endpoint; Managed Identity for all service-to-service auth (DB, Blob, Key Vault, Graph).

### 11.2 Build & CI/CD (matches PMO)
- **Build orchestrator** `scripts/build.js`: `prisma generate → prisma migrate deploy → next build` (uses `DIRECT_URL` for migrate).
- **Two connection strings:** `DATABASE_URL` (pooled) at runtime, `DIRECT_URL` (direct) for migrations — so the migration advisory lock doesn't hang through a pooler.
- **Azure DevOps Pipelines** (Repos + Pipelines): lint → test (Vitest) → build → deploy to `staging` slot → Playwright smoke → manual-gate slot swap to production. (GitHub Actions is a drop-in alternative if the repo stays on GitHub.)
- **IaC:** Bicep templates for the whole footprint, reviewable in the repo.

### 11.3 Local development (matches PMO)
- **Postgres in Docker** — `docker-compose.yml` runs `postgres:16-alpine`; `docker compose up -d`, point `DATABASE_URL` at it.
- Scripts: `dev`→`next dev`; `build`→`scripts/build.js`; `start`→`next start`; `db:migrate`/`db:deploy`/`db:seed` (seed via **tsx**); `postinstall`→`prisma generate`.

### 11.4 Observability
- **Application Insights** for request tracing, dependency timing, custom metrics (SLA breach rate, queue depth, job duration); Azure Monitor alerts + availability pings.

---

## 12. Non-Functional Requirements
| Attribute | Target |
|-----------|--------|
| Users | ~300 employees; ~40–60 concurrent agents peak |
| Availability | 99.9% business-hours via App Service autoscale + zone-redundant PostgreSQL; slot swaps for zero-downtime deploys |
| Page render | p95 < 400ms server-rendered ticket views |
| Ticket volume | 100k+ tickets/yr, 5-yr retention |
| Search | KB/ticket FTS < 500ms |
| Accessibility | WCAG 2.1 AA |
| Browsers | Evergreen Chromium/Edge/Firefox/Safari |
| RPO / RTO | RPO ≤ 15 min, RTO ≤ 2 hrs |

---

## 13. Repository Layout & Conventions

Mirrors the PMO app so the two are structurally identical (and mergeable):
```
├─ prisma/
│  ├─ schema.prisma            # all models + datasource + generator
│  └─ migrations/              # SQL migrations
├─ scripts/build.js            # generate → migrate deploy → next build
├─ src/
│  ├─ app/                     # App Router: routes, layouts, pages
│  │  ├─ layout.tsx, page.tsx, globals.css
│  │  ├─ portal/…, tickets/…, agent/…, kb/…, reports/…, admin/…
│  │  └─ api/auth/…, api/ingest/…, api/jobs/…, api/surveys/…, api/admin/…
│  ├─ components/              # hand-built React (client + server)
│  ├─ lib/
│  │  ├─ prisma.ts             # DB client singleton
│  │  ├─ authz.ts              # server-side permission checks (incl. queue scope)
│  │  ├─ actions/              # Server Actions (the mutation layer)
│  │  └─ …                     # domain logic (sla, routing, forms, notify, reports)
│  ├─ auth.ts, auth.config.ts  # Auth.js (Node + edge-safe split)
│  └─ middleware.ts            # request gate (auth + admin/agent)
├─ docker-compose.yml          # local Postgres 16
├─ next.config.mjs, tailwind.config.ts, tsconfig.json
└─ package.json                # Node 22.x
```

---

## 14. Patterns Adopted from the PMO Blueprint

1. **Server Actions as the single mutation boundary** — every write: `authz()` → validate → write → `revalidatePath()`. No API to keep in sync.
2. **Enforce invariants on the server; treat the UI as cosmetic** — assignee-must-be-a-member, role checks, and status transitions are all server-resolved; the form controls are convenience.
3. **Derived/mirrored fields** — pick one source of truth and derive the rest (e.g. `priority` derived from impact×urgency; if an agent kanban is added, mirror a coarse `status` from the board column exactly as PMO mirrors work-item status).
4. **Query-param-driven views** for anything linkable/bookmarkable/refresh-safe; **`localStorage`** for pure UI prefs.
5. **Pooled vs direct DB URLs** so migrations don't fight the pooler.
6. **Edge-safe auth config split** (`auth.config.ts` vs `auth.ts`) so middleware gates requests without pulling Node-only deps into the edge runtime.
7. **One-time, secret-guarded bootstrap endpoints** to seed the first admin + reference data on a fresh deploy — and, extended here, the **same guard pattern for WebJob-triggered `/api/jobs/*`**.
8. **Append-only activity/audit trail** written by the same actions that mutate data (`ticket_events` ≙ PMO's `WorkItemActivity`) — doubles as the compliance record.

---

## 15. Super-Intranet Integration Path

Building this as a PMO sibling makes a later merge into one intranet shell low-risk:
- **Shared identity now:** both apps authenticate to the same Entra ID tenant via Auth.js and use the same `User`/`Employee` split. The intranet can adopt one shared `Employee` roster; the help desk's `requesterId`/`assigneeId` already point at it.
- **Two viable merge shapes:**
  1. **Monorepo, route groups** — fold help desk routes (`/helpdesk/*`) and PMO routes (`/pmo/*`) into one Next.js app with a shared `lib/`, `components/`, and Prisma schema. Cleanest long-term.
  2. **Separate apps, shared shell** — keep two App Services behind one Front Door + shared nav; link deeply (a PMO project can link to its IT tickets). Faster to reach, no big-bang migration.
- **Cross-app links today:** stable references (`IT-104829`, PMO `PRJ-42`) and a shared employee id let each app deep-link into the other before any merge.
- **Keep it portable:** avoid host-specific APIs (same principle as the PMO blueprint) so both apps stay deployable anywhere and easy to co-locate.
- **One design system:** shared Tailwind tokens (the navy/gold set) and hand-built component conventions so a merged UI already feels unified.

---

## 16. Environment Variables
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Runtime DB connection (pooled) |
| `DIRECT_URL` | Migrations only (unpooled) |
| `AUTH_SECRET` | Signs Auth.js session tokens (`openssl rand -base64 33`) |
| `AUTH_URL` | Public app URL (custom domain) |
| `AUTH_ENTRA_ID_ID` / `AUTH_ENTRA_ID_SECRET` / `AUTH_ENTRA_ID_TENANT_ID` | Entra OIDC provider |
| `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` / `GRAPH_TENANT_ID` | Microsoft Graph (email intake/send) |
| `AZURE_STORAGE_ACCOUNT` / container | Blob attachments (auth via managed identity) |
| `JOBS_SHARED_SECRET` | Guards `/api/jobs/*` and `/api/admin/bootstrap` |
| `NODE_ENV` | `production` in prod |

All secrets live in **Azure Key Vault**, surfaced to App Service via managed identity (never committed).

---

## 17. Phased Delivery Plan

| Phase | Deliverables |
|-------|-------------|
| **0 — Foundations** | Scaffold Next.js 14 (matching PMO: TS, Tailwind, App Router); Prisma schema + first migration; Auth.js → Entra SSO with edge-safe split; middleware gate; `User`/`Employee` + Department/Queue models; RBAC + queue-membership + RLS; `ticket_events` audit skeleton; Docker Postgres; Azure landing zone (App Service, Flexible Server, Key Vault) via Bicep + Azure DevOps pipeline. IT Helpdesk queue live. |
| **1 — MVP Ticketing** | Portal + agent workspace (Server Components/Actions); email-to-ticket via Graph; statuses/routing/assignment; internal vs public comments; Blob attachments; email notifications. |
| **2 — Service Management** | Dynamic form builder + service catalog (Zod-validated); SLA & escalation engine via WebJob sweep; approvals/workflow automation; KB with Postgres-FTS deflection. |
| **3 — Multi-Department Rollout** | Onboard Facilities, Marketing, HR, Ops with isolated queues; CSAT surveys; saved views. |
| **4 — Insight & Maturity** | Reporting dashboards (SQL views + SVG charts); agent scorecards; Teams notifications; CMDB/asset integration; advanced automation. |

---

## 18. Risks & Open Questions
1. **Background-job model** — confirm App Service **WebJob + advisory lock** is acceptable, or do we adopt Azure Functions now for cleaner separation? (Recommendation: WebJob first, matches the lean stack.)
2. **Cloud compliance sign-off** — GLBA/NCUA examiner acceptance of Azure hosting (region, Microsoft DPA, third-party risk assessment) before go-live.
3. **Azure subscription & landing zone** — existing tenant/subscription, region preference, and networking baseline to deploy into?
4. **CI/CD host** — Azure DevOps (matches PMO) vs GitHub Actions (repo is on GitHub today)?
5. **Email platform** — Microsoft Graph assumed; confirm per-queue shared mailboxes + webhook (change-notification) availability.
6. **Change/Problem management (ITIL)** — formal modules now, or ticketing + approvals first?
7. **CMDB scope** — native asset tracking vs integrate existing endpoint tooling only?
8. **Migration** — existing helpdesk/inbox history to import?
9. **Merge timing** — build standalone now with the integration seams from §15, or start inside a PMO monorepo from day one?

---
*End of specification — v0.2 (conformed to the PMO tech-stack blueprint).*
