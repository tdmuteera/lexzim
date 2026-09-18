# Phase 11 Finance depth schema

**Migration:** `drizzle/migrations/0045_phase11_finance_depth.sql`  
**Drizzle:** `lib/db/schema.ts` (Phase 11 section)  
**ADR:** `docs/PHASE11_ADR.md`

All tables are **additive**. Existing `trust_ledger_entries` and `fee_payments` are unchanged. Payment intakes orchestrate those ledgers; they do not replace them.

---

## Apply migration

```bash
npm run db:migrate
```

On Supabase/Railway, run the same migration before deploying UI that depends on these tables. Also run `npm run db:seed:rbac` (or rely on migration role_permissions inserts) so new permission codes exist.

---

## Tables

### `finance_payment_intakes`

One cash event (money received).

| Column | Notes |
|--------|-------|
| `destination` | `trust_bank` \| `trust_vault` \| `fee_bank` \| `fee_vault` |
| `amount_cents` | Full cash received |
| `receipt_number` | One cash-received receipt id |

### `finance_payment_allocation_lines`

Split of an intake. Sum of line amounts must equal intake amount (enforced in app).

| Column | Notes |
|--------|-------|
| `line_type` | `trust_hold` \| `fee_revenue` \| `disbursement_float` |
| `fee_category` | Used when `fee_revenue`: consultation, drafting, due_diligence, notarial, appearances, communications, correspondence, conveyancing, administration, other_fee |
| `invoice_id` | Optional link when applying to a fee note |

`disbursement_float` and `trust_hold` remain client trust liability. `fee_revenue` posts to fee side via billing/trust orchestration (see `docs/PHASE11_ADR.md` §15).

### `finance_requisitions`

| Column | Notes |
|--------|-------|
| `type` | `business` \| `disbursement` |
| `status` | `draft` \| `pending_approval` \| `approved` \| `rejected` \| `paid` \| `cancelled` |
| `client_id` / `matter_id` | Required for disbursement (app validation) |
| `paid_from` | `trust` \| `firm_float` \| `operating` |
| `recoverable` | True when firm float used for client cost |
| `expense_id` / `disbursement_id` | Links after pay |

### `staff_communication_emails`

Per-user outbound notify addresses (may differ from login email). Up to three rows per user; first marked `is_primary`. Unique on `(firm_id, user_id, email)`. All addresses for a person receive the same staff SMTP notification.

### `finance_commission_settings`

Firm monthly target (`monthly_target_cents`) and `commission_percent_above_target`. Basis is collected fee revenue only (app layer). Not payroll.

---

## Permissions seeded

| Code | Default roles (migration) |
|------|---------------------------|
| `clients.view_all` | MP, Accounts |
| `finance.view_all_client_accounts` | MP, Accounts |
| `finance.payments.view` / `create` | MP, Accounts (+ senior associate view) |
| `finance.requisitions.*` | MP full; Accounts view/request/approve/pay; associates/secretary view+request |
| `finance.commission.view` / `configure` | MP both; Accounts view |

Matrix defaults live in `lib/rbac/matrix.ts` and `lib/db/types.ts` (`PermissionCode`).

---

## Non-goals in this migration

- No UI
- No posting logic
- No merge of trust and fee ledgers
- `block_disbursement_if_trust_short` is a `firm_settings` key (P11-08), not a dedicated column
