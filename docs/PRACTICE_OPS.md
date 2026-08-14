# Phase 3 practice-ops schema (P3-01)

Firm-scoped tables for calendar, billing, and trust. **No payment gateways.** Money amounts use **integer cents** (`*_cents`) plus a currency code.

## Rule

Every firm-scoped query MUST filter `firm_id` from the session.

## Tables

### Calendar

| Table | Purpose |
|---|---|
| `calendar_events` | Hearings, appointments, filings, diary |
| `deadline_templates` | Offset templates (e.g. +14 days) |
| `matter_deadlines` | Matter-linked deadlines (optional calendar link) |

### Billing (fees)

| Table | Purpose |
|---|---|
| `time_entries` | Billable / non-billable time per matter / user |
| `disbursements` | Matter costs |
| `invoices` | draft → sent → paid → overdue → void |
| `invoice_lines` | Line items |
| `fee_payments` | Fee receipts against invoices |

### Trust (separate from fees)

| Table | Purpose |
|---|---|
| `trust_accounts` | Trust book / bank accounts |
| `trust_ledger_entries` | Trust receipts / disbursements / transfers / adjustments |

**Never mix** `trust_ledger_entries` balances with `fee_payments`.

### Firm settings (existing KV)

`firm_settings` already exists. Phase 3 keys:

| Key | Purpose |
|---|---|
| `default_currency` | Firm default (also `firms.default_currency`) |
| `invoice_prefix` | e.g. `INV` |
| `next_invoice_number` | Sequence |
| `invoice_due_days` | Default due offset |

Constants: `lib/repos/firm-settings.ts`, `lib/db/ops-types.ts`.

## Permissions (matrix)

Already in `lib/rbac/matrix.ts` (seed with `npm run db:seed:rbac`):

| Permission | MP | Senior | Junior | Secretary | Accounts |
|---|---|---|---|---|---|
| `calendar.view` | ✓ | ✓ | ✓ | ✓ | |
| `calendar.manage` | ✓ | ✓ | ✓ | ✓ | |
| `billing.view` | ✓ | ✓ | | | ✓ |
| `billing.manage` | ✓ | ✓ | | | ✓ |
| `trust.view` | ✓ | ✓ | | | ✓ |
| `trust.manage` | ✓ | | | | ✓ |
| `reports.view` | ✓ | ✓ | | | ✓ |

## Code

- Migration: `drizzle/migrations/0005_phase3_practice_ops.sql`
- Schema: `lib/db/schema.ts`
- Types: `lib/db/ops-types.ts`
- Repos: `lib/repos/calendar.ts` (events CRUD), stubs in `billing.ts`, `trust.ts`
- Calendar UI: `docs/CALENDAR.md`, `/calendar`, `/api/calendar`
- Deadlines: `docs/DEADLINES.md`, Settings templates, matter Deadlines tab
- Reminders: `docs/REMINDERS.md`, `/reminders`, topbar bell, optional browser alerts
- Time: `docs/TIME.md`, matter Time tab, `/api/matters/[id]/time-entries`
- Disbursements: `docs/BILLING.md`, matter Costs tab (fee side ≠ trust)
- Invoices: `/billing`, fee notes from unbilled time/costs, fee payments (not trust)
- Trust: `docs/TRUST.md`, `/trust` (separate from billing)
- Reports: `docs/REPORTS.md`, `/reports`, `/api/reports/[type]` (+ CSV)
- Dashboard: `docs/DASHBOARD.md`, role-aware money widgets; invoice matter access hardened
- Handoff: `docs/PHASE3_SMOKE_TEST.md`, `docs/ARCHITECTURE_PHASE3.md`, `docs/PHASE4_READY_CHECKLIST.md`

## Next

**PHASE 3 COMPLETE — ready for Phase 4 prompts (Sell & Ship: production AI, licensing, onboarding, pilots on Railway)**

Open `PHASE 4 - Sell & Ship Prompts.md`. Do not implement Phase 4/5 under Phase 3 prompts.

