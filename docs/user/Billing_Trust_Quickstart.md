# Billing and trust quickstart

Two money worlds in LexZim. Keep them separate.

| | Billing (fees) | Trust |
|--|----------------|-------|
| Purpose | Fee notes, time, disbursements, fee receipts | Client money held in trust |
| Menu | **Billing** | **Trust** |
| Example | Fee note for professional fees | Deposit from client into trust account |

Recording a **fee payment** does **not** post to trust. Posting a **trust receipt** does **not** mark a fee note paid.

## Firm setup (once)

**Settings → Firm profile** (Managing Partner):

- Default currency
- Invoice prefix (for example `INV` or your firm initials)
- Invoice due days

## Fees: from work to fee note

1. On a **matter**, capture billable **time** (with rate) and fee-side **costs**.
2. Open **Billing → New from unbilled** (or your firm’s equivalent flow) for that matter.
3. Review the **draft** fee note, then mark it **sent** when ready.
4. Record **fee payments** against the fee note until it is paid.
5. Use **Print** on the fee note when you need a paper or PDF copy from the browser.

Voiding a draft or unused note can unlock source time and costs for re-billing. Ask Accounts if unsure.

## Trust: client money

Open **Trust**.

- Maintain trust **accounts** and balances.
- Post **receipts** (money in), **disbursements** (money out for the client), **transfers**, or careful **adjustments**.
- Open a **client statement** when you need a running balance for the client.

By default, LexZim rejects a trust debit that would put the **client** trust balance below zero. Override only when policy and permission allow (audited).

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

**Reports** (if permitted) includes fee and trust summaries and CSV export for management review.
