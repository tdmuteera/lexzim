# Finance desk quickstart (Phase 6 + Phase 7 GL)

LexZim **Finance** is the practice money desk: fee invoicing, debtors, client trust, reconciliations, firm expenses, business cashbook, quotations, petty cash, creditors, and a **double-entry general ledger**. **Trust and fees stay separate.**

Payroll is **not** in Phase 6 or Phase 7. See Phase 6B handoff (`docs/PHASE6B_PAYROLL_HANDOFF.md`).

Phase 6 deferred a full GL. **Phase 7 supersedes that**: chart of accounts, journals, trial balance, P&L, and balance sheet are live. See `Finance_Phase7_Guide.md` and `docs/PHASE7_ADR.md`.

## Finance menu map

| Section | Path | What it is |
|---------|------|------------|
| Invoicing | `/finance/invoicing` (alias `/billing`) | Fee notes, time, disbursements, **fee payments** |
| Quotations | `/finance/quotations` | Service catalogue, quotes, convert to invoice |
| Debtors | `/finance/debtors` | Outstanding fee invoices with **due-date ageing** |
| Trust | `/finance/trust` (alias `/trust`) | Client trust ledgers, vault, statements, reference numbers |
| Reconciliations | `/finance/reconciliations` | Trust three-way and business bank recon |
| Expenses & cashbook | `/finance/expenses` | Firm operating costs and business bank cashbook |
| Petty cash | `/finance/petty-cash` | Float, vault transfers, spends |
| Creditors | `/finance/creditors` | Supplier bills, payments, AP ageing |
| General ledger | `/finance/gl` | COA, journals, trial balance, P&L, balance sheet |
| Finance reports | `/finance/reports` | Weekly pack, monthly close, cash P&L, KPIs |

Operational reports (time, workload, lawyer performance) remain under **Reports** (`/reports`) for permitted roles.

## Fees vs trust (always)

| | Fees (invoicing) | Trust |
|--|------------------|-------|
| Money | Firm professional fees | Client money held for clients |
| Receipt | **Fee payment** on a fee note | **Trust receipt** on client ledger |
| Never | Post fee receipt to trust | Post trust movement as fee payment |

See also `Billing_Trust_Quickstart.md` and `Finance_Trust_Quickstart.md`.

## Invoicing and debtors

1. Capture billable time and costs on the matter.
2. **Finance → Invoicing → New from unbilled** to create a draft fee note.
3. Mark **sent** when issued; record **fee payments** when the client pays the firm.
4. **Finance → Debtors** for weekly collections: ageing buckets use **due date** (current, 1 to 30, 31 to 60, 61 to 90, 90+ days past due).

## Trust, vault, and client ledgers

- **Master trust bank**: normal trust account in the bank.
- **Trust vault**: physical cash held before banking into the master trust bank.
- Each client has a running balance on the trust ledger (receipts and payments).
- Client statement CSV export is available from the trust desk.

Details: `Finance_Trust_Quickstart.md`, `Finance_Trust_Recon_SOP.md`.

## Reconciliations

**Trust (three-way):** bank statement balance vs LexZim book balance vs sum of client ledgers on that account. Complete the run when variance is zero (Managing Partner override if policy allows).

**Vault:** physical count vs vault book balance.

**Business bank:** business operating cashbook book balance vs bank statement (firm money, not trust).

Path: **Finance → Reconciliations**.

## Firm expenses and business cashbook

**Firm money only.** Never record client trust or fee invoices here.

- **Expenses:** operating costs (rent, stationery, etc.) by category.
- **Cashbook:** money in and out of the **business operating account** (fee payments received can be linked).
- Book balance shown on the expenses desk; compare to completed business bank recon.

Locked finance months block new expenses and cashbook entries dated in that month.

## Finance reports and KPIs

**Finance → Reports:**

- **Weekly pack:** debtors, outstanding invoices, trust snapshot, business bank book vs last recon.
- **Monthly close:** recon summary, expenses, simple **P&L** (fee income = payments received in month minus expenses dated in month).
- **Finance KPIs:** billed vs collected, ageing buckets, cash positions, profit, matters opened/closed.
- **Lock period** when month-end is complete (`finance.close_month` permission).

Managing Partners with finance access also see a compact KPI strip on the **Dashboard**.

CSV export on weekly and monthly packs. GL statements export as PDF, Word, and Excel (`Finance_Phase7_Guide.md`).

## Permissions (typical)

| Permission | Typical use |
|------------|-------------|
| `billing.view` / `billing.manage` | Invoicing, debtors |
| `trust.view` / `trust.manage` | Trust desk |
| `finance.view` | Debtors desk extras, expenses view, reports |
| `finance.post` | Expenses and cashbook entries |
| `finance.reconcile` | Reconciliation workflows |
| `finance.close_month` | Lock accounting period |
| `finance.gl.view` / `finance.gl.post` | Chart of accounts, journals, financial statements |
| `finance.quote.manage` | Quotations and service catalogue |

Accounts and Managing Partner usually hold finance permissions. Lawyers typically see matters and documents without full finance menus.

## HR (separate from User access)

Staff employment records, contracts, and leave live under **Firm → HR**. Platform logins and roles live under **User access** (`/staff`).

See `HR_Quickstart.md`.

## Related docs

- `Billing_Trust_Quickstart.md`
- `Finance_Trust_Quickstart.md`
- `Finance_Trust_Recon_SOP.md`
- `Finance_Phase7_Guide.md` (quotes, GL, creditors, petty cash)
- `Email_Setup.md`
- `Admin_Guide.md` (month-end checklist)
- `FINANCE_HR_ADR.md` (architecture)
