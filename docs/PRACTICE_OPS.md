# Phase 3 practice-ops schema (P3-01)

Firm-scoped tables for calendar, billing, trust, and intake. **No payment gateways.** Money amounts use **integer cents** (`*_cents`) plus a currency code.

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

### Intake

| Table | Purpose |
|---|---|
| `intakes` | Structured prospects |
| `conflict_checks` | Search result before open |

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
| `intake.view` | ✓ | ✓ | ✓ | ✓ | |
| `intake.manage` | ✓ | ✓ | | ✓ | |
| `reports.view` | ✓ | ✓ | | | ✓ |

## Code

- Migration: `drizzle/migrations/0005_phase3_practice_ops.sql`
- Schema: `lib/db/schema.ts`
- Types: `lib/db/ops-types.ts`
- Repos: `lib/repos/calendar.ts` (events CRUD), stubs in `billing.ts`, `trust.ts`, `intake.ts`
- Calendar UI: `docs/CALENDAR.md`, `/calendar`, `/api/calendar`
- Deadlines: `docs/DEADLINES.md`, Settings templates, matter Deadlines tab

## Next

**P3-04:** Reminders center.
