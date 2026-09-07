# Phase 11 manual test (partner checklist)

Use this after P11-01 to P11-11 are on the local build. Do **not** push until these pass (or partner explicitly accepts known limits).

## 1. Client visibility

1. Login as an **associate** (no `clients.view_all`).
2. Open Clients: only assigned clients appear.
3. Open Finance → Client accounts: same scope (assigned only), unless they also have `finance.view_all_client_accounts`.
4. Login as **Managing Partner**: all clients and all client accounts.
5. Grant `clients.view_all` to a senior partner; re-check they see the full client list.

## 2. Payments: $500 trust split (one receipt)

1. Finance → Payments → New payment.
2. Destination: trust bank (or trust vault). Amount **500**. Client + matter selected.
3. Allocation lines:
   - Fee revenue / consultation: **250** (invoice optional).
   - Trust hold or disbursement float: **250**.
4. Save. Confirm **one** cash receipt number (e.g. PAY-####).
5. Finance → Trust: client balance up by net trust remaining (250 hold/float path); fee portion left trust via disbursement with fee GL / retainer apply, not a second cash deposit.
6. Finance → Client accounts → that client: intake listed once; trust and fees sides match the split.
7. Invoicing: if linked to an invoice, balance reduced via retainer apply / fee path without a duplicate fee cash receipt for the same cash.

## 3. Fees-only receipt

1. Payments → New payment → destination **fee bank**, amount **150**, consultation fee line.
2. Confirm **no** trust ledger movement.
3. Fee receipt / fee GL appears; Client accounts fee paid increases.

## 4. Business requisition → Expenses

1. Finance → Requisitions → New → type **Business**, amount and nature/category.
2. Submit → approve (as approver) → Pay from **operating**.
3. Finance → Expenses: row appears (notes reference the requisition). Status on requisition = Paid.

## 5. Disbursement requisition → matter

1. Requisitions → New → type **Disbursement**, Client then Matter, amount.
2. Approve → Pay from **trust** (with enough balance) or firm float if shortfall policy allows.
3. Matter → Costs / disbursements: new disbursement appears.
4. If paid from trust: Trust ledger shows disbursement; Client accounts unbilled/trust history updates.
5. If firm float / recoverable: Requisitions filter Recoverable; Client accounts shows recoverable; settle when topped up.

## 6. Staff notify (smoke)

1. Set Account → Communication email (or rely on login email).
2. Assign a firm task: assignee gets in-app notification; email attempt via firm SMTP (or logged failure without rolling back the assign).
3. Submit invoice / requisition / leave for approval: approvers notified in-app (+ email attempt).

## 7. Commission numbers

1. Finance → Commission: set monthly target **3000**, percent **25**, Save.
2. Ensure a lawyer has **4000** collected fee cash in the selected calendar month (fee_payments attributed to their matters).
3. Confirm: remaining **0**, above **1000**, commission due **250**.
4. Reports → Lawyer performance: set From/To to that same month → commission columns overlay.

## 8. Cross-desk links

From Trust, Invoicing, Expenses, Payments, Requisitions, and Client accounts: confirm Payments / Client accounts / Trust / Expenses links open the expected panels (no leftover placeholders).

## Consistency notes (agent verified)

- One Payment intake = one cash event; trust receipt + fee allocation does not double-count cash.
- Business pay → `createFirmExpense`; disbursement pay → `createDisbursement` (+ trust debit when paid from trust).
- Trust deposits and disbursements never count as commission revenue.

## Smoke scripts (dev)

Run from the lexzim repo root (no DB required for these):

```bash
npx tsx scripts/check-client-visibility.ts
npx tsx scripts/check-trust-shortfall-policy.ts
npx tsx scripts/check-commission-formula.ts
```

Browser / partner acceptance remains `docs/PHASE11_MANUAL_TEST.md` (this file).
