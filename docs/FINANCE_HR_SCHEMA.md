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

## HR (leave + payroll MVP)

Payroll MVP and salary advances ship in Phase 10 (P10-10). Full statutory payroll remains deferred (Phase 6B).

### `hr_staff_profiles`

Linked optionally to `users`. Phase 10: every normal system login gets a profile stub (unless `users.is_test_user`).

| Column group | Notes |
|---|---|
| Identity | `full_name`, `email`, `phone`, `employee_number`, `id_passport`, `work_location` |
| Role at work | `job_category` (Managing Partner / Partner / Senior Associate / Junior Associate / Attorney / custom), `job_title`, `department` |
| Employment | `start_date`, `end_date`, `is_active`, leave entitlement |
| Next of kin | `nok_*` (+ legacy `emergency_contact_*` mirrored from NOK) |
| Salary stubs | `gross_salary_cents`, `net_salary_cents` (for advances / payroll MVP) |

Lawyer pickers use `users.is_lawyer` (directory lawyers without login kept). Lawyer job categories default that flag on when saving a linked profile.

**Migration:** `0039_employee_spine.sql` backfills profiles for existing system users.

Unique `(firm_id, user_id)` when user is linked. Multiple profiles with `user_id` null allowed (non-login staff).

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

### `hr_leave_entitlements` (P10-10)

Per employee / leave type / year entitlement. Ledger APIs compute used / pending / remaining from requests. Approvals are discretionary (`leave.approve` or `hr.manage`).

### `hr_salary_advances` (P10-10)

T Pfigu salary advance form fields. Status: `submitted` → `finance_reviewed` (optional) → `decided` → `paid` → `closed`. Decision: `approved` | `approved_subject_to_amendment` | `not_approved`. `balance_remaining_cents` drives payroll recovery. Approval of salary advances is discretionary (`payroll.advance.approve` or `hr.manage`).

### `hr_payroll_periods` / `hr_payroll_lines` (P10-10)

Payroll MVP (not statutory PAYE/NSSA). Period header + per-staff lines: gross, advances outstanding, deductions, net payable. Marking a line paid reduces linked advance balances.

**Migration:** `0040_leave_advances_payroll.sql`.

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
