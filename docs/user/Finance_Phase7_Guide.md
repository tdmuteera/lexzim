# Finance: quotations, GL, creditors, petty cash

Phase 7 adds a full general ledger on top of the Phase 6 finance desk. Fees and trust stay separate. Payroll is still Phase 6B (not in this guide).

See also `Finance_Desk_Quickstart.md` for invoicing, debtors, trust recon, expenses, and month close.

## Quotations

Path: **Finance → Quotations** (`/finance/quotations`).

1. Keep a **service catalogue** (default prices and revenue accounts) under the quotations desk.
2. Create a quote for a client. Add catalogue or ad hoc lines. Optional discount (amount or percent, not both).
3. Mark **sent**, then **accepted** when the client agrees.
4. **Convert to invoice** (sent or accepted quotes). A matter is required. The invoice inherits lines and discount.
5. Send the quote PDF from the quote page once firm email is configured (`Email_Setup.md`).

Quotes do not post to the GL until converted and the invoice is issued or paid.

## General ledger

Path: **Finance → GL** (chart of accounts, journals, trial balance, P&L, balance sheet). Permission: `finance.gl.view` (post: `finance.gl.post`).

| Statement | Use |
|-----------|-----|
| Chart of accounts | 4-digit bands (1000 assets, 2000 liabilities, 2100 trust liability, 4000 revenue, 6000 to 9000 expenses) |
| Trial balance | Debits equal credits as of a date |
| Profit and loss | Includes gross profit (fees minus direct client costs) |
| Balance sheet | Assets, liabilities, equity as of a date |

Fee invoices, fee payments, trust movements, petty cash, and creditor bills post **balanced journals**. Export any statement as PDF, Word, or Excel from the report page.

If cash collections by lawyer differ from GL revenue, Managing Partners with GL access see a variance note on lawyer performance. That is expected on a cash-basis dashboard versus accrual GL.

## Petty cash

Path: **Finance → Petty cash**. Permission: `finance.view` / `finance.post`.

1. **Open a float** (opening amount and date). One open float at a time.
2. **Transfer** from vault to petty (`vault_to_petty`) when you top up the tin.
3. Record **spend** against an expense account, or **return** unused cash.

GL: petty cash asset (1050) moves with the float and transfers. Spend posts the expense.

## Creditors (accounts payable)

Path: **Finance → Creditors**. Permission: `finance.view` / `finance.post`.

1. Add a creditor (supplier). Optional default expense account.
2. Record a **bill** (invoice date, amount, due date, expense account).
3. Record a **payment** when you pay the bill.
4. Review **AP ageing** on the creditors desk and export it.

GL: bill is Dr expense / Cr AP (2010). Payment is Dr AP / Cr operating bank.

## Trust on the GL

Trust receipts still live on **Finance → Trust**. They also credit **2100 Trust Liability** and debit trust bank (1210). Never post a fee receipt to trust.

Trust receipts carry a **reference number** (TR-0001 style). Use it on bank statements and the three-way recon.

## Exports

Use the **Export** menu on each report (PDF, Word, Excel; CSV where offered): debtors, trial balance, P&L, balance sheet, quotations, invoices, receipts, trust statements, petty cash, creditor ageing.

## Related

- `Finance_Desk_Quickstart.md` (daily desk)
- `Billing_Trust_Quickstart.md`
- `Admin_Guide.md` (month-end checklist)
- `Email_Setup.md` (send invoice / receipt / quote)
- `docs/FULL_ACCOUNTING.md` (technical)
