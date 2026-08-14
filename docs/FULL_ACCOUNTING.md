# Full accounting (Phase 7)

LexZim Phase 7 adds **double-entry general ledger** per firm on top of the Phase 6 finance desk. Trust and fee separation rules are unchanged; GL mirrors balances for reporting and future automated posting (P7-06+).

## Scope (P7-03)

| Area | Status |
|------|--------|
| Chart of accounts (`gl_accounts`) | Live; seeded per firm |
| Journal entries (`gl_journal_entries`, `gl_journal_lines`) | Live; manual posting |
| Trial balance | API + UI + export |
| Profit & loss (gross profit) | API + UI + export |
| Balance sheet | API + UI + export |
| Automated posting from invoices/trust/expenses | **Live (P7-06 + P7-07)** |

## Navigation

**Finance → Accounting**

- Chart of accounts
- Journal entries
- Trial balance
- Financial statements (P&L and balance sheet)

## Permissions

| Code | Purpose |
|------|---------|
| `finance.gl.view` | Read COA, journals, TB, financial statements; export |
| `finance.gl.post` | Post manual journals; create/disable non-system accounts |

Seeded for **Managing Partner** (all permissions) and **Accounts / Bookkeeper** role.

After matrix changes: `npm run db:seed:rbac`

## Chart of accounts seed

On first visit to Accounting (or first GL API call), LexZim seeds a default legal-style COA from the bookkeeper template:

| Band | Examples |
|------|----------|
| 1000 Assets | 1010 Operating bank, 1210 Trust bank, 1310 AR, 1320 Client cost advances |
| 2000 Liabilities | 2010 AP, 2100 Trust liability |
| 3000 Equity | 3010 Retained earnings |
| 4000 Revenue | 4010–4040 fee types, 4100 reimbursed costs |
| 5000 Direct costs | 5010–5030 matter-linked costs |
| 6000–9000 Operating expenses | Personnel, occupancy, practice overhead, G&A |

System accounts (`is_system = true`) cannot be deleted; they may be disabled only when not system (custom accounts).

## Posting rules

1. Every posted entry must balance: **sum(debits) = sum(credits)**.
2. Each line is debit **or** credit, not both.
3. Accounts must be active.
4. Postings are blocked when the entry date falls in a **locked finance period** (Phase 6 month-end close).
5. `source_type` on entries: `manual`, `invoice`, `payment`, `trust`, `expense`, `quote`, `opening` (automated types wired in later prompts).

## Financial statements

### Trial balance

As-of date: debit and credit column balances per account with non-zero activity.

### Profit and loss

Date range:

- Revenue (4000 band)
- Minus direct client costs (5000 band) = **gross profit**
- Minus operating expenses (6000–9000) = **net profit**

### Balance sheet

As-of date:

- Assets, liabilities, equity from posted journals
- **Current year earnings** computed from P&L (year start → as-of) and shown under equity

## Invoice and payment posting (P7-06)

Automated journals are created from fee invoicing (see `lib/gl/posting-invoices.ts`).

### Invoice sent

When a draft invoice is marked **sent**:

| Line type | Debit | Credit |
|-----------|-------|--------|
| Net amount | **1310 Accounts Receivable** | |
| Per line (earned fees) | | **401x** revenue (from `firm_services.revenue_gl_account_id` or line default) |
| Per line (disbursement recovery) | | **4100** Reimbursed client costs |
| Per line (REV-ADV retainer) | | **2100** Trust liability (not revenue until earned) |
| Invoice-level discount | **4050** Sales discounts (contra revenue) | |

Policy: discounts use contra account **4050 Sales Discounts** (debit normal balance under revenue band), not a direct revenue reduction. Gross revenue credits per line; discount debits 4050; AR debits net total.

### Fee payment

On each `fee_payments` record:

- **Debit 1010** Operating bank
- **Credit 1310** AR

Receipt number **RCP-0001** sequential per firm. Exports: PDF, Word, Excel.

### Apply retainer

Action on sent invoice with balance:

- **Debit 2100** Trust liability
- **Credit 1310** AR

### Void

Reversing journal posted when a previously sent invoice is voided.

## Exports

All four accounting views support **PDF, Word, and Excel** via the Phase 7 export engine:

| Export kind | Route |
|-------------|-------|
| Chart of accounts | `GET /api/export/gl_coa?format=pdf\|docx\|xlsx` |
| Trial balance | `GET /api/export/gl_trial_balance?asOf=…&format=…` |
| Profit and loss | `GET /api/export/gl_profit_and_loss?from=…&to=…&format=…` |
| Balance sheet | `GET /api/export/gl_balance_sheet?asOf=…&format=…` |

See `docs/EXPORTS.md` for registration pattern.

## API reference

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/finance/gl/accounts` | `finance.gl.view` |
| POST | `/api/finance/gl/accounts` | `finance.gl.post` |
| PATCH | `/api/finance/gl/accounts/[id]` | `finance.gl.post` |
| DELETE | `/api/finance/gl/accounts/[id]` | `finance.gl.post` (disables) |
| GET | `/api/finance/gl/journals` | `finance.gl.view` |
| POST | `/api/finance/gl/journals` | `finance.gl.post` |
| GET | `/api/finance/gl/trial-balance?asOf=` | `finance.gl.view` |
| GET | `/api/finance/gl/statements?kind=pl&from=&to=` | `finance.gl.view` |
| GET | `/api/finance/gl/statements?kind=balance_sheet&asOf=` | `finance.gl.view` |

## Schema

Migration: `drizzle/migrations/0017_phase7_gl.sql`

Tables (all `firm_id` scoped):

- `gl_accounts`
- `gl_journal_entries`
- `gl_journal_lines`

## Phase 6 → GL mapping

Fee invoice, payment, trust receipt/disbursement, firm expense, petty cash, AP bill/payment, and billable disbursement posting are **live**.

- Fee invoices → DR AR / CR revenue (or trust liability for retainer lines)
- Fee payments → DR cash / CR AR
- Trust receipt/disbursement → DR/CR 1210 and 2100
- Firm expenses → DR expense / CR 1010 or 1050
- Creditor bill → DR expense / CR 2010 AP
- Creditor payment → DR 2010 / CR 1010
- Billable disbursement → DR 1320 / CR 1010 or 1210

## Related

- `docs/PHASE7_ADR.md` — locked decisions and competitor UX notes
- `docs/FINANCE_HR_ADR.md` — Phase 6 desk (superseded for GL scope)
- `lib/gl/coa-seed.ts` — default account tree
