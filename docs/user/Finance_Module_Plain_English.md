# Finance module in plain English

LexZim Finance is the firm’s money desk. It keeps **client money** and **firm money** apart.

## The golden rule

| Kind of money | Whose money | Where it lives in LexZim |
|---|---|---|
| Trust | The client’s | Trust bank or Trust vault |
| Fees | The firm’s | Fee bank (Operating Bank) or Business Cash Book |
| Operating spend | The firm’s | Expenses, petty cash, disbursement float, creditors |

Never put firm fees into Trust vault. Never treat trust cash as firm profit.

## Firm cash accounts

Every firm cash balance comes straight from the general ledger, so each page and dashboard shows the same figure.

| Account | GL code | What it is |
|---|---|---|
| Operating Bank | 1010 | The firm bank account |
| Business Cash Book | 1020 | Firm cash on premises, mainly cash fee receipts |
| Petty Cash | 1050 | Small office cash for minor expenses |
| Disbursement Float | 1060 | Firm money that covers client disbursements when trust is short |

Cash accounts (cash book, petty cash, float) can never be paid out beyond what they hold.

## Menu map (what each page does)

1. **Invoicing:** create fee notes (bills) for work done. Record payments against those bills.
2. **Quotations:** price work before it starts; convert a quote into an invoice when accepted.
3. **Debtors:** who still owes the firm for fees, and how overdue they are.
4. **Trust:** client money held for clients. Receipts, payments, vault cash, statements.
5. **Receipts / Receivables:** one place to record money that just arrived and split it:
   - Trust bank: client money into the trust bank account
   - Trust vault: client cash still in the office trust safe
   - Fee bank: firm fees already banked (or treated as banked)
   - **Business Cash Book: firm fees paid in cash, still in the office (not trust)**
6. **Client accounts:** one client’s full money picture: trust, fees, disbursements, receipts.
7. **Requisitions:** ask to spend. Business spend goes to firm expenses. Client disbursements come from trust first, and the disbursement float covers any shortfall.
8. **Disbursement float:** the float balance, a "Top up to $400" button for the monthly top-up, and every float movement.
9. **Business Cash Book:** the cash book balance and every movement in and out, with a running balance.
10. **Petty cash:** record small cash spends (each one becomes a firm expense). Top up through Funds transfer.
11. **Funds transfer:** move firm money between the Operating Bank, Business Cash Book, Petty Cash and Disbursement Float. Only the Managing Partner can take money out of the float or reverse a transfer, and a reason is required.
12. **Reconciliations:** match LexZim balances to bank and vault counts.
13. **Expenses & bank register:** firm running costs, and a memo register for matching the business bank statement.
14. **Creditors:** supplier bills the firm must pay.
15. **Commission:** bonus on collected fee revenue above a monthly target (not payroll).
16. **General ledger:** the double-entry books behind everything.
17. **Finance reports:** weekly and monthly packs for the Managing Partner.

## Receipt destinations (simple)

When cash or a transfer comes in:

- Client money: **Trust bank** or **Trust vault**
- Firm fees already in the bank: **Fee bank**
- Firm fees paid as cash and still in the drawer or safe: **Business Cash Book**

The Business Cash Book is firm revenue cash on hand. It is **not** client trust and **not** petty cash.

## How receipts post in the books

- Fee bank: Operating Bank (GL **1010**)
- Business Cash Book: GL **1020**
- Both credit fee revenue. Neither touches the trust ledger.

## Disbursement float rules

- The float is topped back up to $400 every month, from the Operating Bank or the Business Cash Book.
- Client disbursements are paid from the client’s trust balance first; the float covers a shortfall.
- Recoveries from the client go back into the float.
- At the Managing Partner’s discretion, excess can be moved back to the cash book or bank.

## Typical day

1. Client pays fees in cash: **Receipts / Receivables, Business Cash Book** destination, fee revenue line, one receipt.
2. Client pays a deposit for costs: **Receipts / Receivables, Trust vault** (or Trust bank if already deposited).
3. Office needs small cash: **Funds transfer** from Business Cash Book to Petty Cash, then **Petty cash, Record spend** for each purchase.
4. Banking fee cash: **Funds transfer** from Business Cash Book to Operating Bank.
5. Check **Client accounts** if you need the full picture for one client.
6. Week end: **Debtors**, **Reconciliations**, **Finance reports**.

More detail: `Finance_Desk_Quickstart.md`, `Finance_Phase11_Guide.md`, `Billing_Trust_Quickstart.md`.
