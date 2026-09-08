# Finance module in plain English

LexZim Finance is the firm’s money desk. It keeps **client money** and **firm money** apart.

## The golden rule

| Kind of money | Whose money | Where it lives in LexZim |
|---|---|---|
| Trust | The client’s | Trust bank or Trust vault |
| Fees | The firm’s | Fee bank or Fee vault |
| Operating spend | The firm’s | Expenses, petty cash, creditors |

Never put firm fees into Trust vault. Never treat trust cash as firm profit.

## Menu map (what each page does)

1. **Invoicing** — Create fee notes (bills) for work done. Record payments against those bills.
2. **Quotations** — Price work before it starts; convert a quote into an invoice when accepted.
3. **Debtors** — Who still owes the firm for fees, and how overdue they are.
4. **Trust** — Client money held for clients. Receipts, payments, vault cash, statements.
5. **Payments** — One place to record money that just arrived and split it:
   - Trust bank: client money into the trust bank account
   - Trust vault: client cash still in the office trust safe
   - Fee bank: firm fees already banked (or treated as banked)
   - **Fee vault: firm fees paid in cash, still in the office (not trust)**
6. **Client accounts** — One client’s full money picture: trust, fees, disbursements, receipts.
7. **Requisitions** — Ask to spend. Business spend goes to firm expenses. Client disbursements can come from trust or firm float.
8. **Reconciliations** — Match LexZim balances to bank and vault counts.
9. **Expenses & cashbook** — Firm running costs and the business bank book.
10. **Petty cash** — Small firm float for day-to-day spends (not fee vault, not trust).
11. **Creditors** — Supplier bills the firm must pay.
12. **Commission** — Bonus on collected fee revenue above a monthly target (not payroll).
13. **General ledger** — The double-entry books behind everything.
14. **Finance reports** — Weekly and monthly packs for the Managing Partner.

## Payments destinations (simple)

When cash or a transfer comes in:

- Client money → **Trust bank** or **Trust vault**
- Firm fees already in the bank → **Fee bank**
- Firm fees paid as cash and still in the drawer/safe → **Fee vault**

Fee vault is firm revenue cash on hand. It is **not** client trust and **not** petty cash.

## How Fee vault posts in the books

- Fee bank → Operating Bank (GL **1010**)
- Fee vault → Business Vault (GL **1020**)
- Both credit fee revenue. Neither touches the trust ledger.

## Typical day

1. Client pays fees in cash → **Payments → Fee vault** → fee revenue line → one receipt.
2. Client pays a deposit for costs → **Payments → Trust vault** (or Trust bank if already deposited).
3. Later, bank the fee cash → operating bank / cashbook process (separate from trust vault bank-in).
4. Check **Client accounts** if you need the full picture for one client.
5. Week end: **Debtors**, **Reconciliations**, **Finance reports**.

More detail: `Finance_Desk_Quickstart.md`, `Finance_Phase11_Guide.md`, `Billing_Trust_Quickstart.md`.
