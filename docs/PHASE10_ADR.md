# Phase 10 Architecture Decision Record — LPMS spine and operations

**Status:** Phase 10 **complete** (P10-16 closeout).  
**Date:** August 2026  
**Source:** Partner product discussion Aug 2026; `PHASE 10 - LPMS Spine and Operations Prompts.md`; live LexZim code review.  
**Product:** LexZim web SaaS (Next.js + Supabase + Railway)  
**Related:** `docs/ROADMAP_STATUS.md`, `docs/PHASE10_SMOKE_TEST.md`, `docs/PHASE11_CANDIDATES.md`, `docs/PHASE9_ADR.md`, `docs/PHASE6B_PAYROLL_HANDOFF.md`, `docs/INVOICING.md`, `docs/EMAIL.md`, `docs/RBAC.md`, `docs/CONFLICT.md`

**Hosting process (locked with partner):** develop and verify locally; commit and push once when the phase slice set is working and tested. Do not push after every prompt unless the partner asks.

**Closeout (P10-16):** Docs and smoke landed. No new product features in closeout. Deferred items stay honest: Phase 6B full statutory payroll; no silent client email campaigns; no zero-hallucination AI promise; firm users cannot hard-delete live financial history (platform purge only). Partner Railway regression is after an agreed push.

---

## 1. Context

Phases 0 to 9 shipped a working multi-tenant LPMS: clients, matters, documents, calendar, billing/trust/GL, HR leave (no payroll), AI RAG, email send, portal, diagnostics, and per-person access ticks.

Partner feedback shows the product is crossing from “feature pages” into a genuine operations spine: mobile use (especially AI), idle security, employee/HR payroll, invoice approval, calendar privacy, tasks/approvals, safer data lifecycle, grounded AI citations, and firm email for the T Pfigu pilot.

Phase 10 **extends** existing modules. It does **not** rebuild LexZim, replace Phase 8 diagnostics, or ship a full statutory payroll engine.

**Scope package (locked):** recommended package B, sequenced A-first (spine and UX and finance integrity first; then HR/payroll MVP, invoice approval, email, calendar privacy, tasks, AI grounding).

---

## 2. Honest gap vs current code

### 2.1 Nav / mobile

| Exists | Gap |
|---|---|
| `lib/nav.ts` sectioned sidebar; permission filtered; Phase 9 ticks | Sections are always expanded (title groups only) |
| `AppSidebar` + `mobileNavOpen` drawer (~900px in `tpfigu.css`) | No mobile bottom nav; not AI/tasks/calendar first |
| Finance/HR in-module tabs | Not the same as collapsible sidebar sections |

### 2.2 Idle sessions

| Exists | Gap |
|---|---|
| Supabase auth + `staffSessions`; revoke one/all; inactive user blocked | **No 30-minute inactivity logout** on staff web |
| Portal cookie TTL (8h) | Staff idle policy not implemented |

### 2.3 RBAC / delegation

| Exists | Gap |
|---|---|
| Role matrix + `user_permissions` (P9-05); MP protected | **No time-boxed delegation grants** (invoice/leave/advance approve) |
| Fixed system roles + free-text job title | Custom lawyer categories for pickers partially via `users.isLawyer` |

### 2.4 Client / matter archive vs hard delete

| Exists | Gap |
|---|---|
| Client soft archive / restore (`archivedAt`); cannot open matter on archived client | Archive does not always clear KPI/debtor confusion when invoices remain |
| Matter status closed/archived | No clear “retain revenue” UX copy on delete/close |
| Schema: `matters.clientId` CASCADE; `invoices.matterId` CASCADE; `invoices.clientId` SET NULL | Hard client delete would cascade matters/invoices: **landmine**. No day-to-day firm hard-delete API (good) |
| Firm-level ops purge (`lib/privacy/purge-firm.ts`) | **No platform-only purge test client** that removes invoices/payments so outstanding KPIs go to zero |
| Dashboard outstanding (`lib/repos/dashboard-charts.ts`) sums invoices in `sent`/`overdue`/`draft` with **no join filter on client.archivedAt** | Archived or orphaned dummy fees can still inflate “outstanding fees” (matches partner bug report) |

### 2.5 Invoice statuses / receipts / revenue

| Exists | Gap |
|---|---|
| Statuses `draft \| sent \| paid \| overdue \| void`; send posts GL; fee payments + receipt numbers; letterhead PDF/DOCX/XLSX | **DONE** Pending approval / Approved via `approval_state` (P10-07); GL still on Sent |
| Line `workDate` already optional in `lib/billing/validation.ts` | UI defaults blank; letterhead does not invent dates (P10-06) |
| Firm `invoicePaymentNote` + banking on letterhead | Contested pro forma sentence stripped (P10-06); banking/payment note **9pt** Trebuchet |
| Cash/bank payment paths and receipt PDF | UI must make Payment → Receipt → Revenue obvious and consistent |

### 2.6 HR vs users / leave / payroll

| Exists | Gap |
|---|---|
| `users` (`isSystemUser`, `isLawyer`) + optional `hrStaffProfiles.userId` | Login user ≠ forced employee; test-user flag not formalised |
| HR contracts + leave types/requests | No leave **ledger** (entitlement/used/pending/remaining) as first-class |
| Nav copy and diagnostics: payroll deferred (Phase 6B) | Phase 10 delivers **payroll MVP + salary advances** (not full PAYE/NSSA) |
| Directory lawyers without login | Keep; do not remove |

### 2.7 Calendar privacy

| Exists | Gap |
|---|---|
| Firm diary; create modal (P9-03); matter-scoped visibility | **DONE (P10-12):** `private` \| `firm` \| `people` + shares |
| Appointment validation may require client or matter | **DONE:** only **title + location** mandatory |
| No per-user persistent colour | **DONE:** `users.calendar_color` + colour picker |

**Shipped (P10-12):** New events default to **private**. Existing diary rows were backfilled to **firm** so current firm-wide visibility was preserved. Tabs: My / Firm / Shared with me. Day click creates for that date (08:00–09:00). MP does not auto-see others' private events.

### 2.8 AI citations / web / document gen

| Exists | Gap |
|---|---|
| Multi-provider; RAG; firm memory; allowlisted web (`trusted-lookup`: ZimLII, Veritas, Parliament) | **DONE (P10-15):** precise Act/section labels via `headingPath`; verify pass; weak-grounding UI |
| DOCX drafting path | **DONE (P10-15):** house style Trebuchet 12 / 1.5 / justified / black (`lib/ai/drafting/house-style.ts`) |
| Disclaimer present | Assistive + lawyer-must-verify; **no** zero-hallucination promise |

### 2.9 Email

| Exists | Gap |
|---|---|
| Firm SMTP settings; send quote/invoice/receipt; compose API | **P10-14 DONE:** manual Send modal (To/Subject/note/attachment); audit `email.sent` / `email.failed`; pilot From via firm settings only; no auto client email |
| Per-firm From in settings | Pilot: set T Pfigu From to `info@tpfiguattorneys.com` in **that firm’s settings only**. Never hardcode as global LexZim default |

### 2.10 Tasks / approvals / notifications / conflict / audit

| Exists | Gap |
|---|---|
| Matter `pendingProcedures`; leave + password-reset approvals | **DONE (P10-11):** firm Tasks + Approvals inbox; notifications for assign/complete |
| `staffNotifications` + topbar | Expand event types (tasks, invoice approval, advances) |
| KYC wizard real; `conflict_checks` / intakes **schema present, app dead** | Rebuild conflict workflow on new client |
| `writeAuditLog` widely used | Audit every new Phase 10 transition (purge, delegation, approval, email send) |

---

## 3. Locked decisions (copy from Phase 10 prompts)

| Decision | Choice |
|---|---|
| Full financial wipe | **Platform / development account only** (`requireOpsAccess`). Firm MP archives/closes; does not full-wipe live money from product UI |
| Calendar default | **Private by default**; explicit share firm or people |
| Idle logout | **30 minutes inactivity** |
| Invoice line dates | Optional |
| Invoice footer | Keep cash/Nostro wording; **remove** contested pro forma sentence for now |
| Banking + payment note | Trebuchet MS **9pt** on PDF/DOCX/XLSX |
| Invoice workflow | Draft → Pending approval → Approved → Sent → Partially paid → Paid (+ Rejected/Void/Cancelled/Overdue) |
| Invoice approval | Real workflow; firm setting default **ON**; MP can delegate |
| Email | Manual Send only |
| T Pfigu email | From `info@tpfiguattorneys.com` for that tenant only |
| Employees | Normal login users are employees; exceptions: platform/dev and explicit test user |
| Lawyer eligibility | Only lawyer-capable people in matter/client lawyer pickers |
| AI | Retrieve → generate → verify → cite; **no zero-hallucination promise** |
| Document gen | AI content; LexZim house style pack |
| Mobile | Bottom nav Home \| Tasks \| AI \| Calendar \| More |
| Sidebar | Collapsible module sections |

**GL posting rule (Phase 10 preference):** keep GL post on **Sent** (not on mere Approved). Approved means ready to send. KPI/AR counting for “outstanding” should align with sent/overdue (and fix draft inclusion + archived-client leakage in P10-02).

**P10-07 implementation:** `invoices.approval_state` (`none|pending|approved|rejected`) is a pre-send gate; AR `status` stays `draft` until Mark sent. Firm setting `require_invoice_approval` defaults **ON** (off only when stored `"false"`). Approvers: `invoice.approve` (MP / role / ticks / delegation). Audit: `invoices.approval.{submit|approve|reject}` and existing `invoices.status`.

---

## 4. Entity sketch (evolve, do not big-bang rewrite)

```
Client ──archive──▶ archived (finance retained)
      └──platform purge──▶ cascade remove test data (ops only)

Matter ──close/archive──▶ retain revenue by default

Invoice: draft → pending_approval → approved → sent → partially_paid → paid
         ↘ rejected / void / cancelled ; overdue as status/derived

Payment ──▶ Receipt ──▶ updates invoice balance ──▶ revenue/KPI/GL (existing posting)

User (login)
  ├── Employee profile (hr_staff_profiles)   [required for normal users]
  ├── test_user flag                         [optional non-employee]
  └── is_lawyer / category capability        [matter assignment]

DelegationGrant(grantor, grantee, capability, expires_at?)

Task(assigner, assignee, due, status, feedback)

LeaveLedger(employee, leave_type, entitlement, used, pending, remaining)
LeaveRequest → updates ledger on approve

SalaryAdvance(request → finance check → management decision → balance)
PayrollPeriod(employee lines, advances applied, mark paid)

CalendarEvent(visibility: private|firm|people, shares[], colour from owner)

DebtorCommunication(client/invoice, channel, outcome, next_follow_up)

ConflictCheck(client, result, checked_by, notes)  [revive/replace dead tables]

KnowledgeReport(title, author, file, permissions)
```

**Person model:** do **not** introduce a separate `persons` table in Phase 10 unless forced. Evolve `users` + `hr_staff_profiles` + flags.

---

## 5. Module map after Phase 10 (routes evolve additively)

| Section | Items (illustrative) | Notes |
|---|---|---|
| Overview | Dashboard | Stays simple |
| Practice | Clients, Matters, Documents, CRM, Conflict (as part of clients), Communications notes | Calendar may stay here or split |
| Finance | Invoicing, Debtors (+ timeline), Trust, Recon, Expenses, Reports, Receipts emphasis | Existing finance tabs |
| HR | Staff, Contracts, Leave, Advances, Payroll MVP | Extend `/hr` |
| Workflow | Tasks, Approvals | New section |
| Calendar | My / Firm / Shared with me | Upgrade `/calendar` |
| Knowledge | Event / BD / training reports | New |
| AI | Assistant, Generate document | Existing `/ai` |
| System | Staff/users, Delegations, Audit, Settings, Email | Existing + delegation |

Do **not** delete existing routes mid-phase. Aliases (`/billing`, etc.) remain.

Mobile bottom: Home | Tasks | AI | Calendar | More.

---

## 6. Non-goals

- Full ERP payroll tax engine (PAYE/NSSA filings, bank files) beyond MVP deductions/advances (deeper work can remain labelled 6B/11)
- Open unrestricted web scrape
- Automatic client marketing / birthday blasts without explicit Send
- Hard-delete of live financial history for ordinary firm users (including MP product UI)
- Rewriting Phase 8 diagnostics
- Desktop installers
- Shared-by-default calendars
- Promising zero AI hallucination

---

## 7. Form contracts (honour in P10-09 / P10-10)

### Salary advance (`T_Pfigu_Attorneys_Salary_Advance_Request_Form.docx`)

Employee: name, position/department, employee number, application date.  
Request: amount USD, amount in words, reason.  
Declaration acceptance.  
Finance: gross, net, existing advance balance, proposed advance, proposed monthly deduction, recommended months, prepared/checked by.  
Management: approved / subject to amendment / not approved; approved amount, monthly deduction, months, effective deduction date, comments, authorised by, designation.

### Next of kin (`Next_of_Kin_Form.docx`)

Employee block + primary next of kin (name, relationship, phones, address, email, occupation) + declaration/consent + office received/filed metadata.

---

## 8. Cascade / outstanding risk addendum (for P10-02)

1. Soft-archived clients can still leave `sent`/`overdue`/`draft` invoices in outstanding queries because charts/debtors do not consistently filter `clients.archived_at`.
2. Including **`draft`** in outstanding fees (`dashboard-charts.ts`) overstates “amount owing” vs partner expectation (usually sent AR). Phase 10 should stop counting draft as outstanding unless product explicitly wants draft exposure.
3. Platform purge must delete or void-and-exclude invoice/payment rows for the purged client so KPIs drop to truth.
4. Firm MP UI: archive/restore only. Purge API: `requireOpsAccess` only, typed confirmation phrase, dependency counts, audit summary without secrets.

### P10-13 shipped

- Debtor communications timeline: `debtor_communications`; Finance → Debtors expand/URL `?clientId=`; Client billing tab; `billing.view` / `billing.manage`; audit `debtor.communication.create`.
- Conflict checks: search clients/matters/related parties; Clear|Potential|Blocked on client; firm setting `require_clear_conflict` (default ON) gates matter **open**; KYC create → `?conflict=1`; audit `conflict.check.create`. See `docs/CONFLICT.md`.
- Knowledge reports: `/knowledge/reports` upload/list/download; permissions `knowledge.reports.view` / `.manage`; storage `knowledge-reports/{id}/file`; separate from AI knowledge_sources; audit upload/download. Run `npm run db:seed:rbac` so non-MP roles pick up permission defs.

### P10-11 shipped

- Firm tasks (`firm_tasks`): any employee with `dashboard.view` can assign to any active system user. Fields: title, description, assignee, assigner, due, priority (low|normal|high), pending|done, completion feedback.
- Routes `/workflow/tasks` and `/workflow/approvals`; mobile Tasks tab already targets tasks. Nav Workflow section includes Approvals.
- Notifications: `task.assigned`, `task.completed`. Overdue flagged in list UI (no spam notifications). Leave/advance/invoice approval notifications unchanged.
- Approvals inbox aggregates leave (requested), salary advances (submitted|finance_reviewed), invoices (`approval_state` pending), password resets (pending) for users with the matching permission. Cap 50, newest first. Links to source screens.
- Distinct from matter `pendingProcedures` (untouched).

### P10-10 shipped

- Leave ledger (`hr_leave_entitlements` + `/api/hr/leave-ledger`); leave approve via `leave.approve` or `hr.manage`; creator notifications.
- Salary advances form workflow + discretionary approval; payroll periods/lines with advance recovery on mark paid.
- HR nav: Advances + Payroll tabs.

### P10-04 shipped

- Collapsible sidebar sections (localStorage per user). Overview always open. Mobile bottom nav Home|Tasks|AI|Calendar|More. Tasks shell at /workflow/tasks. AI mobile chat-first padding.

### P10-03 shipped

- IdleSessionGuard in AppShell; 30 min inactivity; login ?reason=idle message; audit auth.idle_logout.

### P10-02 shipped

- Dashboard outstanding and overdue: active clients only; statuses sent/overdue (draft excluded). Active client counts ignore archived.
- Debtors: inner join active clients.
- Soft archive confirm copy explains revenue retention; matter detail notes close/archive keeps fees.
- Platform purge: lib/privacy/purge-client.ts, GET/DELETE /api/platform/clients/purge, Ops Console Purge test client. Phrase DELETE CLIENT + matching client number. Removes quotations, invoices/payments/lines, trust ledger rows for that client, then client (matters cascade). Audits start/complete. No firm-product purge button.


---

## 9. Prompt progress

| Prompt | Task | Status |
|---|---|---|
| P10-01 | ADR + gap + roadmap | **DONE** |
| P10-02 | Data lifecycle + platform purge | **DONE** |
| P10-03 | Idle logout | **DONE** |
| P10-04 | Collapsible nav + mobile bottom | **DONE** |
| P10-05 | Delegation grants | **DONE** |
| P10-06 | Invoice polish (dates, footer, 9pt) | **DONE** |
| P10-07 | Invoice approval state machine | **DONE** |
| P10-08 | Payments, receipts, revenue consistency | **DONE** |
| P10-09 | Employee spine, next of kin, lawyer eligibility | **DONE** |
| P10-10 | Leave ledger + advances + payroll MVP | **DONE** |
| P10-11 | Tasks + approvals + notifications | **DONE** |
| P10-12 | Calendar privacy | **DONE** |
| P10-13 | Debtor timeline + conflict + knowledge | **DONE** |
| P10-14 | Firm email (T Pfigu From) | **DONE** (manual send UX; pilot From via firm settings only; no auto client email) |
| P10-15 | AI grounding + house style | **DONE** (verify pass; precise citations; DOCX house style; assistive disclaimer) |
| P10-16 | Docs, smoke, closeout | **DONE** |

---

## 10. Related code hooks (do not rebuild)

- Nav: `lib/nav.ts`, `components/shell/*`
- Sessions: `lib/auth/staff-sessions.ts`, Auth shell
- RBAC: `lib/rbac/matrix.ts`, `user_permissions`
- Clients: `lib/repos/clients.ts`, archive/restore routes
- Ops: `lib/platform/ops-guard.ts`, ops purge patterns
- Billing: `lib/repos/billing.ts`, `lib/billing/validation.ts`, `lib/export/invoice-letterhead-model.ts`
- HR: `hrStaffProfiles`, `hrLeave*`
- Calendar: `components/calendar/CalendarView.tsx`
- AI: `lib/ai/rag/*`, `lib/ai/web/trusted-lookup.ts`, drafting DOCX
- Email: `lib/email/*`, Settings Email panel
- Notifications: `lib/notifications/staff.ts`
- Audit: `lib/auth/audit.ts`
