# St. Mary's Bank — Enterprise Help Desk System
## Detailed Technical Specification

**Status:** Draft for review
**Author:** IT / Engineering
**Scope:** Custom Enterprise Service Management (ESM) platform, vibe-coded and hosted on **Azure App Service** with Azure managed services
**Audience:** ~300 employees across multiple IT teams and non-technical departments (Facilities, Marketing, HR, Operations)

---

## Table of Contents
1. [Overview & Goals](#1-overview--goals)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Data Model](#4-data-model)
5. [Roles & Permission Model (RBAC/ABAC)](#5-roles--permission-model)
6. [Core Subsystems](#6-core-subsystems)
7. [API Surface](#7-api-surface)
8. [UX / Screen Specifications](#8-ux--screen-specifications)
9. [Integrations](#9-integrations)
10. [Security & Compliance](#10-security--compliance)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Phased Delivery Plan](#13-phased-delivery-plan)
14. [Risks & Open Questions](#14-risks--open-questions)

---

## 1. Overview & Goals

### 1.1 Purpose
A single ticketing engine serving many isolated department workspaces. One platform handles IT (Helpdesk/Tier 1, Infrastructure, Applications, Network, InfoSec) and non-technical departments (Facilities, Marketing, HR, Operations), with strict per-queue/per-department access boundaries.

### 1.2 Design principles
- **Simple for end users** — file a request in < 30 seconds, no training required.
- **Powerful for agents & admins** — routing, SLAs, automation, reporting.
- **Compliance-grade** — GLBA/NCUA aligned, immutable audit trail, least-privilege by default.
- **Isolated by default** — a department only sees its own queues unless access is explicitly granted.
- **Cloud data residency** — all data and PII stay within a compliant Azure region (US) under a Microsoft enterprise agreement; no third-party SaaS.
- **Vibe-coded, ship-fast** — one cohesive full-stack codebase, managed Azure services over bespoke infra, iterate quickly with AI-assisted development.

### 1.3 Success metrics
- First-response SLA compliance ≥ 90%.
- CSAT ≥ 4.2 / 5.
- ≥ 25% ticket deflection via knowledge base self-service.
- Ticket creation median time < 30s.

---

## 2. Architecture

### 2.1 High-level topology (Azure PaaS)
```
                          ┌──────────────────────────────┐
   Employees ── HTTPS ──► │   Azure Front Door + WAF     │  TLS, WAF, CDN for static assets
                          └───────────────┬──────────────┘
                                          ▼
                          ┌──────────────────────────────┐
                          │   Azure App Service (Linux)   │  Next.js full-stack app
                          │  ┌────────────────────────┐   │   • End-User Portal (SSR/React)
                          │  │ UI (React) + API routes │   │   • Agent Workspace
                          │  └────────────────────────┘   │   • Admin Console
                          │   Auth · RBAC · Tickets · SLA │   • /api route handlers
                          │   Workflow · KB · Reporting   │
                          └───────┬───────────────┬───────┘
                                  │               │ triggers/timers
                                  │               ▼
                                  │      ┌──────────────────────┐
                                  │      │  Azure Functions      │  SLA checks, escalations,
                                  │      │  (background jobs)     │  email poll, survey dispatch
                                  │      └──────────┬────────────┘
        ┌──────────────┬──────────┼────────────────┼───────────────┬──────────────┐
        ▼              ▼          ▼                ▼               ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Azure DB for │ │  Azure   │ │  Azure   │ │ Azure Service│ │ Azure AI │ │ Microsoft    │
│ PostgreSQL   │ │  Cache   │ │  Blob    │ │ Bus / Storage│ │ Search   │ │ Entra ID     │
│ Flexible Srv │ │ for Redis│ │ Storage  │ │ Queue        │ │ (KB/     │ │ (SSO, MFA)   │
│ (OLTP+audit) │ │(sessions,│ │(attach., │ │ (job/event   │ │ ticket   │ │              │
│              │ │ cache)   │ │ AV-scan) │ │  bus)        │ │ search)  │ │              │
└──────────────┘ └──────────┘ └──────────┘ └──────────────┘ └──────────┘ └──────────────┘
        │                                                                        │
        ▼                                                                        ▼
┌──────────────┐                                                        ┌──────────────┐
│ Azure Key    │  secrets, connection strings, signing keys             │ Microsoft    │
│ Vault        │                                                        │ Graph (email)│
└──────────────┘                                                        └──────────────┘

         Observability: Application Insights + Azure Monitor / Log Analytics
```

### 2.2 Architectural style — pragmatic, single-codebase
- **One full-stack app** (Next.js App Router) deployed to **Azure App Service** — UI and API live in the same repo/deployable. This is the vibe-coding sweet spot: fast iteration, shared TypeScript types end-to-end, minimal moving parts.
  - Rationale: for a 300-user footprint, a single well-structured app on App Service is dramatically cheaper and simpler to operate than a microservice fleet, and Azure's managed services absorb the hard infra (HA, backups, patching, search).
- **Background work → Azure Functions** (timer + queue triggered) for SLA checks, escalations, email ingestion, survey dispatch, and notification fan-out — so long-running jobs never block web requests and scale independently.
- **Event-driven internals** — domain events (`TicketCreated`, `TicketAssigned`, `SlaBreached`, `ReplyPosted`) placed on an **Azure Service Bus / Storage Queue** drive notifications, automation, SLA recalculation, and audit logging without coupling.
- **Keep it boring** — module boundaries enforced by folder/domain structure in code; extract a separate service later only if a real bottleneck appears.

---

## 3. Technology Stack

Chosen for **fast, AI-assisted (vibe) development on Azure App Service** — one language end-to-end, managed services over self-hosted infra.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Full-stack framework | **Next.js 14+ (App Router) + TypeScript** | UI + API in one deployable; SSR for a snappy portal; runs natively on Azure App Service (Linux, Node). Single language = ideal vibe-coding loop. |
| UI system | Tailwind CSS + shadcn/ui (Radix under the hood), TanStack Query, TanStack Table | Fast to compose, accessible primitives, dense agent grids; themed with St. Mary's navy/gold tokens. |
| ORM / DB access | **Prisma** | Type-safe schema-first models, painless migrations — excellent for iterative vibe coding. |
| Database | **Azure Database for PostgreSQL — Flexible Server** | Managed HA, backups, PITR; JSONB for dynamic forms; row-level security; `pgvector` available if we add AI later. |
| Cache / sessions | **Azure Cache for Redis** | Session store, rate-limit counters, hot-path cache, lightweight event/queue use. |
| Background jobs | **Azure Functions** (timer + queue triggers) | Serverless SLA checks, escalations, email polling, survey dispatch, notification fan-out — scales independently of the web app. |
| Event/job bus | **Azure Service Bus** (or Storage Queues for MVP) | Durable domain-event delivery to Functions/automation. |
| Object storage | **Azure Blob Storage** | Attachments & KB media; **Microsoft Defender for Storage** for malware scanning. |
| Search | **Azure AI Search** | KB + ticket full-text, deflection suggestions, semantic ranking. Postgres FTS is fine for MVP to move fast. |
| Auth | **Microsoft Entra ID** via **Auth.js (NextAuth)** or **MSAL** | SSO, MFA, auto-provision users + department claim; App Service Easy Auth optional. |
| Email | **Microsoft Graph API** (M365) | Email-to-ticket ingestion + threaded outbound replies via per-queue mailboxes. |
| Edge / security | **Azure Front Door + WAF** | TLS, WAF rules, CDN for static assets, rate limiting. |
| Secrets | **Azure Key Vault** (referenced from App Service settings) | Connection strings, signing keys, API secrets — no secrets in code. |
| CI/CD | **GitHub Actions → Azure App Service** (deployment slots) | Push-to-deploy, staging slot + swap, automated tests & scans. |
| Observability | **Application Insights + Azure Monitor / Log Analytics** | Metrics, distributed tracing, logs, alerting — no infra to run. |

### 3.1 Brand design tokens (reused from existing site)
```
--navy-900:#0a2540  --navy-800:#0d3159  --navy-700:#123f70
--gold-500:#c99a2e  --gold-400:#dbb246  --gold-100:#f7ecd2
--ivory:#f8f6f1     --success:#1e7a4c
```
Status colors to add: `--warning:#b8860b`, `--danger:#b23b3b`, `--info:#123f70`.

---

## 4. Data Model

### 4.1 Entity relationship overview
```
Organization
  └─ Department ──< Queue ──< Ticket ──< TicketEvent (audit/timeline)
                     │          │  ├──< Comment (public | internal)
                     │          │  ├──< Attachment
                     │          │  ├──< Approval ──< ApprovalStep
                     │          │  ├──< SlaClock
                     │          │  ├──< TicketLink (parent/child/related/duplicate)
                     │          │  └──< SurveyResponse
                     │          └── FormSubmission (JSONB, per RequestType)
                     ├──< SlaPolicy
                     ├──< BusinessHoursCalendar
                     └──< RequestType (Service Catalog item) ──< FormDefinition

User ──< QueueMembership (role-scoped) 
User ──< Ticket (as requester / assignee)
Role ──< Permission
KnowledgeArticle ──< ArticleVersion
AutomationRule (trigger, conditions, actions)
```

### 4.2 Key tables (abridged schema)

**users**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| external_id | text | Entra/AD object id |
| email | citext unique | |
| display_name | text | |
| department_id | uuid FK | primary org department (from AD) |
| manager_id | uuid FK null | for approval routing |
| title, phone, location | text | synced from AD |
| status | enum(active, disabled) | |
| created_at, updated_at | timestamptz | |

**departments**
| id uuid PK · name · slug · parent_id (self FK) · admin_group · is_active |

**queues**
| id uuid PK · department_id FK · name · slug · description · default_assignee_id · default_sla_policy_id · business_hours_id · is_private (bool, default true) · created_at |

**queue_memberships** — the heart of scoped permissions
| id uuid PK · user_id FK · queue_id FK · role enum(agent, lead, dept_admin, collaborator, viewer) · granted_by · granted_at · expires_at (null) |

**tickets**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| reference | text unique | human key e.g. `IT-104829` |
| queue_id | uuid FK | |
| request_type_id | uuid FK null | Service Catalog item |
| requester_id | uuid FK | |
| assignee_id | uuid FK null | |
| subject | text | |
| status | enum | new, assigned, in_progress, pending, resolved, closed, cancelled |
| priority | enum(p1..p4) | derived from impact×urgency |
| impact, urgency | enum(high,med,low) | |
| category_id, subcategory_id | uuid FK | |
| source | enum | portal, email, phone, walkup, chat, api |
| form_data | jsonb | dynamic per request_type |
| sla_response_due, sla_resolve_due | timestamptz | |
| first_responded_at, resolved_at, closed_at | timestamptz | |
| reopen_count | int | |
| created_at, updated_at | timestamptz | |

**comments**
| id · ticket_id FK · author_id · body (rich text) · visibility enum(public, internal) · is_system (bool) · created_at |

**ticket_events** (immutable timeline + partial audit)
| id · ticket_id FK · actor_id · event_type · from_value · to_value · metadata jsonb · created_at |
> Append-only; never updated or deleted. Feeds the ticket timeline and compliance reports.

**attachments**
| id · ticket_id/comment_id FK · filename · content_type · size · storage_key · av_scan_status enum(pending,clean,infected) · uploaded_by · created_at |

**request_types** (Service Catalog)
| id · department_id/queue_id FK · name · description · icon · form_definition_id · default_priority · approval_chain_id (null) · is_active |

**form_definitions**
| id · name · schema jsonb (fields, types, conditional logic, validation) · version |

**sla_policies**
| id · department_id FK · name · targets jsonb ({p1:{response_mins, resolve_mins}, ...}) · business_hours_id · pause_on_statuses (array) |

**sla_clocks**
| id · ticket_id FK · clock_type enum(response,resolve) · target_at · paused_at · elapsed_ms · breached (bool) · breached_at |

**business_hours_calendars**
| id · name · timezone · weekly_schedule jsonb · holidays jsonb |

**approvals / approval_steps**
| approval: id · ticket_id FK · chain_id · status enum(pending,approved,rejected) |
| approval_step: id · approval_id FK · step_no · approver_id · status · decided_at · comment |

**automation_rules**
| id · scope(queue/dept/global) · trigger enum(on_create,on_update,on_reply,on_sla_warning,scheduled) · conditions jsonb · actions jsonb · is_active · run_order |

**knowledge_articles / article_versions**
| article: id · title · slug · visibility enum(public, internal) · department_id (null=all) · status enum(draft,in_review,published,archived) · current_version_id |
| article_version: id · article_id FK · body · author_id · change_note · created_at |

**surveys / survey_responses**
| survey: id · name · department_id · questions jsonb · trigger enum(on_close) |
| survey_response: id · ticket_id FK · survey_id · rating int · comment · submitted_at |

**roles / permissions** (global capability layer, combined with queue_memberships)
| role: id · name · is_system |
| permission: id · role_id FK · resource · action | e.g. (report, export), (queue, configure)

### 4.3 Dynamic forms
`request_types` point to a versioned `form_definitions.schema` (JSONB). Submissions store answers in `tickets.form_data` (JSONB). This keeps custom fields per department without schema migrations. Example schema fragment:
```json
{
  "fields": [
    {"key":"asset_tag","label":"Asset Tag","type":"text","required":true},
    {"key":"software","label":"Software Requested","type":"select",
     "options_source":"catalog:software"},
    {"key":"business_justification","label":"Justification","type":"textarea",
     "required_when":{"software":"non-standard"}}
  ]
}
```

---

## 5. Roles & Permission Model

### 5.1 Two-layer authorization
1. **Global role** (capability layer) — what *type* of things a user can do system-wide.
2. **Queue membership** (scope layer) — *which* queues/departments the user can act in, and at what level.

**Effective permission = Global role capabilities ∩ Queue membership scope.**

### 5.2 Global roles
| Role | Capabilities |
|------|--------------|
| End User | Create/track own tickets; use self-service KB; respond to own tickets & surveys. |
| Agent | Everything End User + work tickets in member queues (view, reply, assign-self, resolve, log time). |
| Team Lead | Agent + assign/reassign within queue, edit queue SLAs/forms, view queue reports. |
| Department Admin | Lead across *their department's* queues + manage members, categories, catalog, SLAs. |
| System Admin | Global configuration, integrations, all departments, user/role management. |
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

### 5.4 Enforcement
- **API layer:** every ticket query is filtered by the caller's queue memberships (policy-based authorization / middleware). No queue membership → the ticket does not exist for that user (404, not 403, to avoid enumeration).
- **Database layer (defense in depth):** PostgreSQL **row-level security** policies keyed on queue membership, so even a query bug cannot leak cross-department tickets.
- **Field-level:** internal comments and internal KB never serialize to End User / requester responses.
- **Privileged-action separation:** a requester cannot approve their own approval step; agents cannot self-approve privileged catalog requests (enforced in approval engine).

### 5.5 Cross-team collaboration
- **Add collaborator** grants a named user or queue temporary scoped access to a single ticket without exposing the whole queue.
- **@mention** notifies but does not grant access.
- **Escalate/transfer** moves a ticket between queues (e.g. Tier 1 → Infrastructure) with full history retained and an audit event.

---

## 6. Core Subsystems

### 6.1 Ticket lifecycle & state machine
```
                ┌──────── cancelled ◄─┐
                ▼                      │
new ─► assigned ─► in_progress ─► resolved ─► closed
        ▲   │           ▲   │          │
        │   └──► pending ┘   └── reopen ┘ (reopen_count++)
        └──────────────────────────────┘
```
- Transitions are validated server-side; each emits a `TicketEvent`.
- `pending` (awaiting requester/vendor) **pauses the resolution SLA clock**.
- Configurable per-department statuses layer on top of these canonical states.

### 6.2 Routing & assignment
- **Inbound routing rules** (ordered, per queue/global): match on source address, requester department, category, keyword → set queue, priority, assignee.
- **Assignment strategies:** manual pickup, round-robin, least-loaded, skill-based (agent skill tags vs request_type).
- **Load balancing** considers open ticket count + weighting by priority.

### 6.3 SLA & escalation engine
- Each ticket spawns `sla_clocks` (response + resolve) computed against the queue's `sla_policy` and `business_hours_calendar`.
- A **timer-triggered Azure Function** (plus scheduled Service Bus messages) evaluates clocks at warning thresholds (e.g. 75%, 90%, breach).
- On threshold: notify assignee/lead; on breach: mark `breached`, run escalation actions (reassign, bump priority, notify management).
- Clocks pause on `pending`/configured statuses; recalculated on queue transfer.

### 6.4 Workflow & automation engine
- Rules = **trigger → conditions (JSONB) → actions**.
- Triggers: `on_create`, `on_update`, `on_reply`, `on_sla_warning`, `scheduled`.
- Actions: set field, assign, add tag, post canned reply, create sub-tasks, start approval, send notification, call webhook.
- **Offboarding example:** trigger `request_type = employee_termination` → create child tickets in IT (disable accounts), Facilities (collect badge/keys), HR (exit checklist), with a parent that closes only when all children close.

### 6.5 Approvals
- `approval_chains` define ordered steps (manager → InfoSec → IT). Steps can be role-based, named-user, or dynamic (`requester.manager`).
- Approvers act via portal or one-click email/Teams action; decisions recorded with timestamp + comment (audit).
- Parallel or sequential steps supported; rejection halts the workflow and notifies requester.

### 6.6 Notification service
- Event-driven; per-user, per-event channel preferences (email, in-app, Teams/Slack).
- **Digest mode** to prevent fatigue; quiet hours; templated, brand-styled emails.
- Delivery tracked (sent/failed/retried) for reliability.

### 6.7 Knowledge base & deflection
- Public (all-staff) + internal (agent-only) articles; versioned with review/approval workflow.
- **Deflection:** as a user types a request subject, OpenSearch returns candidate articles inline — measured deflection rate reported.
- Article feedback + analytics (views, helpfulness, tickets-deflected).

### 6.8 Surveys (CSAT/CES)
- Auto-dispatched on ticket close (configurable per department), one-click rating + optional comment.
- Results feed agent scorecards and department dashboards; negative scores can auto-open a follow-up task for a lead.

### 6.9 Reporting & analytics
- Reads from a **reporting schema / materialized views** refreshed from domain events (CQRS-lite).
- **Operational:** open by queue, SLA compliance %, aging buckets, agent workload, backlog trend.
- **Management:** volume trends, FCR, MTTR, reopen rate, CSAT by dept/agent.
- **Compliance:** audit trail export, access reviews, retention reports.
- Scheduled delivery (email/PDF), CSV export; **every report scoped to the viewer's queue memberships** (a Facilities lead sees only Facilities data).

---

## 7. API Surface

REST (OpenAPI 3), JSON, versioned under `/api/v1`. AuthN via OIDC bearer tokens; AuthZ via policy middleware + RLS.

### 7.1 Representative endpoints
```
# Tickets
GET    /api/v1/tickets?queue=&status=&assignee=&priority=&q=   # scoped to caller
POST   /api/v1/tickets                                          # create (portal/api)
GET    /api/v1/tickets/{id}
PATCH  /api/v1/tickets/{id}                                     # status, assignee, fields
POST   /api/v1/tickets/{id}/comments                           # {body, visibility}
POST   /api/v1/tickets/{id}/attachments                        # multipart, AV-scanned
POST   /api/v1/tickets/{id}/transfer                           # {to_queue_id}
POST   /api/v1/tickets/{id}/links                              # {type, target_id}
POST   /api/v1/tickets/{id}/approvals/{step}/decision          # {approve|reject, comment}
GET    /api/v1/tickets/{id}/timeline                           # events + comments merged

# Catalog & forms
GET    /api/v1/catalog?department=
GET    /api/v1/request-types/{id}/form
POST   /api/v1/request-types/{id}/submit

# Queues & admin
GET    /api/v1/queues                                          # visible to caller
POST   /api/v1/queues/{id}/members                             # grant scoped role
PUT    /api/v1/queues/{id}/sla-policy
POST   /api/v1/automation-rules

# Knowledge base
GET    /api/v1/kb/search?q=                                    # visibility-filtered
GET    /api/v1/kb/articles/{slug}
POST   /api/v1/kb/articles/{id}/feedback

# Reporting
GET    /api/v1/reports/sla-compliance?department=&range=
GET    /api/v1/reports/csat?department=&range=
POST   /api/v1/reports/schedule

# Surveys
POST   /api/v1/surveys/{token}/respond                         # tokenized, no login needed

# Webhooks / integrations (inbound)
POST   /api/v1/ingest/email                                    # from mail worker
```

### 7.2 Conventions
- Cursor pagination, `ETag`/optimistic concurrency on ticket `PATCH`, idempotency keys on `POST`.
- All list endpoints server-side filtered by queue membership before returning.
- Rate limiting per user/IP at the gateway.

---

## 8. UX / Screen Specifications

### 8.1 End-User Portal (consumer-grade, mobile-first)
- **Home:** large "How can we help?" search (KB deflection first), tile grid of top request types per the user's department, "My Open Tickets" strip.
- **New Request:** pick a service → dynamic form (minimal required fields) → attach → submit. Inline KB suggestions while typing.
- **My Tickets:** list with status chips; detail view = timeline of public replies, add-comment box, reopen/close, satisfaction survey after close.
- Fully responsive (branch & floor staff on phones), WCAG 2.1 AA, brand navy/gold.

### 8.2 Agent Workspace (dense, keyboard-driven)
- **Three-pane:** queue/filter sidebar · ticket list (sortable TanStack Table, SLA countdown, priority color) · ticket detail.
- **Ticket detail:** requester + asset context, tabbed timeline (all / public / internal), canned responses & macros, one-click status/assign/priority, time log, linked tickets, approval panel.
- **Productivity:** keyboard shortcuts, bulk actions, saved views, "next unassigned" pickup, SLA-at-risk highlighting.

### 8.3 Admin Console
- Department & queue management, queue membership matrix editor (the permission grid), SLA policies, business-hours calendars, request types / form builder, automation rule builder, KB management, survey templates, integrations, user/role administration, audit log viewer.

### 8.4 Reporting Dashboards
- Configurable widget dashboards per role; drill-down; scheduled exports. Scoped to the viewer's departments/queues.

---

## 9. Integrations
- **Identity:** Entra ID / AD FS via OIDC/SAML — SSO, MFA, SCIM/graph sync of users, managers, departments, locations (seeds queue permissions & approval routing).
- **Email:** Microsoft Graph (M365) for email-to-ticket + threaded replies; per-queue mailboxes (`helpdesk@`, `facilities@`).
- **Collaboration:** Microsoft Teams (primary) / Slack — notifications, one-click approvals, create/lookup ticket.
- **Endpoint/Asset (Phase 4):** Intune / Jamf / SCCM for CMDB enrichment.
- **HRIS:** onboarding/offboarding triggers.
- **Outbound webhooks** for custom automations.

---

## 10. Security & Compliance

- **Data residency & cloud posture:** all data, attachments, and backups stay in a **US Azure region** under St. Mary's tenant. Rely on Azure's compliance inheritance (SOC 2, ISO 27001, FedRAMP; Microsoft's data-processing terms) and confirm coverage of GLBA/NCUA obligations with the examiner during vendor/cloud risk review.
- **Immutable audit log:** append-only `ticket_events` + a separate system audit store (auth events, config changes, access grants). Exportable for NCUA/examiners.
- **GLBA / PII:** data classification, field-level encryption (Postgres `pgcrypto`/app-layer) for sensitive fields, redaction tooling for KB/attachments.
- **AuthZ defense-in-depth:** policy checks in the API layer + PostgreSQL row-level security.
- **Least privilege & access reviews:** time-boxed queue grants (`expires_at`), periodic recertification reports; **Entra ID Conditional Access** + MFA at the front door.
- **Separation of duties:** no self-approval of privileged requests.
- **Attachment safety:** **Microsoft Defender for Storage** scans blobs on upload; quarantine/block on detection.
- **Transport & at-rest:** TLS 1.2+ (Front Door + App Service), Azure encryption at rest for DB/Blob (customer-managed keys optional), all secrets in **Azure Key Vault** (no secrets in code or config).
- **Hardening:** Azure Front Door **WAF**, security headers, rate limiting, input validation, output encoding, GitHub dependency/secret scanning, **Managed Identity** for service-to-service auth (no stored credentials), periodic pen tests; SOC 2-aligned controls.
- **Data retention & legal hold:** per-record-type retention policies, legal-hold flag prevents purge.

---

## 11. Deployment & Infrastructure (Azure)

### 11.1 Azure resource footprint
- **Azure App Service (Linux, Node)** — hosts the Next.js app. Start on the **P1v3 Premium** tier for VNet integration + autoscale; scale out on CPU/request rules.
- **Deployment slots** — `staging` slot for zero-downtime deploys via slot swap; smoke-test before swap.
- **Azure Functions (Consumption/Premium)** — background jobs (SLA, email poll, surveys, notifications).
- **Azure Database for PostgreSQL Flexible Server** — zone-redundant HA, automated backups + PITR, read replica optional.
- **Azure Cache for Redis**, **Azure Blob Storage**, **Azure AI Search**, **Azure Service Bus** — managed, no ops.
- **Azure Front Door + WAF**, **Azure Key Vault**, **Application Insights / Log Analytics**.
- **Networking:** App Service + Functions VNet-integrated; PostgreSQL and Redis reachable via **Private Endpoints** (no public DB exposure); **Managed Identity** for all service-to-service auth.

### 11.2 Environments & CI/CD
- **Dev → Staging → Production** via App Service slots + separate resource groups; prod-like staging with anonymized data.
- **GitHub Actions** pipeline: lint → test → build → deploy to staging slot → automated smoke tests → manual-gate swap to prod. SAST + dependency + secret scanning in the pipeline.
- **Infrastructure as Code:** Bicep (or Terraform) templates so the whole Azure footprint is reproducible and reviewable.

### 11.3 Observability
- **Application Insights** for request tracing, dependency timing, and custom metrics (SLA breach rate, queue depth, job latency); **Azure Monitor** alerts + dashboards; Log Analytics for query/retention. Availability tests ping the portal.

---

## 12. Non-Functional Requirements
| Attribute | Target |
|-----------|--------|
| Users | ~300 employees; ~40–60 concurrent agents peak |
| Availability | 99.9% business-hours via App Service autoscale + zone-redundant PostgreSQL; slot swaps for zero-downtime deploys |
| API latency | p95 < 300ms for ticket reads |
| Ticket volume | design for 100k+ tickets/yr, 5-yr retention |
| Search | KB/ticket results < 500ms |
| Accessibility | WCAG 2.1 AA |
| Browser support | Evergreen Chromium/Edge/Firefox/Safari |
| RPO / RTO | RPO ≤ 15 min, RTO ≤ 2 hrs |

---

## 13. Phased Delivery Plan

| Phase | Deliverables |
|-------|-------------|
| **0 — Foundations** | Azure landing zone (App Service, Postgres, Key Vault, Front Door) via Bicep + GitHub Actions CI/CD; Next.js scaffold; Entra SSO; user/dept/queue model; RBAC + queue-membership + RLS; audit log skeleton. IT Helpdesk queue live. |
| **1 — MVP Ticketing** | End-user portal, agent workspace, email-to-ticket, statuses/routing/assignment, internal vs public comments, attachments+AV, basic notifications. |
| **2 — Service Management** | Dynamic form builder + service catalog, SLA & escalation engine, approvals/workflow automation, KB with deflection. |
| **3 — Multi-Department Rollout** | Onboard Facilities, Marketing, HR, Ops with isolated queues; surveys/CSAT; Teams integration. |
| **4 — Insight & Maturity** | Full reporting/dashboards, agent scorecards, CMDB/asset integration, advanced automation, HA hardening. |

---

## 14. Risks & Open Questions
1. **Cloud compliance sign-off** — confirm GLBA/NCUA examiner acceptance of hosting member-adjacent data in Azure (region, Microsoft DPA/BAA, third-party risk assessment) before go-live.
2. **Azure subscription & landing zone** — is there an existing St. Mary's Azure tenant/subscription, region preference (e.g. East US 2), and networking baseline to deploy into?
3. **Email platform** — Microsoft Graph (M365) assumed; confirm per-queue shared mailboxes can be provisioned.
4. **Change/Problem management (ITIL)** — include formal change/problem modules, or ticketing + approvals only for now?
5. **CMDB scope** — build native asset tracking or integrate existing endpoint tooling only?
6. **AI triage** — with `pgvector`/Azure AI Search already in the stack, do we want auto-categorization & suggested replies in an early phase?
7. **Migration** — is there an existing helpdesk/email-inbox whose historical tickets must be imported?
8. **Cost guardrails** — set an Azure budget + alerts; right-size App Service/Functions tiers for ~300 users.

---
*End of specification — v0.1 draft for review.*
