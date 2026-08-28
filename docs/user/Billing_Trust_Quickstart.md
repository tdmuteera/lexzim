# Billing and trust quickstart

Two money worlds in LexZim. Keep them separate.

For the full **Finance desk** (debtors, recon, expenses, reports), see `Finance_Desk_Quickstart.md`.

| | Billing (fees) | Trust |
|--|----------------|-------|
| Purpose | Fee notes, time, disbursements, fee receipts | Client money held in trust |
| Menu | **Finance → Invoicing** (alias `/billing`) | **Finance → Trust** (alias `/trust`) |
| Example | Fee note for professional fees | Deposit from client into trust account |

Recording a **fee payment** does **not** post to trust. Posting a **trust receipt** does **not** mark a fee note paid.

## Firm setup (once)

**Settings → Firm profile** (Managing Partner):

- Default currency
- Invoice prefix (for example `INV` or your firm initials)
- Invoice due days

## Fees: from work to fee note

1. On a **matter**, capture billable **time** (with rate) and fee-side **costs**.
2. Open **Finance → Invoicing → New from unbilled** for that matter.
3. Review the **draft** fee note. If the firm requires approval (default on), submit for approval, wait for **Approved**, then mark **sent**.
4. Line **work dates** are optional (ongoing work need not invent a date).
5. **Record payment** (Cash or Bank) against the fee note until it is paid. Each payment issues an **RCP** receipt you can download.
6. Fee payments update the invoice balance, debtors, and fee revenue. They do **not** post to trust.

### Invoice approval (short)

Draft → Pending approval → Approved (ready to send) → Sent → Partially paid / Paid. Rejected and Void remain available. Approvers use invoice approve rights or delegation. Send stays manual after approval.

### Debtor communication

On **Debtors**, log calls and notes (who contacted, channel, outcome, next follow-up) on the debtor timeline so collections history is shared.

### Payment → Receipt → Revenue (short)

**Payment** (cash at office or confirmed bank) → **fee receipt** (RCP number + download) → invoice balance / paid → **fee revenue**, debtors, dashboard. Trust stays separate.

Voiding a draft or unused note can unlock source time and costs for re-billing. Ask Accounts if unsure.

## Trust: client money

Open **Finance → Trust**. For trust overview, client ledgers, and statements see `docs/user/Finance_Trust_Quickstart.md`.

## Who can do what

| Permission area | Typical roles |
|-----------------|---------------|
| Billing view / manage | Managing Partner, Accounts (and others as configured) |
| Trust view / manage | Managing Partner, Accounts |

If a menu is missing, you do not have that permission. Ask your Managing Partner.

## Common mistakes to avoid

- Paying the firm’s fees from trust without a proper authorised trust payment and matching fee process your firm uses
- Treating disbursements on the fee note as trust movements
- Changing currency mid-stream without checking open balances and fee notes

## Reports

**Reports** (`/reports`) includes operational reports (time, workload) when permitted.

**Finance → Reports** includes weekly debtors pack, monthly close, P&L, and finance KPIs for Accounts and Managing Partner.

## HR

Employment records, contracts, leave ledger, salary advances, and payroll **MVP** are under **Firm → HR**, separate from **User access**. Full PAYE/NSSA remains Phase 6B. See `HR_Quickstart.md`.
