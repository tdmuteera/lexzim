# Phase 6 Finance & HR schema

**Migration:** `drizzle/migrations/0014_phase6_finance_hr.sql`  
**Drizzle:** `lib/db/schema.ts` (Phase 6 section)  
**ADR:** `docs/FINANCE_HR_ADR.md`

All new tables are **additive**. Existing Phase 3 tables (`invoices`, `fee_payments`, `trust_accounts`, `trust_ledger_entries`) are unchanged except `trust_accounts.account_kind`.

---

## Apply migration

```bash
npm run db:migrate
```

On Supabase/Railway, run the same migration against the project database before deploying UI that depends on these tables.

---

## Trust depth

### `trust_accounts` (altered)

| Column | Type | Notes |
|--------|------|-------|
| `account_kind` | text | `bank` (default) or `vault` |

Existing rows default to `bank`. Create a vault account with `account_kind = 'vault'` for master trust cash.

### `trust_vault_bank_ins`

Audit record when cash trust is banked into the master trust bank account.

| Column | Purpose |
|--------|---------|
| `vault_account_id` | Source vault trust account |
| `bank_account_id` | Destination bank trust account |
| `client_id` | Optional client tag when banking client-specific cash |
| `amount_cents`, `currency`, `occurred_at` | Movement details |
| `reference`, `narrative` | User notes |
| `created_by` | Poster |

Posting logic in P6-07 will also create matching `trust_ledger_entries` transfers.

### `trust_vault_counts`

Vault count worksheet: system balance vs physical count.

| Column | Purpose |
|--------|---------|
| `system_balance_cents` | Book balance at count time |
| `counted_balance_cents` | Physical count |
| `variance_cents` | counted minus system (stored) |

### `finance_reconciliation_runs`

Monthly (or ad hoc) reconciliation header. Supports trust bank three-way, vault, and business bank lite.

| Column | Purpose |
|--------|---------|
| `recon_type` | `trust_bank` \| `trust_vault` \| `business_bank` |
| `period_year`, `period_month` | UTC accounting period |
| `trust_account_id` | Set for trust recons |
| `bank_account_label` | Label for business operating account |
| `statement_balance_cents` | External statement or counted balance |
| `ledger_balance_cents` | LexZim book balance |
| `variance_cents` | statement minus ledger |
| `status` | `draft` \| `completed` |
| `override_reason` | MP override when completing with non-zero variance |
| `completed_by`, `completed_at` | Sign-off |

Line-level attachments deferred to a later prompt.

---

## Firm finance (not trust)

### `firm_expenses`

Firm operating expenses only.

| Column | Purpose |
|--------|---------|
| `expense_date` | When incurred/paid |
| `category` | Controlled string (see below) |
| `payee` | Vendor/payee name |
| `amount_cents`, `currency` | Amount |
| `matter_id` | Optional matter allocation |
| `payment_method` | e.g. cash, bank transfer, card |
| `notes` | Free text |

**Suggested categories (app validation, not DB enum):**  
`rent`, `utilities`, `software`, `travel`, `office`, `professional`, `salaries_placeholder`, `other`

`salaries_placeholder` is a label until Phase 6B payroll posts real salary expenses.

### `business_cashbook_entries`

Firm money in/out (operating account cashbook).

| Column | Purpose |
|--------|---------|
| `entry_type` | `in` \| `out` |
| `entry_date`, `amount_cents`, `currency` | Line details |
| `reference`, `bank_account_label` | Bank reference and label |
| `expense_id` | Optional link to expense |
| `fee_payment_id` | Optional link to fee receipt |

Never link to `trust_ledger_entries`.

### `finance_period_locks`

One row per firm per UTC month when closed.

| Column | Purpose |
|--------|---------|
| `period_year`, `period_month` | Unique per firm |
| `locked_by`, `locked_at` | Who closed the month |

App layer blocks new expense/cashbook/trust posts in locked periods (P6-10).

---

## HR (no payroll)

### `hr_staff_profiles`

HR directory row. `user_id` optional for staff without LexZim login.

| Column | Purpose |
|--------|---------|
| `user_id` | Link to `users` when they have login |
| `full_name` | Required display name |
| `job_title`, `department`, `start_date`, `end_date` | Employment |
| `emergency_contact_*` | Emergency contact |
| `is_active` | Active flag |

Unique `(firm_id, user_id)` when user is linked. Multiple profiles with `user_id` null allowed (non-login staff).

**Migration note:** Existing `/staff` users are not auto-imported. P6-12 may offer “create HR profile from user” action.

### `hr_contracts`

| Column | Purpose |
|--------|---------|
| `staff_profile_id` | Owner |
| `title`, `start_date`, `end_date` | Contract terms |
| `status` | `draft` \| `active` \| `expired` \| `terminated` |
| `contract_document_name`, `contract_document_path` | Optional file (Supabase Storage path in P6-12) |

No FK to `documents` (matter-scoped). Firm HR bucket path TBD in P6-12.

### `hr_leave_types`

Per-firm leave type catalog. Seed defaults in P6-13: `annual`, `sick`, `unpaid`, `other`.

### `hr_leave_requests`

| Column | Purpose |
|--------|---------|
| `staff_profile_id`, `leave_type_id` | Who and what |
| `from_date`, `to_date` | Leave window |
| `status` | `requested` \| `approved` \| `rejected` \| `cancelled` |
| `approver_user_id`, `approved_at` | Approval audit |
| `notes`, `decision_notes` | Request and decision text |

---

## Preserved Phase 3 money tables

| Table | Phase 6 impact |
|-------|----------------|
| `invoices`, `invoice_lines` | Unchanged |
| `fee_payments` | Unchanged; linkable from cashbook |
| `trust_accounts` | +`account_kind` |
| `trust_ledger_entries` | Unchanged |
| `time_entries`, `disbursements` | Unchanged |

---

## Tenancy rule

Every query on Phase 6 tables **must** filter `firm_id` to the session firm. Never accept client-supplied `firm_id` without session match.

---

## Next prompt

**P6-03:** Finance nav shell + RBAC (`finance.*`, `hr.*` permissions).
