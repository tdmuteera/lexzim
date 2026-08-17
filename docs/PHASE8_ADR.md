# Phase 8 Architecture Decision Record — Diagnostics & Self-Healing

**Status:** Accepted. **Phase 8 complete** (P8-01 to P8-14). Next product track remains **Phase 6B payroll** (deferred) unless partners define otherwise.  
**Date:** August 2026  
**Source brief:** Master prompt for LPMS self-diagnostics, observability, root-cause analysis, and controlled self-healing, refined against current LexZim code  
**Product:** LexZim web SaaS (Next.js + Supabase + Railway)  
**Related:** `PHASE 8 - Diagnostics & Self-Healing Prompts.md`, `docs/ROADMAP_STATUS.md`, `docs/PHASE8_WORKFLOWS.md`, `docs/PHASE8_FRONTEND.md`, `docs/PHASE8_SMOKE_TEST.md`, `docs/PHASE8_DIAGNOSIS.md`, `docs/cloud/OPS_RUNBOOK.md`

---

## 1. Context

Phases 0 to 7 shipped a working practice platform: matters, clients, KYC, finance, trust, GL, CRM, exports, email, and platform ops. When something fails today, staff see a generic message, Railway logs a redacted JSON line, and DevOps guesses from `/api/health` or `/api/db-status`. There is no request correlation, no persisted technical timeline, no workflow contract, and no approved path from "this broke" to a safe next step.

The goal of Phase 8 is to add a **Self-Diagnostics, Observability, Root-Cause Analysis, and Controlled Self-Healing** layer. Diagnose first. Repair only with approval. **Do not rebuild** product modules, branding, routes, or Phase 0 to 7 schema except additive diagnostic tables.

LexZim nouns stay: **matters** (not cases), clients, invoices, trust, GL, quotations, KYC.

---

## 2. Honest gap vs current code

### 2.1 What already exists (extend, do not replace)

| Surface | Path | What it does today | Gap |
|---|---|---|---|
| Railway / env health | `app/api/health/route.ts` | Fast env flags: Supabase URL, `DATABASE_URL`, service role, version. No DB ping. Cheap enough for a liveness probe. | No `requestId`. No functional checks. Does not distinguish connectivity from pending migrations. |
| DB smoke | `app/api/db-status/route.ts` | `select 1`, pgvector present, `app_meta` present. Does not leak connection strings. | No migration pending count. No circuit state. No SQLSTATE class. |
| Platform health | `app/api/platform/health/route.ts` | Ops-only: firm counts, licences, AI job queues, env booleans. No matter contents. | Firm/licence ops metrics, not a request timeline or workflow health. |
| Ops console | `components/ops/OpsConsole.tsx`, `app/ops/page.tsx`, `app/ops/layout.tsx` | Platform admin UI: firms, licences, purge, compact health. Guarded by `requireOpsAccess`. | No Diagnostics tab. Do not invent a second console. |
| Ops guard | `lib/platform/ops-guard.ts` | Platform admin + optional `OPS_IP_ALLOWLIST`. | Correct hang point for all diagnostic APIs. |
| Safe logging | `lib/ops/log.ts` | `redactSecrets`, `redactEmail`, JSON lines to stdout (Railway). | Console only. Not a queryable event store. No `requestId` field. |
| API errors | `lib/auth/http.ts` `jsonError` / `jsonOk` | `{ ok: false, error: { code, message } }`. Maps AuthError, DatabaseUnavailableError, AiBudgetExceededError. 5xx is `"Unexpected server error."` | No `requestId`, no `module`, no `X-Request-Id` header. `jsonOk` has no correlation id. |
| Firm audit | `lib/auth/audit.ts` `writeAuditLog` → `audit_logs` | Product actions (auth, finance, exports, email, security) per firm. | Not a technical trace. Must not dump stacks or KYC into this table. |
| DB circuit | `lib/db/connectivity.ts`, `lib/db/index.ts` | SQLSTATE `08xxx` / socket codes only. Schema errors (e.g. `42703`) are **not** treated as connectivity. Cooldown via `markDbUnavailable` / `clearDbUnavailable`. | Circuit state is in-process memory, not visible in ops health. No audited reset action. |
| Platform error UI | `app/(platform)/error.tsx` | Generic "Something went wrong" or `DbUnavailableView`. Still matches the string `"Failed query"` as a DB outage hint. | No staff `requestId`. `"Failed query"` match can mislabel schema bugs (same class of bug connectivity.ts already fixed). |
| Nav / RBAC | `lib/nav.ts`, `lib/rbac/*` | Product modules and permissions. | **P8-07 shipped:** generated snapshot + overlay. Workflow contracts still P8-08. |
| AI | Phase 2 assistant | Grounded legal chat. | Not wired to diagnostic evidence. Must not write production code. |

### 2.2 What does not exist yet (this phase)

- Correlation IDs on API responses
- Persisted, redacted diagnostic events and spans
- Searchable ops Diagnostics UI under `/ops`
- Generated module registry plus severity/recovery overlay (**P8-07 shipped**)
- Workflow contracts for the seven v1 paths (**P8-08 shipped:** `lib/diagnostics/workflows.ts`, `docs/PHASE8_WORKFLOWS.md`)
- Frontend telemetry (error boundary with `requestId`, failed fetch, `unhandledrejection`) (**P8-09 shipped**)
- Known layout-anomaly detectors (overflow clip, missing chart labels) (**P8-10 shipped**)
- Rules engine then evidence-bound AI diagnosis (**P8-11 shipped**)
- Allowlisted runtime heal with two-step approval
- Patch **proposals** (markdown/diff), never silent production edits

### 2.3 Recent incidents that inform the design (not new product work)

1. Login looked like "database unreachable" because pending migrations (`0017` to `0024`) caused `42703` on `users.must_change_password`, and a generic `"Failed query"` wrapper was treated as connectivity. **Fix already in** `isDbConnectivityError()`. Phase 8 must keep this distinction in health and rules.
2. Dashboard KPI strip clipping and lawyer chart labels were **already fixed**. Phase 8 adds regression tests and optional detectors, not a redesign.

---

## 3. Decision summary (locked)

| Topic | Decision |
|---|---|
| Product behaviour | Unchanged unless a change is required to attach correlation IDs or a safe error envelope |
| Architecture | **Extend** health, ops, logging, and `jsonError`. Do not replace them |
| Diagnostics UI | Platform ops at `/ops` (new Diagnostics page or tab). No second console |
| Firm users | Safe message only. Managing Partner and other staff may see a `requestId`. No stacks, SQL, or secrets in the product UI |
| Technical detail | Platform admin / DevOps only (`requireOpsAccess`) |
| Correlation | Every API response (ok and error) carries `requestId`. Echo a sane incoming `X-Request-Id` or mint a UUID. Return `X-Request-Id` header |
| Error envelope | Extend `jsonError`: `{ ok: false, error: { code, message, module?, requestId } }`. Keep existing AuthError / DatabaseUnavailableError / AiBudgetExceededError mapping |
| Event store | Persist **redacted** diagnostic events. Reuse `redactSecrets` / `redactEmail`. Failures to persist must never fail the user request |
| Registry | **Generated** from `lib/nav.ts`, `app/api/**/route.ts`, and Drizzle table names, plus a small **hand overlay** for module codes, severity, and recovery |
| Workflows v1 | Login, create client, create matter, create invoice, post fee payment, trust receipt, export report |
| Rules vs AI | Deterministic classifiers first. AI diagnosis only from a redacted evidence pack. No write access to production code or user data |
| Repair split | **Runtime self-heal** (retry, circuit reset, requeue, owned cache flush) vs **code patch proposals** (diff + tests + human apply) |
| Auto-edit | **Forbidden** on production. App must not write into `src/` or apply patches itself |
| Approval | Every mutating diagnostic action requires an authenticated ops admin and is audited |
| Schema | Additive diagnostic tables. Do not alter product tables for this phase except if a later prompt needs a tiny nullable column (none planned at P8-01) |
| APM vendors | Not required. First-party store is enough for v1 |
| Payroll / bank feeds | Out of scope |

---

## 4. Data classification

Diagnostic storage is a **technical** store, not a second copy of the practice file.

### 4.1 MAY be stored

- `requestId`
- `module` code (see §8)
- Route or page path **without** query string PII
- HTTP method and status
- Error code, SQLSTATE (e.g. `42703`, `08006`)
- Duration in ms
- User **role** (e.g. `managing_partner`), not full email
- `user_id` and `firm_id` as UUIDs only
- Circuit open/closed, migration pending **count** or latest filename
- Redacted safe message (max ~500 chars after `redactSecrets`)
- Event/span IDs as diagnosis evidence
- Allowlisted repair `action_code` and redacted result

### 4.2 MUST NEVER be stored

- Passwords, temp passwords, password hashes
- JWTs, cookies, `Authorization` headers, proxy tokens
- SMTP passwords, API keys, `DATABASE_URL`, service role keys
- KYC fields (names, ID numbers, PEP, source of funds, UBO rows)
- Matter titles, document bodies, AI chat contents
- Trust amounts, fee amounts, invoice line text, bank account numbers
- Full email addresses (use `redactEmail` if an identifier is unavoidable)
- Raw SQL with bind values

App-layer redaction (P8-04) strips keys matching `password|secret|token|authorization|cookie|kyc|matterTitle|amount|iban|smtp` and truncates strings.

---

## 5. Audience

| Audience | What they see |
|---|---|
| Lawyers and accounts staff | Existing safe copy ("Cannot reach the database…", "Unexpected server error.", validation messages). Optional small **Reference: {requestId}** on staff error surfaces (login, toasts). |
| Managing Partner | Same as staff. May use the reference id when calling DevOps. No `/ops` unless they are also a platform admin. |
| Platform ops / DevOps | `/ops/diagnostics`: health board, event search by `requestId`, traces, diagnoses, allowlisted runtime actions, patch proposal list. |
| Clients (portal) | Unchanged public-safe messages. No technical `requestId` required on portal in v1 (optional later). |

`/ops` remains `robots: noindex`. Copy: no matter contents.

---

## 6. Seven v1 workflows

These are the only workflow contracts in v1 (**P8-08 shipped**). Names are LexZim, not generic LPMS. Details: `lib/diagnostics/workflows.ts`, `docs/PHASE8_WORKFLOWS.md`.

| Id | Module | Notes |
|---|---|---|
| `auth.login` | `auth` | Session cookie. Failed credentials are **not** an outage. |
| `clients.create` | `clients` | Compulsory KYC: type, first name, surname, phone, WhatsApp. |
| `matters.create` | `matters` | Firm-scoped matter numbers. Depends on client. |
| `finance.invoice.create` | `finance.invoicing` | Fee invoice, not trust. GL post is a dependency if Phase 7 posting is enabled. |
| `finance.payment.post` | `finance.invoicing` | Fee payment against invoice. **Trust wall:** this is not a trust receipt. |
| `finance.trust.receipt` | `finance.trust` | Trust receipt with reference. GL mirrors trust asset/liability. Never classified as a fee payment. |
| `reports.export` | `exports` | PDF or Word or Excel via `lib/export` registry. |

Further workflows (email send, password reset, GL journal, leave) can join a later overlay. They are not v1 contracts.

---

## 7. Non-goals

- Rebuilding LPMS modules, Finance, HR, or GL
- Unrestricted self-modifying production code
- Datadog, Sentry, or any APM as a hard dependency
- Payroll (Phase 6B, still deferred)
- Bank feeds or payment gateways
- A second admin console beside `/ops`
- Storing KYC, trust balances, or matter documents in traces
- AI with write access to the running app or git tree
- Treating dashboard clip / lawyer chart bugs as greenfield builds

---

## 8. Module map

Use these `module` codes in envelopes, events, and the registry overlay:

| Code | Product area |
|---|---|
| `auth` | Login, session, password reset |
| `clients` | Client registry + KYC |
| `matters` | Matters (case files) |
| `documents` | Document store |
| `calendar` | Meetings, hearings, diary |
| `crm` | Birthdays, holidays |
| `finance.invoicing` | Fee invoices / quotes |
| `finance.debtors` | Aged AR |
| `finance.trust` | Trust bank, vault, client ledgers |
| `finance.recon` | Reconciliations |
| `finance.expenses` | Expenses, cashbook, petty cash, creditors |
| `finance.gl` | Chart of accounts, journals, TB, P&L, BS |
| `finance.reports` | Finance packs |
| `hr` | Staff, contracts, leave |
| `reports` | Practice reports, lawyer performance |
| `exports` | PDF / Word / Excel engine |
| `email` | Firm SMTP send |
| `ai` | AI assistant |
| `dashboard` | Home KPIs and widgets |
| `platform` | Ops, licences, firms |
| `db` | Connectivity, migrations, circuit |

---

## 9. Permission sketch

Firm RBAC (`lib/rbac`) does **not** gain diagnostics permissions. Ordinary roles (lawyer, accounts, MP) cannot list traces.

| Capability | Who | Mechanism |
|---|---|---|
| `diagnostics.view` | Platform admin | `requireOpsAccess` on GET health, events, registry, workflows, diagnoses |
| `diagnostics.repair` | Platform admin | Same guard on POST runtime heal and patch-proposal status changes |
| IP allowlist | Optional | Existing `OPS_IP_ALLOWLIST` |

If a later prompt needs named permission strings in `platform_admins` metadata, keep them ops-only. Do not add `diagnostics.*` to `lib/rbac/matrix.ts` for firm users.

Repair mutations also write `diagnostic_repair_actions` and a redacted audit row. They must never post trust or fees or run arbitrary SQL.

---

## 10. Repair model (preview for P8-12 / P8-13)

```
Failure → correlate requestId → persist redacted events
       → rules classifier (required)
       → optional AI second opinion (evidence pack only)
       → recommended_action:
            none | retry | inspect_health | runtime_heal | propose_patch
```

**Runtime heal (app can execute after confirm=true):** circuit reset, pool recycle if safe, health recheck, requeue a known job by id, flush an in-process cache we own.

**Patch proposal (app cannot execute):** markdown under `docs/diagnostics/proposals/`, optional unified diff, human applies via PR. Status: proposed → approved (human) → succeeded / rolled_back / rejected.

---

## 11. Implementation order

| Sub-phase | Prompts | Outcome |
|---|---|---|
| A Foundation | P8-02 to P8-06 | **Shipped:** schema, correlation, persist, health, `/ops/diagnostics` |
| B Registry | P8-07 to P8-08 | **Shipped:** generated registry + seven workflows |
| C Frontend | P8-09 to P8-10 | **Shipped:** browser telemetry + known layout detectors |
| D Diagnosis | P8-11 | **Shipped:** rules first, optional AI second opinion, no code writes |
| E Remediation | P8-12 to P8-14 | **Shipped:** runtime heal, patch proposals, runbook + smoke closeout |

P8-01 is this ADR. Phase A (through P8-06) is shipped. P8-07 is shipped: `npm run diagnostics:registry` writes `lib/diagnostics/registry.generated.ts`; overlay in `lib/diagnostics/registry.overlay.ts`; merge via `getModuleRegistry()`; ops UI Registry tab and `GET /api/ops/diagnostics/registry`.

**Phase B shipped (P8-08):** seven workflow contracts in `lib/diagnostics/workflows.ts`, dependency graph JSON + mermaid in `docs/PHASE8_WORKFLOWS.md`, `GET /api/ops/diagnostics/workflows`, Workflows tab. Trust receipt is never classified as a fee payment. Invoice create lists `finance.gl` / `postInvoiceSentGl`.

**P8-09 shipped:** `lib/diagnostics/client.ts`, `POST /api/diagnostics/client-event`, root + platform error boundaries with reference id, listeners in `AuthProvider`, wired on login / dashboard / invoice create / matter save. See `docs/PHASE8_FRONTEND.md`.

**Phase C shipped (P8-10):** known layout detectors in `lib/diagnostics/ui-anomalies.ts` (`ui.overflow_clip`, `ui.chart_label_hidden`, `ui.controlled_input`), probes on dashboard / finance / reports, `npm run diagnostics:ui-anomalies`, `docs/PHASE8_SMOKE_TEST.md`. No CSS redesign unless a detector proves a regression.

**Phase D shipped (P8-11):** `lib/diagnostics/rules.ts` + `diagnose.ts` + optional `ai-opinion.ts`, `POST/GET /api/ops/diagnostics/diagnose`, Diagnose button in `/ops/diagnostics`. Rules-only works when AI is unconfigured. No Apply fix that writes code. See `docs/PHASE8_DIAGNOSIS.md`.

**P8-12 shipped:** allowlisted runtime heal in `lib/diagnostics/runtime-heal.ts`, `POST/GET /api/ops/diagnostics/repair/runtime`, Runtime actions panel (propose then confirm). Actions: `db.circuit_reset`, `db.pool_recycle`, `health.recheck`, `job.requeue`, `cache.flush`. Audited. Trust/fee ledgers untouched. See `docs/PHASE8_RUNTIME_HEAL.md`.

**P8-13 shipped:** patch proposals in `lib/diagnostics/patch-proposals.ts`, `POST/GET/PATCH /api/ops/diagnostics/repair/propose`, markdown under `docs/diagnostics/proposals/`, Proposals tab (Reject / Mark applied / Mark rolled back). Verify hook on applied. No write-to-src button. See `docs/PHASE8_PATCH_PROPOSALS.md`.

**Phase 8 closed (P8-14):** `docs/PHASE8_RUNBOOK.md`, pointer in `docs/cloud/OPS_RUNBOOK.md`, `npm run smoke:phase8`, regression notes for dashboard chart labels and finance invoicing `.panel-body` scroll. Ready: Phase 8 complete. Next remains Phase 6B payroll unless partners say otherwise.

---

## 12. Regression note

Dashboard KPI overflow clip and lawyer caseload chart labels (values above bars, labels under bars, `transform: none` after animation) were fixed before Phase 8. **Do not rebuild those screens.** P8-10 and P8-14 add detectors and smoke notes. Fix CSS only if a detector proves the old bug is back.

Also keep: schema mismatch ≠ connectivity (`lib/db/connectivity.ts`). Health and rules must surface "run `npm run db:migrate`" rather than "database unreachable" when SQLSTATE is `42703`.

---

## 13. Migration stance

- Additive tables: `diagnostic_events`, `diagnostic_spans`, `diagnostic_diagnoses`, `diagnostic_repair_actions` (**P8-02 shipped:** `drizzle/migrations/0025_phase8_diagnostics.sql`, `docs/PHASE8_SCHEMA.md`).
- Platform-scoped. `firm_id` UUID only when a request is tenant-related.
- Do not reuse `audit_logs` for traces.
- Next SQL file after Phase 7: `0025_phase8_diagnostics.sql`.
- Product data from Phases 0 to 7 is untouched.

---

## 14. Success criteria (phase, not this prompt)

- Failed staff action shows a safe message plus a reference id.
- DevOps pastes that id in `/ops/diagnostics` and sees a redacted timeline.
- Health distinguishes unreachable DB from pending migrations.
- Trust receipt and fee payment are different workflows.
- Diagnose never exposes client secrets.
- Runtime heal cannot post trust or fees.
- No button silently edits production source.
- Login, invoicing, matters, and reports still work as in Phase 7.

---

*End of Phase 8 ADR (P8-01).*
