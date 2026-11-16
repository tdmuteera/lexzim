# Bank inbox (statement CSV import)

QuickBooks-style **bank inbox** for LexZim: upload a statement CSV, match lines to books, or post business expenses. Complements `/finance/reconciliations` (period three-way / statement balance). **No live Open Banking feed.**

## What it does

| Account | Match | Post from CSV |
|---|---|---|
| Business operating bank | Cashbook, firm expenses, fee payments | Expense (+ cashbook out) or cashbook in |
| Trust bank | Existing trust ledger lines only | **Never** invents client-tagged trust receipts |

Rules can **ignore** or **suggest** expense category / payee. Rules do not auto-post trust money.

## Permissions

`finance.reconcile` (same as Reconciliations).

## UI / API

- UI: `/finance/bank-inbox`
- `GET/POST /api/finance/bank-inbox`
- `GET/POST /api/finance/bank-inbox/[id]` (detail; `action: close`)
- `GET/POST /api/finance/bank-inbox/lines/[lineId]` (`match`, `ignore`, `post_expense`, `post_cashbook_in`)
- `GET/POST /api/finance/bank-inbox/rules` and `PATCH/DELETE …/rules/[id]`

## CSV shapes accepted

Header row required. Columns (aliases supported):

- **Date** (YYYY-MM-DD or DD/MM/YYYY)
- **Description** / Particulars / Narrative
- **Amount** (signed; negative = money out), **or** Debit + Credit / Money out + Money in
- Optional **Reference**

Duplicate lines (same firm + account + date + description + amount) are skipped via `raw_hash`.

## Migration

`0059_bank_statement_inbox` — tables `bank_statement_imports`, `bank_statement_lines`, `bank_match_rules` with RLS enabled (Data API still locked down).

```bash
npx drizzle-kit migrate
# or
RELEASE_MIGRATE=1 npm run security:release-gate
```

## Related

- `docs/FINANCE_HR_ADR.md` (bank feeds out of scope; this is manual CSV)
- `/finance/reconciliations`, `/finance/cash-book`, `/finance/trust`
